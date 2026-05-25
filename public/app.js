let tasks = [];
let selectedId = null;

const taskList = document.querySelector("#tasks");
const connection = document.querySelector("#connection");
const selectedAgent = document.querySelector("#selected-agent");
const selectedTitle = document.querySelector("#selected-title");
const selectedStatus = document.querySelector("#selected-status");
const taskPacket = document.querySelector("#task-packet");
const eventsEl = document.querySelector("#events");

connect();
refreshTasks();

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
  const response = await fetch("/api/tasks");
  const data = await response.json();
  tasks = data.tasks;
  renderTasks();
  if (!selectedId && tasks[0]) {
    selectTask(tasks[0].id);
  }
}

function renderTasks() {
  taskList.innerHTML = "";
  for (const task of tasks) {
    const button = document.createElement("button");
    button.className = `task ${task.id === selectedId ? "selected" : ""}`;
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
}

async function selectTask(taskId) {
  selectedId = taskId;
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
  await renderEvents(task.id);
}

async function renderEvents(taskId) {
  const response = await fetch(`/api/tasks/${taskId}/events`);
  const data = await response.json();
  eventsEl.textContent = data.events
    .map((item) => `[${item.createdAt}] ${item.agent}:${item.stream}\n${item.content}`)
    .join("\n\n");
  eventsEl.scrollTop = eventsEl.scrollHeight;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
