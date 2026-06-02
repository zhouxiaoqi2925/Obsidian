---
title: Git 自动备份方案
tags: [Git, 备份, 版本控制, 自动化]
date: 2026-06-01
---

# Git 自动备份方案

## 目标

实现 Obsidian Vault 的多端同步 + 版本控制 + 灾难恢复。

## 方案对比

| 方案 | 优点 | 缺点 | 适用 |
|------|------|------|------|
| **Git + GitHub** | 免费、版本控制 | 私有仓库限制 | 主力方案 ✅ |
| Obsidian Sync | 官方、加密 | 付费 $4/月 | 不想折腾 |
| iCloud / OneDrive | 简单 | 冲突多 | 临时方案 |
| 坚果云 | 国内稳定 | 无版本控制 | 国内网络 |

**推荐：Git + GitHub 私有仓库**

## 实施步骤

### 1. 初始化仓库

在 Vault 根目录执行：

```bash
cd "G:\Obsidian Vault"
git init
git add .
git commit -m "Initial commit: vault snapshot 2026-06-01"
```

### 2. 添加 .gitignore

创建 `G:\Obsidian Vault\.gitignore`：

```gitignore
# 临时文件
*.swp
*.swo
*~
.DS_Store
Thumbs.db

# Obsidian 配置（可选）
.obsidian/workspace.json
.obsidian/cache/
.obsidian/plugins/*/data.json

# 嵌入向量缓存
.smart-connections/
```

### 3. 创建 GitHub 仓库

1. 登录 GitHub
2. New repository → 命名（如 `obsidian-vault-private`）
3. 选择 **Private**
4. **不要**勾选 "Initialize with README"

### 4. 关联远程仓库

```bash
git remote add origin git@github.com:你的用户名/obsidian-vault-private.git
git branch -M main
git push -u origin main
```

### 5. 自动备份脚本

#### Windows 批处理（vault 根目录）

创建 `G:\Obsidian Vault\backup.bat`：

```bat
@echo off
chcp 65001
echo === Obsidian Vault Auto Backup ===
echo Starting at %date% %time%

cd /d "G:\Obsidian Vault"

:: 检查是否有变更
git add -A

:: 如果有变更则提交
git diff --cached --quiet
if %errorlevel% neq 0 (
    git commit -m "Auto backup: %date% %time%"
    git push origin main
    echo ✅ Backup completed
) else (
    echo ℹ️  No changes to backup
)

echo === Done ===
```

#### 计划任务

1. `Win + R` → `taskschd.msc`
2. 创建任务 → 触发器 → 每天 23:00
3. 操作 → 启动程序 → `G:\Obsidian Vault\backup.bat`

### 6. Obsidian 内 Git 插件

**Obsidian Git** 插件（可选）：

[obsidian://show-plugin?id=obsidian-git](obsidian://show-plugin?id=obsidian-git)

- 状态栏显示 Git 状态
- 快捷键提交/推送
- 自动备份（可设置间隔）

## 多端同步

### 场景

- 办公电脑：Win 11
- 家用电脑：Mac
- 移动端：iPad
- 临时设备：Linux

### 流程

```
任何设备编辑 → 提交 → 推送 → 其他设备拉取
```

### 拉取命令

```bash
cd "G:\Obsidian Vault"  # 或对应路径
git pull origin main
```

## 冲突处理

### 预防

- 一台设备编辑完，提交后再换设备
- 编辑前先 `git pull`

### 解决

```bash
git stash
git pull origin main
git stash pop
```

如冲突：
1. Obsidian 中打开冲突文件
2. 手动选择保留内容
3. `git add .` → `git commit -m "Resolve conflict"` → `git push`

## 灾难恢复

### 本地恢复

Vault 文件误删：
```bash
git checkout -- 文件名.md
```

### 全量恢复

```bash
git clone git@github.com:用户名/obsidian-vault-private.git
```

## 隐私

- GitHub 私有仓库：只对自己和授权协作者可见
- 敏感笔记（密码、token）：用 `.envignore` 排除
- 嵌入向量：可关闭

## 监控与告警

### GitHub Actions 自动备份校验

`.github/workflows/backup-check.yml`：

```yaml
name: Backup Check
on:
  schedule:
    - cron: '0 0 * * *'
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Check vault size
        run: |
          echo "Notes count: $(find . -name '*.md' | wc -l)"
          echo "Total size: $(du -sh .)"
```

## 备份策略

```
本地 Vault（工作目录）
    ↓ git commit
本地 Git 仓库
    ↓ git push
GitHub 远程仓库
    ↓ git clone（其他设备）
其他设备 Vault
```

## 自动化清单

- [ ] 初始化 Git 仓库
- [ ] 创建 .gitignore
- [ ] 推送到 GitHub 私有仓库
- [ ] 创建 backup.bat
- [ ] 配置 Windows 计划任务
- [ ] （可选）安装 Obsidian Git 插件
- [ ] （可选）创建 GitHub Actions 监控

## 常见问题

### Q: 推送失败（认证）？
A: GitHub 已不支持密码认证，需用 SSH Key 或 Personal Access Token。

### Q: 仓库太大？
A: 大于 100MB 会有警告。可用 Git LFS 存大文件，或 .gitignore 排除。

### Q: 中文文件名乱码？
A: `git config --global core.quotepath false`

## 相关链接

- [Git 官方文档](https://git-scm.com/doc)
- [Obsidian Git 插件](https://github.com/Vinzent03/obsidian-git)
- [[Knowledge/proactive-knowledge-mgmt]]
