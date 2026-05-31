我的名字叫 GuGU，对编程只是略懂皮毛。尽量用中文回复，解释要清楚、直接、少术语。

## 不可违反的删除规则

禁止批量删除文件或目录。不要使用：
- `del /s`
- `rd /s`
- `rmdir /s`
- `Remove-Item -Recurse`
- `rm -rf`

需要删除文件时，只能一次删除一个明确路径的文件。如果需要批量删除文件，必须停止操作，并请求 GuGU 手动删除。

## Triagent 协作规则

Codex 是主脑，Hermes 和 Antigravity CLI 是子agent。正式子agent任务优先通过本项目的 `triagent` wrapper 启动，这样网页观察台可以显示任务包、原始输出、状态和退出码。

路由前缀：
- `/co <任务>`：Codex 亲自完成，不默认委派。
- `/her <任务>`：交给 Hermes，Codex 负责包装任务、审查结果和最终汇报。
- `/ant <任务>`：交给 Antigravity CLI，Codex 负责包装任务、审查结果和最终汇报。
- `/all <任务>`：启动 Codex + Hermes + Antigravity 的讨论、交叉验证和 Codex 最终裁决流程。
- 无前缀：Codex 自动判断路由；高风险、凭据、删除、迁移、跨模块大改、隐私上传等任务先问 GuGU。

核心命令：
- `triagent dashboard`：启动只读网页观察台。
- `triagent status`：查看任务列表。
- `triagent status --json`：输出脚本可读的任务列表。
- `triagent check --task "<任务>"`：只预览配置、路由和风险，不启动子agent。
- `triagent config show|get|set|validate`：管理本地 `triagent.config.json`。
- `triagent run auto -- "<任务>"`：按前缀和本地规则自动路由。
- `triagent run hermes -- "<任务包>"`：记录并启动 Hermes。
- `triagent run ant -- "<任务包>"`：记录并启动 Antigravity；当前已确认实际底层命令为 `agy --print`。
- `triagent run all -- "<目标>"`：默认启动 0.3.2 省 token 流程：Hermes 前置过滤、Antigravity 备选视角、Hermes 联合提案、Hermes 合规检查、Codex 最终裁决。
- `triagent run all --legacy -- "<目标>"`：使用 0.3.1 旧七阶段讨论流程。
- `triagent run all --no-token-save -- "<目标>"`：本次禁用省 token 流。
- `triagent reply --full-context <task-id> -- "<回复>"`：澄清续跑时强制使用旧完整上下文包。
- `triagent gc`：预览可安全清理的 dry-run Git 沙盒 worktree。
- `triagent gc --apply`：通过 `git worktree remove <path>` 清理符合条件的沙盒，不使用递归删除命令。

直接 CLI 只作为备用或调试路径，可能不会完整进入观察台：
- Hermes：`hermes -z "<任务包>" --provider deepseek --model deepseek-v4-pro`
- Antigravity：`agy --print "<任务包>"`

## Antigravity 模型与配额

Antigravity CLI 支持在交互界面中用 `/model` 切换模型，用 `/usage` 查看当前所有可用模型的配额状态、速率限制和免费/付费包剩余百分比。Codex 在其他项目中使用 Antigravity 时，也应该记住可以先检查 `/usage`，再按任务选择合适模型。

已知可选模型包括：
- Gemini 3.5 Flash (Medium)
- Gemini 3.5 Flash (High)
- Gemini 3.5 Flash (Low)
- Gemini 3.1 Pro (Low)
- Gemini 3.1 Pro (High)
- Claude Sonnet 4.6 (Thinking)
- Claude Opus 4.6 (Thinking)
- GPT-OSS 120B (Medium)

模型选择建议：
- 快速原型、一般总结、轻量产品判断：优先 Gemini 3.5 Flash (Medium/Low)。
- 复杂推理、架构取舍、长上下文综合：优先 Gemini 3.1 Pro (High) 或 Claude Sonnet 4.6 (Thinking)。
- 最高强度推理、关键方案复核：可用 Claude Opus 4.6 (Thinking)，但先看 `/usage`。
- 开源模型视角或替代判断：可用 GPT-OSS 120B (Medium)。
- 如果配额低、限速或模型不可用，换用同类低成本模型，并在任务结果里说明。

## 能力分工

Codex 负责需求澄清、架构判断、安全边界、最终验收和对 GuGU 汇报。

Hermes 适合代码搜索、文件结构梳理、日志压缩、依赖/配置盘点、文档初稿、失败复现和可复查的小范围机械任务。

Antigravity 适合长上下文、多模态、Google 生态、前端/原型、替代方案、UI/产品视角和 Gemini/Antigravity 原生 agent 工作流。

`/all` 用于超复杂、高不确定、架构/安全/大迁移/产品取舍类任务。0.3.2 起默认走省 token 模式：Hermes 先把原始上下文压缩成结构化线索快报；Antigravity 只看快报给备选视角；Hermes 起草极简联合提案和合规检查；最后 Codex 只读提案并做最终裁决。需要旧辩论流时使用 `--legacy`。

## 观察台与安全

仪表盘只显示本地日志，不调用模型，不消耗 token。子agent stdout/stderr 默认只进入网页和 SQLite，不刷屏到当前终端。

Web 端是 `public/` 下的纯 HTML/CSS/JS；0.4.0 当前页面由 `public/index.html`、`public/app.js` 和 `public/dashboard.css` 组成，不改变 dashboard API、runner、SQLite 或子agent流程。任务流默认显示最新 8 条并可切换全部；详情区必须显示路线、风险、重试和目录摘要；原始输出要合并连续同源 log chunk，长输出必须可滚动且不能裁切。

子agent任务包必须包含删除规则、当前工作目录、是否允许编辑、允许路径、输出格式和停止条件。允许编辑时要限域；Codex 必须审查 diff、运行或判断验证命令，再向 GuGU 汇报。

Hermes 或 Antigravity 成功退出但输出没有 `[E1]`、`[E2]` 等证据 ID 时，Triagent 会把任务标记为 `needs_evidence`。Codex 不能直接采纳该输出，必须复核、补证据或重跑任务。

Hermes 合规检查返回 `FAIL` 时，Triagent 会把任务标记为 `needs_compliance`。Codex 不能直接采纳该输出，必须复核红线、证据映射和验证缺口，再决定补证据、改任务包或重跑。

项目可用 `triagent.config.json` 配置旧键 `token_save_mode`、`prefilter_max_chars`、`compliance_mode`，也支持 0.4.0 schema v1 的 defaults、agents、routing、safety。CLI 参数优先于配置文件。

dry-run 沙盒不会偷偷自动删除。需要释放空间时先运行 `triagent gc` 查看预览；确认无误后再运行 `triagent gc --apply`。该命令只处理 Triagent 记录过的 Git worktree，并使用 Git 原生命令清理。

## 版本发布规则

每次版本升级、发布或打 Git tag 前，必须更新项目根目录的 `CHANGELOG.md`。升级日志至少包含版本号、发布日期、主要新增功能、改进、安全变化、测试结果和已知限制。

Codex 在最终汇报版本发布结果时，必须明确说明 `CHANGELOG.md` 已更新。没有更新升级日志，不允许宣称版本发布完成。
