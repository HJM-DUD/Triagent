export function enqueueTask(
  store,
  {
    agent,
    cwd = process.cwd(),
    title,
    taskPacket,
    priority = 50,
    attempt = 1,
    maxAttempts = 2,
    routeAgent = agent,
    routeReason = "queued",
    riskLevel = "low",
    runAfter
  }
) {
  return store.createTask({
    mode: "queued",
    agent,
    cwd,
    title,
    taskPacket,
    status: "queued",
    priority,
    attempt,
    maxAttempts,
    routeAgent,
    routeReason,
    riskLevel,
    runAfter
  });
}

export function nextRunnableTask(store, nowIso = new Date().toISOString()) {
  return store.nextQueuedTask(nowIso);
}

export function shouldRetryTask(task) {
  return task.status === "failed" && Number(task.attempt || 1) < Number(task.maxAttempts || 1);
}
