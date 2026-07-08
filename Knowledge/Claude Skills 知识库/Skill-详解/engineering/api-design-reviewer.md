---
tags: [claude-skill, engineering, api, rest, design]
domain: engineering
source: claude-skills/engineering/skills/api-design-reviewer
version: 2.9.0
---

# api-design-reviewer

## 1. 元信息
- **仓库源**：claude-skills/engineering/skills/api-design-reviewer
- **路径**：`C:\Users\15389\claude-skills\claude-skills\engineering\skills\api-design-reviewer`
- **版本**：2.9.0
- **分类**：Engineering > API
- **触发词**："Use when the user asks to review API design, check REST best practices, or validate endpoint naming"

## 2. 一句话定位
审查 REST/GraphQL API 设计，识别反模式，输出改进建议。

## 3. 常见 API 反模式

| 反模式 | 例子 | 改进 |
|--------|------|------|
| 动词 URL | `/api/createUser` | 用名词 + POST：`/api/users` |
| 不一致命名 | `/getUser` vs `/users-list` | 统一 `/users` |
| 错误响应不一致 | 有的用 `code`，有的用 `error` | 统一 RFC 7807 |
| 缺少分页 | 返回所有数据 | 用 cursor 或 offset 分页 |
| 缺少版本 | `/api/users` | `/api/v1/users` |
| 缺少限流 | 无 rate limit | 加 rate limit headers |
| 缺少幂等性 | POST 不支持重试 | 加 Idempotency-Key |
| 暴露内部细节 | 暴露数据库字段 | 用 DTO 转换 |

## 4. 工作流（核心）

### Step 1: api_linter
- 检查 URL 设计
- 检查 HTTP method 使用
- 检查请求/响应格式
- 输出：lint_report.json

### Step 2: api_scorecard
- 可发现性 (Discoverability)
- 一致性 (Consistency)
- 可演化性 (Evolvability)
- 安全性 (Security)
- 输出：scorecard.json

### Step 3: breaking_change_detector
- 对比 v1 和 v2
- 识别破坏性变更
- 输出：breaking_changes.json

## 5. RESTful 设计规则

### 5.1 URL 设计
```
✅ GET    /users              列表
✅ GET    /users/{id}         详情
✅ POST   /users              创建
✅ PUT    /users/{id}         全量更新
✅ PATCH  /users/{id}         部分更新
✅ DELETE /users/{id}         删除

❌ /api/getUsers
❌ /api/user/list
❌ /api/create_user
```

### 5.2 HTTP Status Codes
| Code | 含义 |
|------|------|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 422 | Unprocessable Entity |
| 429 | Too Many Requests |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

### 5.3 错误响应（RFC 7807）
```json
{
  "type": "https://example.com/probs/out-of-credit",
  "title": "You do not have enough credit.",
  "detail": "Your current balance is 30, but that costs 50.",
  "instance": "/account/12345/msgs/abc",
  "balance": 30,
  "accounts": ["/account/12345", "/account/67890"]
}
```

## 6. 源码解析

### 6.1 Python 工具脚本
- **api_linter.py** — API linting
- **api_scorecard.py** — 评分卡
- **breaking_change_detector.py** — 破坏性变更检测

### 6.2 参考文档
- **api_antipatterns.md** — API 反模式库
- **rest_design_rules.md** — REST 设计规则

## 7. 调用示例

### 示例 1：审查现有 API
```
用户：审查我的 /api/users 接口设计

Claude（自动调用 api-design-reviewer）：
1. api_linter → 发现：
   - URL 用了动词（/api/createUser）
   - 错误响应不一致
   - 缺少分页
2. api_scorecard → 综合评分 65/100
3. 输出改进建议 + 示例代码
```

## 8. 与其它 Skill 的关系
- **配合**：`spec-driven-workflow`、`api-test-suite-builder`、`database-designer`
- **后置**：`code-review`

## 9. 来源链接
- GitHub: https://github.com/alirezarezvani/claude-skills
- 本地路径：`C:\Users\15389\claude-skills\claude-skills\engineering\skills\api-design-reviewer`
- SKILL.md: `SKILL.md`