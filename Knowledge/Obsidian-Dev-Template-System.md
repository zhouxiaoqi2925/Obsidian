---
tags: [obsidian, template, dev-knowledge-base]
type: system-doc
created: 2026-06-01
---

# Obsidian 开发技术知识库｜7 套标准化模板体系

> 全部模板位于 `G:\Obsidian Vault\Wiki\_templates\`，已用 Obsidian 内置变量 `{{title}}` `{{date}}` 编写，Templater 插件可直接触发。

## 模板总览

| # | 模板文件 | 适用场景 | 关键字段 |
|---|----------|----------|----------|
| 1 | [[tech-general.md\|tech-general]] | 通用技术学习 | type=tech-note |
| 2 | [[tech-java.md\|tech-java]] | Java / JVM / Spring | language=java |
| 3 | [[tech-python.md\|tech-python]] | Python 脚本/爬虫 | language=python |
| 4 | [[tech-linux.md\|tech-linux]] | Linux / 云服务 | platform=linux |
| 5 | [[tech-database.md\|tech-database]] | MySQL / Redis | db_type |
| 6 | [[debug-record.md\|debug-record]] | 报错排查 | severity / status |
| 7 | [[project-architecture.md\|project-architecture]] | 项目架构 | project_status |

## 统一使用规则

### 1. 命名规范
`技术点-核心主题-日期`
- ✅ `Java-JVM-内存模型-20260601`
- ✅ `Linux-Nginx-反向代理-20260601`
- ✅ `报错-MySQL-索引失效-20260601`
- ❌ `笔记1` `新建笔记` `2026-06-01`

### 2. Frontmatter 必填
```yaml
---
tags: [java, jvm, memory-model]
type: tech-note          # 笔记类型，必填
created: 2026-06-01
category: Java
---
```

### 3. 代码块规范
所有代码必须标注语言：

````markdown
```java
public class Foo {}
```

```bash
ls -la
```

```yaml
server:
  port: 8080
```

```sql
SELECT * FROM users;
```
````

### 4. 双向链接强制
每篇笔记必须 ≥3 个 `[[关联笔记]]`，最少也要 1 个，零链接的孤儿笔记禁止入库。

### 5. 报错记录必须包含
- **现象**：完整 stack trace
- **根因**：表层 + 底层
- **方案**：可执行的修复代码/命令
- **验证**：回归测试 / 监控指标
- **复盘**：checklist（监控、测试、文档、通知）

## 模板设计原则

| 原则 | 说明 |
|------|------|
| **AI 友好** | 结构清晰、字段明确，便于 AI 自动解析和补全 |
| **可搜索** | Frontmatter 字段可被 Dataview 检索统计 |
| **可串联** | 双向链接形成网状知识结构 |
| **可复用** | 同类技术共用同一模板 |
| **可演进** | 模板版本号字段，方便后续升级 |

## 如何调用模板

### 方式一：Templater 插件（推荐）

1. 安装 Templater 插件
2. 设置 → Templater → Template Folder = `Wiki/_templates/`
3. 命令面板 → `Templater: Insert Template` → 选择对应模板
4. Obsidian 自动填充 `{{date}}`，输入 `{{title}}`（文件名）

### 方式二：手动复制

打开 `Wiki/_templates/对应文件.md` → 复制全部内容 → 粘贴到新笔记 → 改标题

### 方式三：AI 调用

把模板内容发给 Claude，AI 按模板生成新笔记内容，你复制入库。

## Dataview 自动统计示例

```dataview
TABLE type, category, created
FROM ""
WHERE type = "tech-note"
SORT created DESC
LIMIT 20
```

```dataview
TABLE severity, status
FROM ""
WHERE type = "debug-record" AND status = "open"
```

## 模板升级流程

1. 修改 `Wiki/_templates/xxx.md`
2. 同步 `template_version` 字段（如 1.0 → 1.1）
3. 在 [[Wiki/Engineering/_index]] 记录变更
4. 老笔记按需手动升级或批量脚本替换

## 🔗 关联笔记

- [[开发技术知识库搭建指南]]
- [[AI知识库维护系统提示词]]
- [[proactive-knowledge-mgmt]]
