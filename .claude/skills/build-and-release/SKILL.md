# Skill: /release - 自动发布 HtyApp 新版本

当用户说"发布新版本"、"打包发布"、"/release"时，执行以下完整流程。

## 执行流程

### 1. 确认版本号

- 读取 `package.json` 中当前的 `version`
- 询问用户本次发布类型（patch/minor/major）或指定版本号
- 自动递增版本号并修改 `package.json`

### 2. 确认 GH_TOKEN

- 运行 `echo $GH_TOKEN` 检查环境变量是否已设置
- 如果未设置，提示用户提供 GitHub Personal Access Token（需 `repo` 权限）
- Token 获取路径：GitHub → 头像 → Settings → Developer settings → Personal access tokens → Tokens (classic)

### 3. 提交代码

```bash
git add -A
git commit -m "Release vX.Y.Z"
git push
```

### 4. 打包并上传到 GitHub Releases

```bash
export GH_TOKEN=用户提供的token
npm run dist
```

此命令执行：tsc 类型检查 → vite build 构建前端 → electron-builder 打包 exe 并上传 GitHub Releases。
超时设置为 600000ms（10 分钟）。

### 5. 编写更新日志（⚠️ 必须完成，不可跳过）

**这是发布流程中最关键的步骤之一，必须在打包上传完成后立即执行，绝对不能遗漏。**

操作步骤：

1. 通过 `git log` 查看自上一个版本 tag/commit 以来的所有提交，总结本次更新内容
2. 按类别整理：新功能、Bug 修复、优化改进等
3. 使用中文编写，格式清晰
4. 通过 GitHub API 更新 Release body（注意：必须验证写入成功）

```bash
# 写入更新日志
curl -s -X PATCH -H "Authorization: token $GH_TOKEN" -H "Content-Type: application/json" \
  -d '{"body": "更新日志内容"}' \
  https://api.github.com/repos/htyashes-crypto/HtyApp/releases/RELEASE_ID
```

5. **写入后必须验证**：再次请求 API 确认 `body` 字段不为 null，如果为 null 则重试

```bash
# 验证更新日志已写入
curl -s -H "Authorization: token $GH_TOKEN" \
  https://api.github.com/repos/htyashes-crypto/HtyApp/releases/RELEASE_ID | grep '"body"'
```

### 6. 验证 Release 状态

打包完成后，通过 GitHub API 检查 Release 是否为 Draft：

```bash
curl -s -H "Authorization: token $GH_TOKEN" \
  https://api.github.com/repos/htyashes-crypto/HtyApp/releases \
  | grep -E '"tag_name"|"draft"' | head -4
```

如果是 Draft，自动将其发布为正式版：

```bash
curl -s -X PATCH -H "Authorization: token $GH_TOKEN" -H "Content-Type: application/json" \
  -d '{"draft": false}' \
  https://api.github.com/repos/htyashes-crypto/HtyApp/releases/RELEASE_ID
```

### 7. 完成报告

向用户报告：
- 发布的版本号
- GitHub Releases 页面链接：https://github.com/htyashes-crypto/HtyApp/releases
- 安装包文件名和大小
- 提醒：已安装的旧版应用下次启动会自动检测到此更新

## 常见错误处理

| 错误 | 处理方式 |
|------|----------|
| TypeScript 编译失败 | 修复类型错误后重新执行 |
| Cannot create symbolic link | 提示用户开启 Windows 开发者模式 |
| electron in dependencies | 将 electron 移到 devDependencies |
| icon must be 256x256 | 移除 build.win.icon 配置或替换为合规图标 |
| Release 为 Draft | 通过 API 自动发布 |
| 404 / No published versions | 确认仓库为 Public，确认 Release 非 Draft |
| 旧版本更新检查 404 latest.yml | Release 中缺少 `latest.yml`。重新执行 `npm run dist`（需设置 GH_TOKEN）即可重新上传所有 artifacts（包括 `latest.yml`）。上传后 GitHub CDN 可能需要几分钟缓存传播 |
| 旧版本下载 exe 404 | 通过 GitHub API 确认 release 非 Draft 且 assets 状态为 `uploaded`。如果 API 显示正常但仍 404，等待 CDN 缓存传播即可 |

## 注意事项

- `electron-builder --publish always` 会同时上传安装包和 `latest.yml`，缺少 `latest.yml` 会导致旧版本无法检测更新
- 如果手动在 GitHub 上创建 Release 或只上传了 exe，必须确保 `latest.yml` 也作为 asset 上传
- 重新执行 `npm run dist` 会自动覆盖已存在的同名 assets（日志会显示 `overwrite published file`）
- 发布完成后建议通过 GitHub API 验证所有 assets（exe、exe.blockmap、latest.yml）都已正确上传

## 关键文件

- `package.json` — 版本号、build 配置、publish 配置
- `electron/updater.cjs` — 自动更新模块
- `src/components/UpdateNotification.tsx` — 更新提示 UI
- `vite.config.ts` — 必须有 `base: "./"`
