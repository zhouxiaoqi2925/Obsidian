---
tags: [claude-skill, engineering, security, audit]
domain: engineering
source: claude-skills/claude-plugins-official/plugins/security-guidance
version: latest
---

# security-guidance

## 1. 元信息
- **仓库源**：claude-plugins-official/plugins/security-guidance
- **路径**：`C:\Users\15389\claude-skills\claude-plugins-official\plugins\security-guidance`
- **分类**：Engineering > Security
- **触发词**：自动激活（在 Claude 写代码时检查安全问题）

## 2. 一句话定位
通过 PreToolUse Hook 在 Claude 每次写代码前进行安全提醒的 Skill。

## 3. 解决什么问题
- AI 写代码时容易忽略安全问题（SQL 注入、XSS、密钥泄露）
- 事后审计成本高，写时预防成本低
- 不强制不执行（hooks 提供强制机制）

## 4. 工作原理（Hook 机制）

### 4.1 PreToolUse Hook
```
当 Claude 准备执行工具（如 Write/Edit）时：
  ↓
Hook 触发 → security_reminder_hook.py
  ↓
分析即将写入的代码
  ↓
检测安全风险模式
  ↓
提醒 Claude 修复
  ↓
允许继续
```

### 4.2 检测的安全问题

| 类别 | 示例 |
|------|------|
| **SQL 注入** | 字符串拼接 SQL、ORM 误用 |
| **XSS** | 未转义的用户输入 |
| **密钥泄露** | 硬编码 API key、password in code |
| **CSRF** | 缺少 CSRF token |
| **认证绕过** | 缺少权限检查 |
| **不安全反序列化** | pickle、yaml.load |
| **路径遍历** | ../ 路径拼接 |
| **XXE** | XML 解析漏洞 |
| **命令注入** | os.system / subprocess shell=True |

## 5. 源码解析

### 5.1 Hooks
- **security_reminder_hook.py** — 主 hook
- **hooks.json** — Hook 配置
- **_base.py / diffstate.py / gitutil.py / llm.py / patterns.py / review_api.py / session_state.py** — 工具模块

### 5.2 启动脚本
- **sg-python.sh** — 启动 Python hook 服务

### 5.3 参考文档
- **pretooluse_hook_canon.md** — PreToolUse Hook 规范

## 6. 调用示例

### 示例 1：检测 SQL 注入
```python
# 用户写：
def get_user(user_id):
    return db.execute(f"SELECT * FROM users WHERE id = {user_id}")

# Hook 检测 → 警告：
⚠️ Security Warning: String concatenation in SQL query detected.
   Recommendation: Use parameterized query.
   
# Claude 自动修复：
def get_user(user_id):
    return db.execute("SELECT * FROM users WHERE id = %s", (user_id,))
```

### 示例 2：检测密钥泄露
```python
# 用户写：
API_KEY = "sk-1234567890abcdef"

# Hook 检测 → 警告：
⚠️ Security Warning: Hardcoded API key detected.
   Recommendation: Use environment variable.
   
# Claude 自动修复：
import os
API_KEY = os.environ["API_KEY"]
```

## 7. 与其它 Skill 的关系
- **基础**：所有代码类 Skill 都受益
- **配合**：`secrets-vault-manager`、`env-secrets-manager`、`trailofbits/*`
- **集成**：在 Claude Code 项目级 `.claude/settings.json` 启用

## 8. 注意事项
- 这是提醒机制，不是替代 SAST
- 仍需要专业的安全审计
- 对误报需要忽略机制
- Hook 性能开销（每次工具调用都触发）

## 9. 启用方式

在 `.claude/settings.json`：
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "python ${CLAUDE_PLUGIN_ROOT}/hooks/security_reminder_hook.py"
          }
        ]
      }
    ]
  }
}
```

## 10. 来源链接
- GitHub: https://github.com/anthropics/claude-plugins-official
- 本地路径：`C:\Users\15389\claude-skills\claude-plugins-official\plugins\security-guidance`
- SKILL.md: `skills/security-guidance/SKILL.md`