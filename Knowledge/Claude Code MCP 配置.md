---
tags: [knowledge, mcp, claude-code]
created: 2026-05-31
source: Obsidian知识库搭建
---

# Claude Code MCP 配置指南

## .claude.json MCP 配置

```json
{
  "mcpServers": {
    "server-name": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "npx", "-y", "package-name", "--arg", "value"],
      "env": {
        "ENV_VAR": "value"
      }
    }
  }
}
```

## 关键问题与解决

### Windows Git Bash 路径转换

`MSYS_NO_PATHCONV=1` 防止 MSYS2 自动转换路径：
```bash
MSYS_NO_PATHCONV=1 claude mcp add -s user server-name -- cmd /c npx -y package
```

### 环境变量传递

❌ **不工作**: `cmd /c set FOO=bar && npx ...`
  → env vars 在 `set` 和 `npx` 之间丢失

✅ **正确**: 使用 `.claude.json` 的 `env` 字段

### PowerShell 包装器问题

❌ **不工作**: `powershell.exe -Command "& 'launcher.cmd'"`
  → 导致 STDIO 通信失败

✅ **正确**: `cmd /c npx ...` 直接调用

### 自签名 SSL 证书

Obsidian Local REST API 使用自签名证书：
- 设置 `OBSIDIAN_VERIFY_SSL=false` 环境变量
- 或在请求时跳过证书验证

## 各 MCP 服务器配置

### obsidian-mcp-server
```json
{
  "command": "cmd",
  "args": ["/c", "npx", "-y", "obsidian-mcp-server", "--vault-path", "G:/Obsidian%20Vault"],
  "env": {
    "OBSIDIAN_API_KEY": "your-api-key",
    "OBSIDIAN_BASE_URL": "https://127.0.0.1:27124"
  }
}
```

### obsidian-brain
```json
{
  "command": "cmd",
  "args": ["/c", "npx", "-y", "obsidian-brain", "server"],
  "env": {
    "VAULT_PATH": "G:/Obsidian Vault"
  }
}
```

### hex-line
```json
{
  "command": "cmd",
  "args": ["/c", "npx", "-y", "@levnikolaevich/hex-line-mcp"]
}
```
