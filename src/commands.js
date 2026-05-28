import { existsSync } from "node:fs";

export const DELETE_RULE = [
  "Do not batch-delete or recursively delete files/directories.",
  "Do not use rm -rf, rmdir -s, rd /s, del /s, or Remove-Item -Recurse.",
  "Delete only one explicit file path at a time.",
  "If batch deletion is needed, stop and ask Codex/GuGU."
].join(" ");

export function resolveAntigravityCommand(hasCommand = defaultHasCommand) {
  if (hasCommand("agy")) {
    return "agy";
  }
  if (hasCommand("antigravity")) {
    return "antigravity";
  }
  return "agy";
}

export function buildAgentCommand({ agent, taskPacket, edit = false, antCommand, hermesCommand }) {
  if (agent === "hermes") {
    if (edit) {
      return {
        cmd: hermesCommand || "hermes",
        args: [
          "chat",
          "-Q",
          "--checkpoints",
          "--provider",
          "deepseek",
          "--model",
          "deepseek-v4-pro",
          "-s",
          "codex-subagent",
          "-q",
          taskPacket
        ]
      };
    }

    return {
      cmd: hermesCommand || "hermes",
      args: ["-z", taskPacket, "--provider", "deepseek", "--model", "deepseek-v4-pro"]
    };
  }

  if (agent === "ant") {
    return {
      cmd: antCommand || resolveAntigravityCommand(),
      args: ["--print", taskPacket]
    };
  }

  throw new Error(`Unsupported agent: ${agent}`);
}

export function buildTaskPacket({ goal, cwd = process.cwd(), allowedPaths = [], edit = false }) {
  const paths = allowedPaths.length ? allowedPaths.join(", ") : cwd;
  return [
    `Goal: ${goal}`,
    `Current working directory: ${cwd}`,
    `Edits allowed: ${edit ? "yes, only inside allowed paths" : "no"}`,
    `Allowed paths: ${paths}`,
    `Deletion rule: ${DELETE_RULE}`,
    "Evidence ID rule: Every factual claim based on files, commands, logs, or web output must include an evidence ID like [E1]. If there is no evidence, say so clearly.",
    "Output format: 结论, 改了什么, 触碰文件, 运行命令, 验证结果, 风险/未完成, 需要 Codex 决策的问题."
  ].join("\n");
}

export function buildAllDiscussionPlan(goal, cwd = process.cwd()) {
  const base = [
    `Goal: ${goal}`,
    `Current working directory: ${cwd}`,
    `Deletion rule: ${DELETE_RULE}`,
    "Evidence ID rule: Every factual claim based on files, commands, logs, or web output must include an evidence ID like [E1]."
  ].join("\n");
  return [
    {
      agent: "codex",
      title: "Problem definition",
      taskPacket: `Problem definition\n${base}\nDefine success criteria, constraints, known facts, and risks.`
    },
    {
      agent: "hermes",
      title: "Hermes local analysis",
      taskPacket: `${base}\nAnalyze from local code, logs, cost, and mechanical feasibility. Do not edit files.\nFinish with a summary under 500 Chinese characters: core proposal points and potential risks.`
    },
    {
      agent: "ant",
      title: "Antigravity alternative analysis",
      taskPacket: `${base}\nAnalyze alternatives, long-context concerns, UI/product implications, and Google ecosystem fit. Do not edit files.\nFinish with a summary under 500 Chinese characters: core proposal points and potential risks.`
    },
    {
      agent: "codex",
      title: "Codex draft decision",
      taskPacket: `${base}\nDraft the lead architecture decision and identify what each subagent should challenge.`
    },
    {
      agent: "hermes",
      title: "Hermes cross-check",
      taskPacket: `${base}\nCross-check only the compact summary and evidence IDs from Codex and Antigravity, not their full Raw Log. Look for concrete implementation risks and missing verification.`
    },
    {
      agent: "ant",
      title: "Antigravity cross-check",
      taskPacket: `${base}\nCross-check only the compact summary and evidence IDs from Codex and Hermes, not their full Raw Log. Look for product, UX, scale, and long-context issues.`
    },
    {
      agent: "codex",
      title: "Codex final decision",
      taskPacket: `${base}\nFinal裁决: summarize agreements, disagreements, accepted points, rejected points, and final plan.`
    }
  ];
}

function defaultHasCommand(name) {
  const pathDirs = (process.env.PATH || "").split(":");
  return pathDirs.some((dir) => existsSync(`${dir}/${name}`));
}
