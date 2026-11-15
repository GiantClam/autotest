## Why

当前 `autotest` 能编排项目脚本和 GitHub Release，但无法以统一方式接收任意项目路径、发现项目入口、补齐缺失入口并由 DeepSeek Harness 驱动完整交付闭环。已有方案和 grill-me 已确定通用边界：项目命令必须由目标项目提供，缺失能力由 Agent 在目标项目内创建，未知能力必须明确阻塞。

## What Changes

- 将 `project-root` 作为唯一项目接入边界，支持发现、初始化、计划和执行。
- 从目标项目现有脚本、workflow 和版本信息生成 `.autotest/project.json`；不写入 CoworkAny 或其他项目专用适配器。
- 暴露 DeepSeek Harness 本地源码插件，提供 discover、init、desktop-goal、plan、run 五个工具。
- 将桌面操作建模为有 `goal_id`、应用/窗口白名单、动作上限、超时和证据要求的目标注册；插件不直接调用 JEV，由 Agent 按需调用 JEV。
- 保持 plan、未授权 init 和未授权 run 只读；`execute: true` 在所有项目方法通过后自动推进 push、合并、tag 和 GitHub Release。
- 将缺失实现、未知生态、凭据缺失、发布策略不明和证据不足作为可恢复的 BLOCKED 状态。

## Capabilities

### New Capabilities

- `generic-project-lifecycle`: 面向任意 Git 项目的发现、初始化、项目方法执行和发布闭环。
- `deepseek-harness-plugin`: 将通用闭环暴露为 DeepSeek Harness 的本地 Cordis 插件工具。
- `bounded-desktop-goals`: 注册受限桌面目标，并把实际 JEV 调用和独立验证留给 Agent/后续适配器。

### Modified Capabilities

- None.

## Impact

- `src/cli.mjs`、`src/project-init.mjs`、`src/desktop-goal.mjs`、`src/pipeline.mjs`、`src/release.mjs` 和相关测试。
- `plugin/` 本地 DeepSeek Harness 插件及其 profile patch。
- 目标项目会获得 `.autotest/` 配置和 case 证据文件；插件不要求修改目标项目的业务代码，只有显式写入时才会创建或更新文件。
- GitHub CLI、目标项目 workflow、JEV/TypeSafe 凭据和生产发布环境仍由部署环境提供；凭据不进入配置、日志或证据文件。
