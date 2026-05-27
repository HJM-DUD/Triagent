import { execFile, spawn } from "node:child_process";
import { access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function buildDryRunTaskPacket({ goal, realCwd, sandboxCwd }) {
  return [
    "Dry-run sandbox task",
    `Goal: ${goal}`,
    `Real working directory: ${realCwd}`,
    `Sandbox working directory: ${sandboxCwd}`,
    "Do not modify the real working directory.",
    "All edits, commands, and verification must happen inside the sandbox working directory.",
    "Report the resulting diff and test results."
  ].join("\n");
}

export function assertApplyAllowed({ realWorktreeClean, sandboxStatus, diffText }) {
  if (!realWorktreeClean) {
    throw new Error("Cannot apply: real working tree is not clean.");
  }
  if (sandboxStatus !== "succeeded" && sandboxStatus !== "sandbox_succeeded") {
    throw new Error("Cannot apply: sandbox task did not succeed.");
  }
  if (hasDangerousDiff(diffText)) {
    throw new Error("Cannot apply: dangerous diff detected.");
  }
}

export function hasDangerousDiff(diffText) {
  return /deleted file mode/i.test(String(diffText)) || /^diff --git a\/\.\./m.test(String(diffText));
}

export async function createGitSandbox({ cwd }) {
  const sandboxCwd = await mkdtemp(join(tmpdir(), "triagent-sandbox-"));
  await execFileAsync("git", ["worktree", "add", "--detach", sandboxCwd, "HEAD"], { cwd });
  return sandboxCwd;
}

export async function buildSandboxGcPlan({
  store,
  nowIso = new Date().toISOString(),
  olderThanDays = 7,
  inspectSandbox = inspectGitSandbox
}) {
  const nowMs = Date.parse(nowIso);
  const candidates = [];

  for (const task of store.listTasks(1000)) {
    const sandboxCwd = store.getTaskMeta(task.id, "sandbox_cwd");
    if (!sandboxCwd) {
      continue;
    }

    const ageDays = Math.floor((nowMs - Date.parse(task.updatedAt)) / (24 * 60 * 60 * 1000));
    const inspection = await inspectSandbox(sandboxCwd);
    if (!inspection.exists) {
      continue;
    }

    if (task.status === "applied") {
      candidates.push({
        taskId: task.id,
        path: sandboxCwd,
        status: task.status,
        ageDays,
        reason: "applied",
        force: true
      });
      continue;
    }

    if (ageDays >= olderThanDays && inspection.clean) {
      candidates.push({
        taskId: task.id,
        path: sandboxCwd,
        status: task.status,
        ageDays,
        reason: `older_than_${olderThanDays}_days_clean`,
        force: false
      });
    }
  }

  return { preview: true, candidates };
}

export async function applySandboxGcPlan({ candidates, removeWorktree = removeGitWorktree }) {
  const removed = [];
  for (const candidate of candidates) {
    await removeWorktree(candidate.path, { force: Boolean(candidate.force) });
    removed.push(candidate.taskId);
  }
  return { removed };
}

export async function getGitDiff({ cwd }) {
  const { stdout } = await execFileAsync("git", ["diff", "--binary"], { cwd, maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}

export async function isWorktreeClean({ cwd }) {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd });
  return stdout.trim() === "";
}

export async function inspectGitSandbox(path) {
  try {
    await access(path);
  } catch {
    return { exists: false, clean: false };
  }

  return {
    exists: true,
    clean: await isWorktreeClean({ cwd: path })
  };
}

export async function removeGitWorktree(path, { force = false } = {}) {
  const args = ["worktree", "remove"];
  if (force) {
    args.push("--force");
  }
  args.push(path);
  await execFileAsync("git", args);
}

export async function applyDiff({ cwd, diffText }) {
  if (!diffText.trim()) {
    return "No diff to apply.";
  }
  await pipeToCommand({ cmd: "git", args: ["apply", "--index", "-"], cwd, input: diffText });
  return "Diff applied to index and working tree.";
}

function pipeToCommand({ cmd, args, cwd, input }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `${cmd} exited with ${code}`));
      }
    });
    child.stdin.end(input);
  });
}
