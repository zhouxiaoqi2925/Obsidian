# Daily/GitHub Trending

每天自动抓取的 GitHub 热门项目。

## 抓取规则

- **时间**: 每天 08:30 (本地时间)
- **数量**: 10 个仓库
- **查询**: `stars:>100 pushed:>30天前 sort:stars`（最近活跃 + 高 star）
- **目录**: `Daily/GitHub Trending/`
- **文件名**: `YYYY-MM-DD.md`

## 历史抓取

- [2026-07-07](2026-07-07.md) - 首次抓取

## 调度任务

任务 ID: `github-trending-daily`
SKILL.md: `C:\Users\15389\.claude\scheduled-tasks\github-trending-daily\SKILL.md`

修改时间或查询 → 用 `mcp__scheduled-tasks__update_scheduled_task`
停止任务 → 用 `mcp__scheduled-tasks__update_scheduled_task` 设置 `enabled: false`

## 自定义查询

| 场景 | 查询语句 |
|---|---|
| 所有语言，最活跃 | `stars:>100 pushed:>30天前 sort:stars` |
| 只 Python | `stars:>100 pushed:>30天前 sort:stars language:python` |
| 只 TypeScript | `stars:>100 pushed:>30天前 sort:stars language:typescript` |
| 新项目（近 30 天） | `created:>30天前 stars:>50 sort:stars` |
| AI 相关 | `stars:>500 topic:ai sort:stars` |
