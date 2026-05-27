import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

import { redactSecrets } from "./redact.js";

export class TriagentStore {
  constructor(dbPath) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA busy_timeout = 3000;");
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

      CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_task_id ON events(task_id, created_at);
    `);
  }

  createTask({ mode, agent, cwd, title, taskPacket }) {
    const now = new Date().toISOString();
    const task = {
      id: randomUUID(),
      mode,
      agent,
      cwd,
      title,
      status: "running",
      taskPacket: redactSecrets(taskPacket),
      createdAt: now,
      updatedAt: now
    };
    this.db
      .prepare(
        `INSERT INTO tasks
          (id, mode, agent, cwd, title, status, task_packet, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        task.id,
        task.mode,
        task.agent,
        task.cwd,
        task.title,
        task.status,
        task.taskPacket,
        task.createdAt,
        task.updatedAt
      );
    return task;
  }

  appendEvent({ taskId, agent, stream, content }) {
    const now = new Date().toISOString();
    const event = {
      id: randomUUID(),
      taskId,
      agent,
      stream,
      content: redactSecrets(content),
      createdAt: now
    };
    this.db
      .prepare(
        `INSERT INTO events (id, task_id, agent, stream, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(event.id, event.taskId, event.agent, event.stream, event.content, event.createdAt);
    this.db.prepare("UPDATE tasks SET updated_at = ? WHERE id = ?").run(now, taskId);
    return event;
  }

  finishTask(taskId, { status, exitCode }) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE tasks
         SET status = ?, exit_code = ?, updated_at = ?, finished_at = ?
         WHERE id = ?`
      )
      .run(status, exitCode, now, now, taskId);
  }

  updateTaskStatus(taskId, status) {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, now, taskId);
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
    this.db
      .prepare("UPDATE tasks SET created_at = ?, updated_at = ? WHERE id = ?")
      .run(createdAt, createdAt, taskId);
  }

  pruneOlderThan(nowIso, retentionDays) {
    const cutoff = new Date(Date.parse(nowIso) - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    this.db.prepare("DELETE FROM tasks WHERE created_at < ?").run(cutoff);
    this.db.prepare("DELETE FROM events WHERE task_id NOT IN (SELECT id FROM tasks)").run();
  }

  listTasks(limit = 100) {
    return this.db
      .prepare(
        `SELECT id, mode, agent, cwd, title, status, task_packet AS taskPacket,
                exit_code AS exitCode, created_at AS createdAt,
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
                exit_code AS exitCode, created_at AS createdAt,
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
                exit_code AS exitCode, created_at AS createdAt,
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
}
