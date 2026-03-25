# update-to-github

提交所有改动并推送到远程 GitHub 仓库。

## 执行步骤

1. 运行 `git status -u` 查看所有变更文件
2. 运行 `git diff --stat` 查看变更统计
3. 运行 `git log --oneline -3` 查看最近提交风格
4. 将所有修改的文件（modified + untracked）加入暂存区（使用具体文件名，不要用 `git add -A`）
5. 根据变更内容生成简洁的中文提交信息，格式：一行摘要 + 空行 + 要点列表
6. 提交并推送到远程：`git push origin <当前分支>`
7. 确认推送成功
