# Skill: /release - 自动发布 HtyApp 新版本

当用户说"发布新版本"、"打包发布"、"/release"时，执行以下完整流程。

## 执行流程

### 1. 确认版本号

- 读取 `package.json` 中当前的 `version`
- 询问用户本次发布类型（patch/minor/major）或指定版本号
- 自动递增版本号并修改 `package.json`

### 2. 更新 changelog.json（⚠️ 必须在提交前完成）

**这是发布流程中最关键的步骤之一，必须在 git commit 之前完成。**

`changelog.json`（仓库根目录）是**唯一的更新日志数据源**。旧版本客户端通过云端拉取此文件来显示更新日志。前端没有本地副本，完全依赖云端。

操作步骤：
1. 通过 `git log` 查看自上一个版本以来的所有提交
2. 按类别整理本次更新内容（新功能、Bug 修复、优化改进等）
3. 在 `changelog.json` 数组**最前面**插入新版本条目：

```json
{
  "version": "X.Y.Z",
  "date": "YYYY-MM-DD",
  "changes": [
    "变更内容1",
    "变更内容2"
  ]
}
```

4. 使用中文编写 changes 内容

**云端拉取链路**：`electron/updater.cjs` 检测到新版本后，从 `https://raw.githubusercontent.com/htyashes-crypto/HtyApp/v{newVersion}/changelog.json` 拉取此文件，解析后发送给前端 `UpdateDialog` 组件显示。因此：
- 新版本的 tag 对应的 commit **必须**包含最新的 `changelog.json`
- 这意味着必须先更新 `changelog.json`，再 commit，再打包发布

### 3. 确认 GH_TOKEN

- 运行 `echo $GH_TOKEN` 检查环境变量是否已设置
- 如果未设置，提示用户提供 GitHub Personal Access Token（需 `repo` 权限）
- Token 获取路径：GitHub → 头像 → Settings → Developer settings → Personal access tokens → Tokens (classic)

### 4. 提交代码

```bash
git add -A
git commit -m "Release vX.Y.Z"
git push
```

### 5. 打包并上传到 GitHub Releases

```bash
export GH_TOKEN=用户提供的token
npm run dist
```

此命令执行：tsc 类型检查 → vite build 构建前端 → electron-builder 打包 exe 并上传 GitHub Releases。
超时设置为 600000ms（10 分钟）。

### 6. 编写 GitHub Release 描述

打包上传完成后，通过 GitHub API 为 Release 写入描述（这是 GitHub Releases 页面上显示的内容，与 changelog.json 内容一致但格式为 Markdown）。

操作步骤：
1. 获取 Release ID：
```bash
curl -s -H "Authorization: token $GH_TOKEN" -H "User-Agent: node" \
  https://api.github.com/repos/htyashes-crypto/HtyApp/releases \
  | node -e "..."  # 找到 tag_name === 'vX.Y.Z' 的 release id
```

2. 使用 Node.js 写入 body（避免 shell 转义问题）：
```javascript
node -e "
const https = require('https');
const body = JSON.stringify({ body: 'Markdown内容' });
// ... PATCH request to /repos/.../releases/RELEASE_ID
"
```

3. **写入后必须验证** body 不为 null

### 7. 验证 Release 状态

检查 Release 是否为 Draft，如果是则自动发布为正式版：
```bash
curl -s -X PATCH -H "Authorization: token $GH_TOKEN" -H "Content-Type: application/json" \
  -d '{"draft": false}' \
  https://api.github.com/repos/htyashes-crypto/HtyApp/releases/RELEASE_ID
```

### 8. 完成报告

向用户报告：
- 发布的版本号
- GitHub Releases 页面链接：https://github.com/htyashes-crypto/HtyApp/releases
- 安装包文件名和大小
- 提醒：已安装的旧版应用下次启动会自动检测到此更新

## 更新日志架构说明

```
changelog.json (仓库根目录)
  ↓ git push 后存在于 GitHub 仓库的 tag 对应 commit 中
  ↓
electron/updater.cjs
  ↓ 检测到新版本时，从 raw.githubusercontent.com 拉取新版本 tag 下的 changelog.json
  ↓ 解析 JSON 后通过 IPC 发送 { type: "changelog", changelog: [...] }
  ↓
src/components/UpdateDialog.tsx
  ↓ 接收 remoteChangelog，按版本号范围过滤
  ↓ 显示从当前版本到新版本之间所有条目
  ↓
用户看到更新日志
```

**重要**：前端没有本地 changelog 副本。如果云端拉取失败，更新日志区域为空（不影响更新功能本身）。

## 常见错误处理

| 错误 | 处理方式 |
|------|----------|
| TypeScript 编译失败 | 修复类型错误后重新执行 |
| Cannot create symbolic link | 提示用户开启 Windows 开发者模式 |
| electron in dependencies | 将 electron 移到 devDependencies |
| icon must be 256x256 | 移除 build.win.icon 配置或替换为合规图标 |
| Release 为 Draft | 通过 API 自动发布 |
| 404 / No published versions | 确认仓库为 Public，确认 Release 非 Draft |
| 旧版本更新检查 404 latest.yml | Release 中缺少 `latest.yml`。重新执行 `npm run dist`（需设置 GH_TOKEN）即可重新上传所有 artifacts |
| 旧版本下载 exe 404 | 通过 GitHub API 确认 release 非 Draft 且 assets 状态为 `uploaded` |
| 更新日志不显示 | 检查 `changelog.json` 是否包含新版本条目，确认 tag 对应的 commit 中有最新文件 |

## 注意事项

- `electron-builder --publish always` 会同时上传安装包和 `latest.yml`，缺少 `latest.yml` 会导致旧版本无法检测更新
- 重新执行 `npm run dist` 会自动覆盖已存在的同名 assets
- 发布完成后建议通过 GitHub API 验证所有 assets 都已正确上传
- **changelog.json 必须在 git commit 之前更新**，否则 tag 对应的源码中不包含新版本日志

## 关键文件

- `package.json` — 版本号、build 配置、publish 配置
- `changelog.json` — 更新日志唯一数据源（云端拉取用）
- `electron/updater.cjs` — 自动更新模块 + changelog 拉取逻辑
- `src/components/UpdateDialog.tsx` — 更新对话框 UI（只用 remoteChangelog）
- `vite.config.ts` — 必须有 `base: "./"`
