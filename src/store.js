import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

import { redactSecrets } from "./redact.js";
import { chunkContent, runWithSqliteRetry } from "./sqlite-retry.js";

export class TriagentStore {
  constructor(dbPath) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA busy_timeout = 10000;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        agent TEXT NOT NULL,
        cwd TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        task_packet TEXT NOT NULL,
        exit_code INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        finished_at TEXT
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        agent TEXT NOT NULL,
        stream TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS task_meta (
        task_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (task_id, key),
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_task_id ON events(task_id, created_at);
    `);
    this.ensureV04Columns();
  }

  createTask({
    mode,
    agent,
    cwd,
    title,
    taskPacket,
    status = "running",
    priority = 50,
    attempt = 1,
    maxAttempts = 2,
    routeAgent = agent,
    routeReason = "",
    riskLevel = "low",
    runAfter
  }) {
    const now = new Date().toISOString();
    const task = {
      id: randomUUID(),
      mode,
      agent,
      cwd,
      title,
      status,
      taskPacket: redactSecrets(taskPacket),
      priority,
      attempt,
      maxAttempts,
      routeAgent,
      routeReason,
      riskLevel,
      runAfter: runAfter || now,
      createdAt: now,
      updatedAt: now
    };
    this.write(() => {
      this.db
        .prepare(
          `INSERT INTO tasks
            (id, mode, agent, cwd, title, status, task_packet,
             priority, attempt, max_attempts, route_agent, route_reason, risk_level, run_after,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          task.id,
          task.mode,
          task.agent,
          task.cwd,
          task.title,
          task.status,
          task.taskPacket,
          task.priority,
          task.attempt,
          task.maxAttempts,
          task.routeAgent,
          task.routeReason,
          task.riskLevel,
          task.runAfter,
          task.createdAt,
          task.updatedAt
        );
    });
    return task;
  }

  appendEvent({ taskId, agent, stream, content }) {
    const now = new Date().toISOString();
    let firstEvent;
    for (const chunk of chunkContent(redactSecrets(content))) {
      const event = {
        id: randomUUID(),
        taskId,
        agent,
        stream,
        content: chunk,
        createdAt: now
      };
      this.write(() => {
        this.db
          .prepare(
            `INSERT INTO events (id, task_id, agent, stream, content, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(event.id, event.taskId, event.agent, event.stream, event.content, event.createdAt);
        this.db.prepare("UPDATE tasks SET updated_at = ? WHERE id = ?").run(now, taskId);
      });
      firstEvent ||= event;
    }
    return firstEvent;
  }

  finishTask(taskId, { status, exitCode }) {
    const now = new Date().toISOString();
    this.write(() => {
      this.db
        .prepare(
          `UPDATE tasks
           SET status = ?, exit_code = ?, updated_at = ?, finished_at = ?
           WHERE id = ?`
        )
        .run(status, exitCode, now, now, taskId);
    });
  }

  updateTaskStatus(taskId, status) {
    const now = new Date().toISOString();
    this.write(() => {
      this.db
        .prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?")
        .run(status, now, taskId);
    });
  }

  addCodexNote(taskId, content) {
    const event = this.appendEvent({
      taskId,
      agent: "codex",
      stream: "note",
      content
    });
    this.updateTaskStatus(taskId, "codex_reviewed");
    return event;
  }

  markTaskCreatedAt(taskId, createdAt) {
    this.write(() => {
      this.db
        .prepare("UPDATE tasks SET created_at = ?, updated_at = ? WHERE id = ?")
        .run(createdAt, createdAt, taskId);
    });
  }

  pruneOlderThan(nowIso, retentionDays) {
    const cutoff = new Date(Date.parse(nowIso) - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    this.write(() => {
      this.db.prepare("DELETE FROM tasks WHERE created_at < ?").run(cutoff);
      this.db.prepare("DELETE FROM events WHERE task_id NOT IN (SELECT id FROM tasks)").run();
    });
  }

  listTasks(limit = 100) {
    return this.db
      .prepare(
        `SELECT id, mode, agent, cwd, title, status, task_packet AS taskPacket,
                exit_code AS exitCode, priority, attempt, max_attempts AS maxAttempts,
                route_agent AS routeAgent, route_reason AS routeReason,
                risk_level AS riskLevel, run_after AS runAfter, created_at AS createdAt,
                updated_at AS updatedAt, finished_at AS finishedAt
         FROM tasks
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(limit);
  }

  getTask(taskId) {
    return this.db
      .prepare(
        `SELECT id, mode, agent, cwd, title, status, task_packet AS taskPacket,
                exit_code AS exitCode, priority, attempt, max_attempts AS maxAttempts,
                route_agent AS routeAgent, route_reason AS routeReason,
                risk_level AS riskLevel, run_after AS runAfter, created_at AS createdAt,
                updated_at AS updatedAt, finished_at AS finishedAt
         FROM tasks
         WHERE id = ?`
      )
      .get(taskId);
  }

  listChangesSince(sinceIso) {
    const tasks = this.db
      .prepare(
        `SELECT id, mode, agent, cwd, title, status, task_packet AS taskPacket,
                exit_code AS exitCode, priority, attempt, max_attempts AS maxAttempts,
                route_agent AS routeAgent, route_reason AS routeReason,
                risk_level AS riskLevel, run_after AS runAfter, created_at AS createdAt,
                updated_at AS updatedAt, finished_at AS finishedAt
         FROM tasks
         WHERE updated_at > ?
         ORDER BY updated_at ASC`
      )
      .all(sinceIso);
    const events = this.db
      .prepare(
        `SELECT id, task_id AS taskId, agent, stream, content, created_at AS createdAt
         FROM events
         WHERE created_at > ?
         ORDER BY created_at ASC`
      )
      .all(sinceIso);

    return { tasks, events };
  }

  nextQueuedTask(nowIso = new Date().toISOString()) {
    return this.db
      .prepare(
        `SELECT id, mode, agent, cwd, title, status, task_packet AS taskPacket,
                exit_code AS exitCode, priority, attempt, max_attempts AS maxAttempts,
                route_agent AS routeAgent, route_reason AS routeReason,
                risk_level AS riskLevel, run_after AS runAfter, created_at AS createdAt,
                updated_at AS updatedAt, finished_at AS finishedAt
         FROM tasks
         WHERE status = 'queued' AND run_after <= ?
         ORDER BY priority DESC, created_at ASC
         LIMIT 1`
      )
      .get(nowIso);
  }

  setTaskMeta(taskId, key, value) {
    const now = new Date().toISOString();
    this.write(() => {
      this.db
        .prepare(
          `INSERT INTO task_meta (task_id, key, value, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(task_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        )
        .run(taskId, key, String(value), now);
      this.db.prepare("UPDATE tasks SET updated_at = ? WHERE id = ?").run(now, taskId);
    });
  }

  getTaskMeta(taskId, key) {
    return this.db
      .prepare("SELECT value FROM task_meta WHERE task_id = ? AND key = ?")
      .get(taskId, key)?.value;
  }

  listTaskMeta(taskId) {
    const rows = this.db
      .prepare("SELECT key, value FROM task_meta WHERE task_id = ? ORDER BY key ASC")
      .all(taskId);
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  listEvents(taskId) {
    return this.db
      .prepare(
        `SELECT id, task_id AS taskId, agent, stream, content, created_at AS createdAt
         FROM events
         WHERE task_id = ?
         ORDER BY created_at ASC`
      )
      .all(taskId);
  }

  close() {
    this.db.close();
  }

  write(operation) {
    return runWithSqliteRetry(operation);
  }

  ensureV04Columns() {
    const columns = new Set(this.db.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name));
    const additions = [
      ["priority", "INTEGER NOT NULL DEFAULT 50"],
      ["attempt", "INTEGER NOT NULL DEFAULT 1"],
      ["max_attempts", "INTEGER NOT NULL DEFAULT 2"],
      ["route_agent", "TEXT NOT NULL DEFAULT ''"],
      ["route_reason", "TEXT NOT NULL DEFAULT ''"],
      ["risk_level", "TEXT NOT NULL DEFAULT 'low'"],
      ["run_after", "TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'"]
    ];
    for (const [name, type] of additions) {
      if (!columns.has(name)) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN ${name} ${type};`);
      }
    }
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS idx_tasks_queue ON tasks(status, priority DESC, run_after, created_at);"
    );
  }
}
