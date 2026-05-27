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
- `triagent status`：查看最近任务。
- `triagent run hermes -- "<任务包>"`：记录并启动 Hermes。
- `triagent run ant -- "<任务包>"`：记录并启动 Antigravity；当前已确认实际底层命令为 `agy --print`。
- `triagent run all -- "<目标>"`：记录并启动三方讨论流程。

直接 CLI 只作为备用或调试路径，可能不会完整进入观察台：
- Hermes：`hermes -z "<任务包>" --provider deepseek --model deepseek-v4-pro`
- Antigravity：`agy --print "<任务包>"`

## 能力分工

Codex 负责需求澄清、架构判断、安全边界、最终验收和对 GuGU 汇报。

Hermes 适合代码搜索、文件结构梳理、日志压缩、依赖/配置盘点、文档初稿、失败复现和可复查的小范围机械任务。

Antigravity 适合长上下文、多模态、Google 生态、前端/原型、替代方案、UI/产品视角和 Gemini/Antigravity 原生 agent 工作流。

`/all` 用于超复杂、高不确定、架构/安全/大迁移/产品取舍类任务。Codex 先定义问题；Hermes 和 Antigravity 分别分析；随后互相交叉检查；最后 Codex 汇总分歧、采纳点、拒绝理由和最终方案。

## 观察台与安全

仪表盘只显示本地日志，不调用模型，不消耗 token。子agent stdout/stderr 默认只进入网页和 SQLite，不刷屏到当前终端。

子agent任务包必须包含删除规则、当前工作目录、是否允许编辑、允许路径、输出格式和停止条件。允许编辑时要限域；Codex 必须审查 diff、运行或判断验证命令，再向 GuGU 汇报。

## 版本发布规则

每次版本升级、发布或打 Git tag 前，必须更新项目根目录的 `CHANGELOG.md`。升级日志至少包含版本号、发布日期、主要新增功能、改进、安全变化、测试结果和已知限制。

Codex 在最终汇报版本发布结果时，必须明确说明 `CHANGELOG.md` 已更新。没有更新升级日志，不允许宣称版本发布完成。
