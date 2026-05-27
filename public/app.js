let tasks = [];
let selectedId = null;
let seenTaskIds = new Set();
let lastEventText = "";
let refreshTimer = null;
let config = { enableActions: false };

const taskList = document.querySelector("#tasks");
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
  taskList.innerHTML = "";
  for (const task of tasks) {
    const button = document.createElement("button");
    const isNew = previous.size > 0 && !previous.has(task.id);
    button.className = `task ${task.id === selectedId ? "selected" : ""} ${isNew ? "fresh" : ""}`;
    button.type = "button";
    button.addEventListener("click", () => selectTask(task.id));
    button.innerHTML = `
      <span class="task-title">${escapeHtml(task.title)}</span>
      <span class="task-meta">
        <span>${escapeHtml(task.agent)}</span>
        <span class="${escapeHtml(task.status)}">${escapeHtml(task.status)}</span>
      </span>
    `;
    taskList.append(button);
  }
  seenTaskIds = nextSeen;
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
  selectedStatus.textContent = task.status;
  selectedStatus.className = `status ${task.status}`;
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
      eventsEl.textContent = nextText;
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

function refreshSelectedTask() {
  const task = tasks.find((item) => item.id === selectedId);
  if (!task) {
    return;
  }
  selectedAgent.textContent = `${task.agent} · ${task.mode} · ${task.cwd}`;
  selectedTitle.textContent = task.title;
  selectedStatus.textContent = task.status;
  selectedStatus.className = `status ${task.status}`;
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
