export function buildMarkdownReport({ store, taskId }) {
  const task = store.getTask(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const events = store.listEvents(taskId);
  const evidenceIds = collectEvidenceIds(events);

  return [
    `# Triagent Report: ${task.title}`,
    "",
    `- Task ID: ${task.id}`,
    `- Mode: ${task.mode}`,
    `- Agent: ${task.agent}`,
    `- Status: ${task.status}`,
    `- Exit code: ${task.exitCode ?? "pending"}`,
    `- CWD: ${task.cwd}`,
    `- Created: ${task.createdAt}`,
    `- Updated: ${task.updatedAt}`,
    "",
    "## Evidence IDs",
    "",
    evidenceIds.length ? evidenceIds.map((id) => `- ${id}`).join("\n") : "- Missing evidence IDs",
    "",
    "## Task Packet",
    "",
    "```text",
    task.taskPacket,
    "```",
    "",
    "## Events",
    "",
    ...events.map(formatEvent)
  ].join("\n");
}

function formatEvent(event) {
  return [
    `### ${event.createdAt} ${event.agent}:${event.stream}`,
    "",
    "```text",
    event.content,
    "```",
    ""
  ].join("\n");
}

function collectEvidenceIds(events) {
  const ids = new Set();
  for (const event of events) {
    for (const match of event.content.matchAll(/\[E\d+\]/g)) {
      ids.add(match[0]);
    }
  }
  return [...ids].sort();
}
