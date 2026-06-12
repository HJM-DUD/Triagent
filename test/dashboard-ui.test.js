import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("dashboard uses product workspace copy instead of generic AI hero copy", async () => {
  const html = await readFile("public/index.html", "utf8");

  assert.match(html, /<title>Triagent Observer<\/title>/);
  assert.doesNotMatch(html, /AI Command Center/);
  assert.match(html, /本地观察台/);
  assert.match(html, /任务队列/);
});

test("dashboard renders v0.4 local routing metadata with dedicated chips", async () => {
  const app = await readFile("public/app.js", "utf8");

  assert.match(app, /class="task-route"/);
  assert.match(app, /class="task-risk/);
  assert.match(app, /function attemptLabel/);
  assert.match(app, /routeLabel\(task\)/);
  assert.match(app, /riskLabel\(task\)/);
  assert.match(app, /function agentLabel/);
  assert.match(app, /Codex subagent/);
});

test("dashboard surfaces codex notes and report export in task details", async () => {
  const html = await readFile("public/index.html", "utf8");
  const app = await readFile("public/app.js", "utf8");
  const css = await readFile("public/dashboard.css", "utf8");

  assert.match(html, /id="final-note"/);
  assert.match(html, /id="report-link"/);
  assert.match(app, /function updateFinalNote/);
  assert.match(app, /function findLatestTriagentNote/);
  assert.match(app, /latestCodexNote/);
  assert.ok(app.includes("/api/tasks/${encodeURIComponent(task.id)}/report"));
  assert.match(css, /\.decision-panel/);
  assert.match(css, /\.decision-note/);
});

test("dashboard stylesheet avoids neon hero treatment and keeps dense tool layout", async () => {
  const html = await readFile("public/index.html", "utf8");
  const [, href] = html.match(/<link rel="stylesheet" href="\/([^"]+)">/) || [];
  assert.equal(href, "dashboard.css");
  const css = await readFile(`public/${href}`, "utf8");

  assert.doesNotMatch(css, /radial-gradient/);
  assert.doesNotMatch(css, /glow/i);
  assert.match(css, /--accent:/);
  assert.match(css, /grid-template-columns: minmax\(320px, 420px\) minmax\(0, 1fr\)/);
  assert.match(css, /\.metric-strip/);
});
