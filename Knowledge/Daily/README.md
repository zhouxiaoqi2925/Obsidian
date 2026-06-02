# 每日知识抓取归档

> 每天自动/人工抓取的开发技术笔记，按日期归档。

## 目录结构

```
Daily/
├── README.md
├── 2026-06-01/
│   ├── 01-xxx.md
│   ├── 02-xxx.md
│   └── ...（每天 10 篇）
├── 2026-06-02/
└── ...
```

## 周报机制

每周日生成周报，归档到：

```
Weekly/
├── 2026-W22.md
├── 2026-W23.md
└── ...
```

## 归档到主目录

每周日由 AI 把高质量笔记合并到主目录：

- Java/Python/Go → `Knowledge/01_编程语言/`
- Linux/云服务 → `Knowledge/02_云计算与服务器/`
- MySQL/Redis → `Knowledge/03_数据库/`
- 框架/中间件 → `Knowledge/04_框架技术/`
- 报错/踩坑 → `Knowledge/05_报错排查/`
- 项目/架构 → `Projects/`

## 质量门槛

- 必含：完整代码示例 / 底层原理 / 至少 3 个 [[关联笔记]]
- 必填：frontmatter（tags / type / created / category）
- 必查：与已入库笔记去重
