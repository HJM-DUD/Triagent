let tasks = [];
let selectedId = null;
let seenTaskIds = new Set();
let lastEventText = "";
let refreshTimer = null;
let config = { enableActions: false };
const maxVisibleTasks = 8;
let showAllTasks = false;

const taskList = document.querySelector("#tasks");
const taskCount = document.querySelector("#task-count");
const taskToggle = document.querySelector("#task-toggle");
const connection = document.querySelector("#connection");
const selectedAgent = document.querySelector("#selected-agent");
const selectedTitle = document.querySelector("#selected-title");
const selectedStatus = document.querySelector("#selected-status");
const taskPacket = document.querySelector("#task-packet");
const eventsEl = document.querySelector("#events");
const applyCommand = document.querySelector("#apply-command");

connect();
loadConfig();
refreshTasks();
startAutoRefresh();

applyCommand.addEventListener("click", async () => {
  if (!selectedId) {
    return;
  }
  await navigator.clipboard.writeText(`triagent apply ${selectedId} --yes-risk`);
  applyCommand.textContent = "Copied";
  setTimeout(() => {
    applyCommand.textContent = "Apply";
  }, 1200);
});

taskToggle?.addEventListener("click", () => {
  showAllTasks = !showAllTasks;
  renderTasks();
});

function connect() {
  const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);

  socket.addEventListener("open", () => {
    connection.textContent = "live";
    connection.className = "badge succeeded";
  });

  socket.addEventListener("close", () => {
    connection.textContent = "offline";
    connection.className = "badge failed";
    setTimeout(connect, 1500);
  });

  socket.addEventListener("message", async (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "snapshot") {
      tasks = message.payload.tasks;
      renderTasks();
      selectTask(selectedId || tasks[0]?.id);
    }
    if (message.type === "task") {
      await refreshTasks();
    }
    if (message.type === "event" && message.payload.taskId === selectedId) {
      await renderEvents(selectedId);
    }
  });
}

async function refreshTasks() {
  try {
    const response = await fetch("/api/tasks");
    const data = await response.json();
    tasks = data.tasks;
    renderTasks();
    if (!selectedId && tasks[0]) {
      selectTask(tasks[0].id);
    } else if (selectedId) {
      refreshSelectedTask();
    }
  } catch {
    connection.textContent = "reconnecting";
    connection.className = "badge running";
  }
}

function renderTasks() {
  const previous = seenTaskIds;
  const nextSeen = new Set(tasks.map((task) => task.id));
  const visibleTasks = getVisibleTasks();
  taskList.innerHTML = "";
  for (const task of visibleTasks) {
    const button = document.createElement("button");
    const isNew = previous.size > 0 && !previous.has(task.id);
    const statusClass = normalizeStatusClass(task.status);
    button.className = `task ${statusClass} ${task.id === selectedId ? "selected" : ""} ${isNew ? "fresh" : ""}`;
    button.type = "button";
    button.setAttribute("aria-pressed", String(task.id === selectedId));
    button.addEventListener("click", () => selectTask(task.id));
    button.innerHTML = `
      <span class="task-head">
        <span class="task-agent">${escapeHtml(task.agent)}</span>
        <span class="task-time">${escapeHtml(formatTime(task.createdAt))}</span>
      </span>
      <span class="task-title">${escapeHtml(task.title)}</span>
      <span class="task-meta">
        <span class="task-mode">${escapeHtml(task.mode)}</span>
        <span class="task-state ${statusClass}">${escapeHtml(formatStatus(task.status))}</span>
      </span>
    `;
    taskList.append(button);
  }
  updateTaskCount(visibleTasks.length);
  seenTaskIds = nextSeen;
}

function getVisibleTasks() {
  if (showAllTasks) {
    return tasks;
  }
  const visible = tasks.slice(0, maxVisibleTasks);
  if (selectedId && !visible.some((task) => task.id === selectedId)) {
    const selectedTask = tasks.find((task) => task.id === selectedId);
    if (selectedTask) {
      visible.push(selectedTask);
    }
  }
  return visible;
}

function updateTaskCount(visibleCount) {
  if (!taskCount) {
    return;
  }
  const hiddenCount = Math.max(tasks.length - visibleCount, 0);
  taskCount.textContent = tasks.length > maxVisibleTasks ? `${visibleCount}/${tasks.length}` : `${visibleCount} shown`;
  taskCount.title = hiddenCount > 0 ? `仅显示最新 ${visibleCount} 条，已隐藏 ${hiddenCount} 条历史任务` : "显示全部任务";
  if (taskToggle) {
    taskToggle.hidden = tasks.length <= maxVisibleTasks;
    taskToggle.textContent = showAllTasks ? "收起" : "全部";
    taskToggle.setAttribute("aria-pressed", String(showAllTasks));
    taskToggle.title = showAllTasks ? `收起到最新 ${maxVisibleTasks} 条任务` : `显示全部 ${tasks.length} 条任务`;
  }
}

async function selectTask(taskId) {
  selectedId = taskId;
  lastEventText = "";
  renderTasks();
  const task = tasks.find((item) => item.id === taskId);
  if (!task) {
    return;
  }

  selectedAgent.textContent = `${task.agent} · ${task.mode} · ${task.cwd}`;
  selectedTitle.textContent = task.title;
  selectedStatus.textContent = formatStatus(task.status);
  selectedStatus.className = `status ${normalizeStatusClass(task.status)}`;
  taskPacket.textContent = task.taskPacket;
  updateActionVisibility(task);
  await renderEvents(task.id);
}

async function renderEvents(taskId) {
  try {
    const response = await fetch(`/api/tasks/${taskId}/events`);
    const data = await response.json();
    const nextText = data.events
      .map((item) => `[${item.createdAt}] ${item.agent}:${item.stream}\n${item.content}`)
      .join("\n\n");
    if (nextText !== lastEventText) {
      eventsEl.innerHTML = buildEventMarkup(data.events);
      eventsEl.scrollTop = eventsEl.scrollHeight;
      eventsEl.classList.remove("pulse");
      requestAnimationFrame(() => eventsEl.classList.add("pulse"));
      lastEventText = nextText;
    }
  } catch {
    connection.textContent = "reconnecting";
    connection.className = "badge running";
  }
}

function buildEventMarkup(events) {
  if (!events.length) {
    return `<p class="empty-output">还没有原始输出</p>`;
  }
  return groupEventChunks(events)
    .map((group) => {
      const streamClass = normalizeStatusClass(group.stream);
      const chunkText = group.count > 1 ? `${group.count} chunks` : "1 chunk";
      return `
        <article class="event-entry">
          <header class="event-header">
            <span class="event-agent">${escapeHtml(group.agent)}</span>
            <span class="event-stream-name ${streamClass}">${escapeHtml(group.stream)}</span>
            <span class="event-chunks">${escapeHtml(chunkText)}</span>
            <time>${escapeHtml(formatDateTime(group.startedAt))}</time>
          </header>
          <pre class="event-content">${escapeHtml(group.content)}</pre>
        </article>
      `;
    })
    .join("");
}

function groupEventChunks(events) {
  const groups = [];
  for (const event of events) {
    const last = groups.at(-1);
    if (last && last.agent === event.agent && last.stream === event.stream) {
      last.content = `${last.content}\n${event.content}`;
      last.count += 1;
      last.finishedAt = event.createdAt;
    } else {
      groups.push({
        agent: event.agent,
        stream: event.stream,
        content: event.content,
        count: 1,
        startedAt: event.createdAt,
        finishedAt: event.createdAt
      });
    }
  }
  return groups;
}

function refreshSelectedTask() {
  const task = tasks.find((item) => item.id === selectedId);
  if (!task) {
    return;
  }
  selectedAgent.textContent = `${task.agent} · ${task.mode} · ${task.cwd}`;
  selectedTitle.textContent = task.title;
  selectedStatus.textContent = formatStatus(task.status);
  selectedStatus.className = `status ${normalizeStatusClass(task.status)}`;
  taskPacket.textContent = task.taskPacket;
  updateActionVisibility(task);
  renderEvents(task.id);
}

function startAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  refreshTimer = setInterval(refreshTasks, 1200);
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    config = await response.json();
  } catch {
    config = { enableActions: false };
  }
}

function updateActionVisibility(task) {
  applyCommand.hidden = !(config.enableActions && task.mode === "dry-run");
}

function normalizeStatusClass(status) {
  return String(status || "idle").replaceAll(/[^a-zA-Z0-9_-]/g, "_");
}

function formatStatus(status) {
  return String(status || "idle").replaceAll("_", " ");
}

function formatTime(value) {
  if (!value) {
    return "--:--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })
    .format(date)
    .replaceAll("/", "-");
}

function formatDateTime(value) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  })
    .format(date)
    .replaceAll("/", "-");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
