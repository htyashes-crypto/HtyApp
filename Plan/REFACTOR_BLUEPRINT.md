# Hty Skill Manager 重构蓝图

## 1. 项目现状结论

### 1.1 技术栈
- 前端：`React 19 + TypeScript + Vite + TanStack Query + Zustand + Framer Motion`
- 桌面壳：`Tauri 2`
- 后端：`Rust + rusqlite + zip + walkdir`
- 产品定位：管理全局 Skill 库、工作区本地 Skill 实例、版本发布/安装/导入导出

### 1.2 运行模型
- React 前端负责页面展示、用户流程编排、调用 Tauri command。
- `src/lib/api.ts` 负责 Tauri 与 mock 的双通道切换。
- Rust 侧通过 command 暴露扫描工作区、发布到全局、安装到工作区、导入导出包、更新配置等能力。
- 全局数据保存在 app data 目录，核心介质是：
  - `library.db`
  - `store/skills/<skillId>/<version>/<provider>/...`
- 每个工作区通过 `.htyskillmanager/instances/*.htyVersion` 保存本地实例索引。

### 1.3 当前代码分布
- 前端应用编排集中在 `src/app/App.tsx`
- 页面层集中在 `src/pages/`
- 弹窗与布局组件在 `src/components/`
- 类型、API 适配和工具在 `src/lib/`
- 状态仅有 `src/state/ui-store.ts` 和 `src/state/theme-store.ts`
- Rust 入口很薄：
  - `src-tauri/src/lib.rs`
  - `src-tauri/src/commands.rs`
- Rust 核心逻辑高度集中在 `src-tauri/src/service.rs`

## 2. 当前架构的真实形态

### 2.1 前端
- `src/app/App.tsx` 同时承担：
  - 路由状态管理
  - 查询注册
  - 查询失效策略
  - 选择态同步
  - 页面数据过滤
  - 工作区刷新/扫描/导入/导出/绑定/更新等动作编排
  - 弹窗开关与弹窗上下文装配
- `src/pages/ProjectsPage.tsx` 不只是展示层，已经承接：
  - provider 过滤
  - 绑定版本选择
  - 绑定冲突可用性推导
  - 错误状态管理
  - 局部命令触发
- `PublishDialog.tsx` 与 `InstallDialog.tsx` 自己维护一套会话初始化、默认 provider 计算、提交状态和错误状态。
- UI 样式集中在单个 `src/styles/index.css`，目前约 1645 行。

### 2.2 Rust
- `src-tauri/src/commands.rs` 基本只是透传到 `AppService`。
- `src-tauri/src/service.rs` 目前约 1812 行，承担了几乎所有后端职责：
  - 配置引导
  - SQLite 初始化与查询
  - 工作区扫描
  - 索引文件读写
  - 特殊工作区处理
  - 发布/安装/绑定/更新
  - 备份
  - 包导入导出
  - 文件复制
  - slug/version 规则
  - 测试
- `src-tauri/src/models.rs` 目前主要是接口 DTO，同时混入了若干规则型枚举和结构。

### 2.3 数据流
- 前端以“页面直接调 API”为主，缺少明确的用例层。
- 后端以“AppService 直接串数据库 + 文件系统 + 规则”为主，缺少领域边界。
- 目前系统可以跑通，但业务增长后会在两个位置同时失控：
  - 前端 `App.tsx`
  - 后端 `service.rs`

## 3. 已确认的主要问题

### 3.1 前端问题
- `src/app/App.tsx` 已经成为应用编排中心，文件约 314 行，任何新用例都会继续堆在这里。
- 查询失效策略散落在多个 handler 中，缺少统一的 query key 工厂和 mutation 协调层。
- 页面组件和弹窗组件同时维护业务状态，导致状态边界不清。
- `ProjectsPage.tsx` 约 377 行，已经在 UI 层处理业务规则，不利于复用和测试。
- `src/lib/api.ts` 只做 transport 适配，没有按业务能力分组，前端很难形成 feature 级边界。
- 样式全部放在 `src/styles/index.css`，后续重构 UI 时改动面过大，容易引发串联回归。

### 3.2 Rust 问题
- `src-tauri/src/service.rs` 是典型单体 service，职责过多。
- command 层没有 application/use-case 边界，导致所有规则都沉到底层 service。
- 文件系统、数据库和业务规则耦合在一个方法内，典型例子：
  - `publish_to_global`
  - `install_from_global`
  - `scan_workspace`
  - `export_package`
  - `import_package`
- `get_dashboard` 通过遍历工作区再调用 `scan_workspace` 聚合统计，后续工作区增多后会造成性能和职责混杂问题。
- 测试写在 `service.rs` 同文件内，虽然覆盖到了关键行为，但模块拆分前后会拖慢维护。

### 3.3 领域建模问题
- `models.rs` 目前更像“前后端通信 DTO 集合”，还不是稳定的领域模型。
- “全局库”“工作区索引”“特殊工作区”“安装目标”“打包清单”这些概念都已存在，但尚未形成独立模块。
- provider、版本、索引路径、备份路径、特殊工作区路径等规则分散在多个函数里，容易重复实现。

## 4. 目标架构

### 4.1 前端目标
- 保留 React + Query + Zustand，不换技术栈。
- 重构为四层：
  - `app/`: App Shell、providers、路由容器
  - `features/`: 按业务域拆分，例如 `library`、`workspaces`、`activity`、`settings`
  - `entities/`: 纯类型映射、展示 helper、query key、selector
  - `shared/`: 通用 UI、基础工具、样式 token

### 4.2 Rust 目标
- 保留 Tauri + rusqlite，不做技术替换。
- 重构为四层：
  - `adapters/tauri`: command 入口
  - `application/`: 用例服务，例如 `scan_workspace`, `publish_skill_version`, `install_skill_version`
  - `domain/`: provider、workspace、version、local index、package manifest 等核心模型和规则
  - `infrastructure/`: sqlite、文件系统、zip、路径解析、时间/uuid

### 4.3 关键边界
- 前端页面组件只负责展示和交互，不直接写复杂业务规则。
- 前端用例通过 feature hook 或 mutation service 暴露。
- Rust command 只做入参出参适配。
- Rust application service 只编排 use case，不直接落细碎 IO。
- 文件系统操作、数据库访问、压缩包处理分别沉到 infrastructure。

## 5. 推荐拆分方案

### 5.1 前端目录建议
```text
src/
  app/
    AppShell.tsx
    routes/
  features/
    library/
      api/
      hooks/
      components/
      pages/
    workspaces/
      api/
      hooks/
      components/
      pages/
    activity/
    settings/
  entities/
    skill/
    workspace/
    local-instance/
  shared/
    ui/
    lib/
    styles/
```

### 5.2 Rust 目录建议
```text
src-tauri/src/
  adapters/
    tauri/
      commands.rs
  application/
    dashboard_service.rs
    workspace_service.rs
    library_service.rs
    package_service.rs
  domain/
    provider.rs
    workspace.rs
    global_skill.rs
    local_index.rs
    package.rs
  infrastructure/
    db/
      schema.rs
      repositories.rs
    fs/
      workspace_fs.rs
      library_fs.rs
      backup_fs.rs
    packaging/
      zip_package.rs
    support/
      clock.rs
      id.rs
      path_utils.rs
  lib.rs
  main.rs
```

## 6. 分阶段重构顺序

### Phase 0: 建立护栏
- 保留现有行为，不先改产品规则。
- 固化基线：
  - 前端测试通过
  - Rust 测试通过
- 把 query key、常量、provider/path 规则集中收口。

### Phase 1: 前端应用层解耦
- 从 `App.tsx` 抽出：
  - `useAppShellState`
  - `useDashboardQueries`
  - `useWorkspaceSelection`
  - `useLibrarySelection`
  - `useAppActions`
- 页面只接收已经整理好的 view model 和 action。
- 先不改视觉结构，保证 UI 行为完全一致。

### Phase 2: Workspaces 作为首个 feature 完整拆分
- 目标：优先拆 `ProjectsPage` 相关逻辑。
- 抽出：
  - `useWorkspaceSnapshot`
  - `useBindLocalInstance`
  - `useUpdateBoundInstance`
  - `useWorkspaceInstanceFilters`
  - `WorkspaceWorkbench` 组件族
- `PublishDialog` 和 `InstallDialog` 的会话状态迁移到 feature hook。

### Phase 3: Rust 按用例拆 service
- 先拆最核心的三个用例：
  - `scan_workspace`
  - `publish_to_global`
  - `install_from_global`
- 方法原则：
  - 先提取私有 helper 到独立模块
  - 再引入 repository / fs gateway
  - 最后把 `AppService` 收缩为 façade
- 此阶段不改 command 名和前端接口。

### Phase 4: 包导入导出与备份独立
- 将 `create_backup / export_package / import_package` 从核心工作区流程中剥离。
- 单独形成 `package_service` 和 `backup_service`。
- 这样可以避免“工作区管理”和“包管理”继续相互污染。

### Phase 5: DTO 与领域模型分离
- 保留给前端的 DTO。
- 同时引入内部领域对象，避免 application service 直接操纵接口模型。
- 把 provider/path/version/slug 等规则下沉到 domain/support。

### Phase 6: 样式与组件重整
- 将 `index.css` 拆分为：
  - `tokens.css`
  - `layout.css`
  - `components/*.css`
  - `pages/*.css`
- 与前端 feature 结构同步整理组件职责。

## 7. 我建议的第一刀

如果现在就开始动手，我建议第一刀不是直接拆 Rust，而是先做下面这个无行为变更的前端骨架重构：

1. 抽离 `App.tsx` 内的 query、selection、action 编排
2. 把 `ProjectsPage` 的业务态迁移到 hooks
3. 把 `PublishDialog` / `InstallDialog` 的会话初始化逻辑迁移到 feature 层
4. 建立统一 query key 与 invalidate 工具

原因：
- 风险最低
- 改动可分批提交
- 能立刻降低后续 Rust 重构时的前端耦合
- 做完以后，后端接口即使逐步演化，前端承压面也会小很多

## 8. 当前基线

已验证：
- `vitest`：1 个测试文件，5 个测试，全部通过
- `cargo test`：11 个测试，全部通过

说明：
- 现有项目不是坏掉状态，而是“可运行但结构已接近扩展上限”的状态。
- 这类项目最适合走“保持行为不变的分层重构”，不适合直接推倒重写。

## 9. 后续执行原则

- 不改 command 名，不先改产品语义。
- 每一阶段只做一个核心边界收口。
- 先提取，再迁移，再删除旧路径。
- 每一步都要保住现有测试基线。
- 重构期间优先新增模块测试，而不是继续把测试堆回单体文件。
