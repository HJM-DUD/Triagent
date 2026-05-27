import { readFile } from "node:fs/promises";

export async function buildMemorySyncDryRun(memoryFiles = defaultMemoryFiles()) {
  const entries = [];
  for (const file of memoryFiles) {
    const content = await readFile(file.path, "utf8").catch((error) => {
      if (error.code === "ENOENT") {
        return "";
      }
      throw error;
    });
    entries.push({ ...file, content });
  }

  const findings = [
    ...findVersionMismatches(entries),
    ...findDuplicateLines(entries)
  ];

  return [
    "# Memory Sync Dry Run",
    "",
    "No files were modified.",
    "",
    "## Files",
    "",
    ...entries.map((entry) => `- ${entry.agent}: ${entry.path}`),
    "",
    "## Findings",
    "",
    findings.length ? findings.map((finding) => `- ${finding}`).join("\n") : "- No obvious conflicts found."
  ].join("\n");
}

export function defaultMemoryFiles() {
  const home = process.env.HOME || "";
  return [
    { agent: "codex", path: `${home}/.codex/AGENTS.md` },
    { agent: "hermes", path: `${home}/.hermes/memories/MEMORY.md` },
    { agent: "ant", path: `${home}/.gemini/GEMINI.md` }
  ];
}

function findVersionMismatches(entries) {
  const versions = new Map();
  for (const entry of entries) {
    for (const match of entry.content.matchAll(/\bAPI\s+v?(\d+)\b/gi)) {
      const version = match[0];
      if (!versions.has(version)) {
        versions.set(version, []);
      }
      versions.get(version).push(entry.agent);
    }
  }

  return versions.size > 1
    ? [`Potential version mismatch: ${[...versions.entries()].map(([version, agents]) => `${version} in ${agents.join("/")}`).join("; ")}`]
    : [];
}

function findDuplicateLines(entries) {
  const seen = new Map();
  for (const entry of entries) {
    for (const line of entry.content.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
      if (!seen.has(line)) {
        seen.set(line, new Set());
      }
      seen.get(line).add(entry.agent);
    }
  }
  return [...seen.entries()]
    .filter(([, agents]) => agents.size > 1)
    .slice(0, 5)
    .map(([line, agents]) => `Duplicate guidance across ${[...agents].join("/")}: ${line}`);
}
