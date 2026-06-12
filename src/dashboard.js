import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

import { defaultDbPath } from "./paths.js";
import { buildMarkdownReport } from "./report.js";
import { bus, openStore } from "./runner.js";

const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

export function startDashboard({ host = "127.0.0.1", port = 8765, dbPath = defaultDbPath(), enableActions = false } = {}) {
  const server = createServer((req, res) => {
    try {
      routeRequest({ req, res, dbPath, enableActions });
    } catch (error) {
      sendJson(res, { error: error.message }, 500);
    }
  });
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket) => {
    const store = openStore(dbPath);
    socket.send(JSON.stringify({ type: "snapshot", payload: { tasks: store.listTasks() } }));
    store.close();
  });

  const onMessage = (message) => {
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  };
  bus.on("message", onMessage);

  server.on("close", () => {
    bus.off("message", onMessage);
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      resolve({
        server,
        url: `http://${host}:${server.address().port}`
      });
    });
  });
}

function routeRequest({ req, res, dbPath, enableActions }) {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/api/config") {
    sendJson(res, { enableActions });
    return;
  }

  if (url.pathname === "/api/tasks") {
    const store = openStore(dbPath);
    sendJson(res, { tasks: store.listTasks() });
    store.close();
    return;
  }

  const eventMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/events$/);
  if (eventMatch) {
    const store = openStore(dbPath);
    sendJson(res, { events: store.listEvents(eventMatch[1]) });
    store.close();
    return;
  }

  const reportMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/report$/);
  if (reportMatch) {
    const store = openStore(dbPath);
    const taskId = reportMatch[1];
    try {
      if (!store.getTask(taskId)) {
        sendJson(res, { error: `Task not found: ${taskId}` }, 404);
        return;
      }

      const markdown = buildMarkdownReport({ store, taskId });
      sendText(res, markdown, 200, {
        "content-disposition": `attachment; filename="${reportFilename(taskId)}"`
      });
    } finally {
      store.close();
    }
    return;
  }

  serveStatic(url.pathname, res);
}

function sendJson(res, data, statusCode = 200) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendText(res, data, statusCode = 200, headers = {}) {
  res.writeHead(statusCode, { "content-type": "text/markdown; charset=utf-8", ...headers });
  res.end(data);
}

function reportFilename(taskId) {
  return `triagent-${String(taskId).replaceAll(/[^a-zA-Z0-9_-]/g, "_")}-report.md`;
}

function serveStatic(pathname, res) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const normalized = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PUBLIC_DIR, normalized);

  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  res.writeHead(200, { "content-type": contentType(filePath) });
  createReadStream(filePath).pipe(res);
}

function contentType(filePath) {
  switch (extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
