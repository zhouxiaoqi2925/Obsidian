# MCP (Model Context Protocol) 技术笔记

## 什么是 MCP

MCP 是 Anthropic 推出的模型上下文协议，用于连接 AI 模型与外部工具和数据源。

## 工作原理

```
┌──────────────┐     MCP      ┌───────────────┐
│   Claude     │◄────────────►│  MCP Server   │
│   Code       │   stdio/HTTP  │  (如 Obsidian)│
└──────────────┘              └───────────────┘
```

## Claude Code 中的 MCP

### 已配置的服务器

| 服务器 | 类型 | 用途 |
|--------|------|------|
| obsidian | stdio | 通过 Local REST API 访问笔记 |
| obsidian-brain | stdio | 直接文件系统访问 |
| hex-line | stdio | 代码编辑和搜索 |

### 工具命名约定
- 格式: `mcp__服务器名__工具名`
- 例如: `mcp__obsidian__obsidian_list_notes`

## 配置方法

### 1. 安装 MCP 包
```bash
npm install -g <mcp-package>
```

### 2. 注册服务器
```bash
claude mcp add -s user <server-name> -- npx -y <package>
```

### 3. 设置环境变量
通过 `~/.claude.json` 的 `env` 字段或启动脚本配置。

## Obsidian MCP 工具列表

| 工具 | 功能 |
|------|------|
| obsidian_get_note | 读取笔记 |
| obsidian_list_notes | 列出笔记 |
| obsidian_list_tags | 列出标签 |
| obsidian_search_notes | 搜索笔记 |
| obsidian_write_note | 创建笔记 |
| obsidian_append_to_note | 追加内容 |
| obsidian_patch_note | 编辑章节 |
| obsidian_replace_in_note | 全文替换 |
| obsidian_manage_frontmatter | YAML管理 |
| obsidian_manage_tags | 标签管理 |
| obsidian_delete_note | 删除笔记 |

## 依赖条件

- Obsidian 必须运行
- Local REST API 插件必须启用
- HTTPS 端口 27124 必须可访问