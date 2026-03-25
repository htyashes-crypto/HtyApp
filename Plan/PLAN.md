# Hty-Skill 管理器 v1 设计方案（修正版）

## Summary
- 技术栈固定为 `Electron + React + TypeScript + Vite`，Windows 首发。
- v1 以三类目录为标准管理目标：`<workspace>/.cursor/skills/`、`<workspace>/.codex/skills/`、`<workspace>/.claude/skills/`。
- Hty 只维护一套全局库，但在“追加上传到已有 Skill”和项目页“更新”时，会先分析 `base / local / target`，能自动文本合并就直接应用，不能则进入整 Skill 的手动冲突处理界面。
- 项目接入后，Hty 为每个本地 skill 实例生成一个独立索引文件，统一放在 `<workspace>/.htyskillmanager/instances/`，记录版本绑定、已应用基线和元数据。
- 版本管理只发生在全局库。只有手动上传才会产生新版本；项目页“更新”只同步到目标版本，不直接生成新版本。
- provider 语义保持不变：全局中的一个 skill 是逻辑 skill，每个版本下可有多个 provider 变体，上传默认勾选全部 provider，安装默认勾选该版本已有的全部 provider 变体。

## Core Model
- `GlobalSkill`
  - 逻辑 skill 主记录，字段至少包含 `skillId`、`slug`、`name`、`description`、`tags`、`createdAt`、`updatedAt`
- `GlobalVersion`
  - 版本记录，字段至少包含 `skillId`、`version`、`publishedAt`、`notes`、`publishedFromWorkspaceId`
- `VersionProviderVariant`
  - 某版本下的 provider 变体，字段至少包含 `skillId`、`version`、`provider`、`payloadPath`
- `Workspace`
  - 工作区记录，字段至少包含 `workspaceId`、`name`、`rootPath`、`createdAt`
- `LocalInstance`
  - 本地实例记录，字段至少包含 `instanceId`、`workspaceId`、`provider`、`relativePath`、`linkedSkillId?`、`linkedVersion?`、`appliedSkillId?`、`appliedVersion?`、`displayName`、`updatedAt`

## Workspace 与索引
- 每个 workspace 的索引目录固定为 `<workspace>/.htyskillmanager/instances/`
- 单个索引文件命名固定为 `<instanceId>.htyVersion`
- `.htyVersion` 最少包含：
  - `schemaVersion`
  - `instanceId`
  - `workspaceRoot`
  - `provider`
  - `relativePath`
  - `linkedSkillId`
  - `linkedVersion`
  - `appliedSkillId`
  - `appliedVersion`
  - `displayName`
  - `createdAt`
  - `updatedAt`
- `linked*` 表示当前要追踪的全局目标版本；`applied*` 表示最近一次真正落地到本地磁盘的全局版本。
- 首次扫描 workspace 时，Hty 会识别三类目录下已有 skill，并自动生成索引文件。
- 旧 `.htyVersion` 缺少 `applied*` 字段时，读取时默认按 `applied* = linked*` 兼容。
- Hty 重新扫描时，不重做全量内容校验；内容比较只在追加上传和项目页更新时触发。

## Provider 与上传 / 安装 / 更新规则
- v1 中 provider 的主要差异只体现在安装目标根目录，不做内容语义转换。
- 新建 Skill 上传：
  - 用户从某个本地实例发起上传。
  - 默认勾选 `Codex + Claude + Cursor`。
  - Hty 将当前内容原样复制为被勾选 provider 的版本变体。
- 追加到已有 Skill：
  - 先分析 `base / local / target`。
  - 仅当 `appliedSkillId` 与目标 Skill 一致时，才使用可靠的 3-way merge 基线。
  - 自动合并只针对 UTF-8 文本文件。
  - 二进制、不可解码文件、删除/修改冲突、同一文本块双方都改、重命名相关冲突，统一进入手动处理界面。
  - 手动或自动合并完成后，生成下一个 patch 版本，并把最终结果同步写回来源本地实例。
- 安装到 workspace：
  - 默认勾选该版本中已经存在的全部 provider 变体。
  - 用户可以取消勾选，只安装到单个或多个 provider。
  - 如果目标 workspace 对应 provider 根目录不存在，Hty 自动创建。
  - 覆盖安装前自动备份到 `<workspace>/.htyskillmanager/backups/<timestamp>/...`。
- 项目页“更新”：
  - `base = applied 版本 payload`
  - `local = 当前工作区实例目录`
  - `target = linked 版本 payload`
  - 能自动文本合并时直接应用；否则进入整 Skill 手动冲突处理界面。
  - 若 `linked*` 与 `applied*` 指向相同 payload，则返回 no-op，不做覆盖。

## Versioning
- 初次上传到全局时版本号固定从 `1.0.0` 开始。
- 后续每次发布默认 `patch + 1`。
- 已发布版本永久只读，不可覆盖。
- 每次上传形成的版本，只保存这次勾选 provider 的变体。
- 安装时只允许安装当前版本中存在的 provider 变体。
- 项目本地后续被外部修改时，不会自动产生新版本，也不会自动改写全局记录；只有上传才会发布新版本。

## App Architecture
- 前端：`React 19 + TypeScript + Vite + TanStack Query + Zustand`
- 桌面与文件系统逻辑：Electron 主进程服务提供 IPC 能力
- 关键命令至少包含：
  - `scan_workspace`
  - `watch_workspace`
  - `publish_to_global`
  - `prepare_append_publish_merge`
  - `prepare_update_merge`
  - `get_merge_session`
  - `get_merge_session_file`
  - `resolve_merge_session_file`
  - `commit_merge_session`
  - `discard_merge_session`
  - `install_from_global`
  - `create_backup`
  - `import_package`
  - `export_package`
- 全局库存储在系统 app data 目录，包含：
  - `library.json`
  - `store/skills/<skillId>/<version>/<provider>/...`
  - `merge-sessions/<sessionId>/...`

## UI Information Architecture
- 一级导航固定为：`Overview`、`Global Library`、`Projects`、`Activity`、`Settings`
- `Global Library`
  - 展示逻辑 skill 列表
  - 每个 skill 显示最新版本、provider 覆盖徽标、标签、更新时间
  - Skill 详情页展示版本时间线与每个版本已有的 provider 变体
- `Projects`
  - 展示 workspace 列表
  - 进入单个 workspace 后，按 provider 展示本地实例
  - 每个实例显示路径、索引版本、已应用版本、是否已绑定全局
- 核心弹窗：
  - `上传到全局`
    - 新建模式直接上传
    - 追加模式先预分析，再根据结果自动提交或打开冲突处理
  - `安装版本`
    - 默认全选该版本已有 provider 变体
    - 展示目标 workspace、目标路径、备份提示
  - `整 Skill 冲突处理`
    - 左侧文件树展示 `clean / auto / conflict / resolved`
    - 中间编辑最终结果或对二进制文件做文件级选择
    - 右侧查看 `base / local / target`
    - 仅当所有冲突都已解决时允许提交
- 全局页与项目页都要明确显示：
  - 追加上传与更新会先分析并尝试文本合并
  - 冲突会进入整 Skill 的手动处理流程
  - 上传才产生新版本

## Test Plan
- 扫描一个包含 `.codex/skills`、`.claude/skills`、`.cursor/skills` 的项目时，能正确识别本地实例并生成 `.htyVersion`
- 旧 `.htyVersion` 缺少 `applied*` 字段时，能兼容读取并回填默认值
- 本地实例未绑定全局时，项目页正确显示“未绑定”
- 从一个 `Codex` 本地实例新建上传到全局时，若默认不改勾选，生成的新版本应同时包含 `Codex / Claude / Cursor` 三个变体
- 追加上传时，非重叠文本修改能自动合并并发布下一个 patch 版本
- 追加上传时，文本同块冲突、二进制冲突或缺少可靠 base 时，必须进入手动处理而不是直接发布
- 从全局安装时，默认应勾选该版本已有的全部变体
- 安装时取消部分 provider，只应落地到被勾选的 provider 根目录
- 项目页更新时，从 `applied vA` 到 `linked vB` 的非重叠文本改动能自动合并并推进 `applied*`
- 项目页更新时，二进制冲突和文本同块冲突必须进入手动处理
- 当前 `linked*` 与 `applied*` 指向相同 payload 时，更新应返回 no-op
- 前端应覆盖：
  - 追加上传先请求 preview，再决定自动提交或打开冲突处理
  - 冲突处理弹窗在未解决完全部冲突前不能提交
  - 二进制冲突只出现文件级选择，不出现文本编辑器

## Assumptions
- v1 明确按三类 `*/skills` 目录工作，不做 provider 原生格式适配。
- “跨 provider 同步”在 v1 中的含义是“同内容复制到多个 provider 变体”，不是内容转换。
- 自动合并只针对 UTF-8 文本文件，provider 规则仍保持“同一最终结果复制到本次勾选的 provider 变体”。
- “单 skill 更新”仅指项目页现有 `更新` 按钮，不新增其他更新入口。
- 追加上传在发生自动或人工合并后，会把来源本地实例同步成最终提交结果，以保证版本谱系可靠。