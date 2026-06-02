---
title: Templater + QuickAdd 自动化管线
tags: [Templater, QuickAdd, 自动化]
date: 2026-06-01
---

# Templater + QuickAdd 自动化管线

## 目标

实现"5 秒新建笔记"：按快捷键 → 选模板 → 输入标题 → 自动建档

## 已创建模板

| 模板 | 用途 | 调用方式 |
|------|------|----------|
| `Templater/Daily.md` | 每日笔记 | QuickAdd: Daily |
| `Templater/Project.md` | 项目笔记 | QuickAdd: Project |
| `Templater/Knowledge.md` | 知识笔记 | QuickAdd: Knowledge |
| `Templater/Debug-Record.md` | 报错排查 | QuickAdd: Debug |
| `Templater/Meeting.md` | 会议纪要 | QuickAdd: Meeting |
| `Templater/Literature-Review.md` | 文献阅读 | QuickAdd: Literature |

## Templater 配置

### 1. 设置模板文件夹

`设置 → Templater → 模板文件夹位置` → 选择 `Templater`

### 2. 启用 "启用 Templater" 替换

`设置 → Templater → 启动 Templater` 开启

### 3. 模板触发

- 快捷键插入：`Alt + E`（默认）
- 命令面板：`Templater: Insert template`
- 配合 QuickAdd 实现快捷创建

## Templater 语法速查

```markdown
<% tp.date.now("YYYY-MM-DD") %>          <!-- 当前日期 -->
<% tp.file.title %>                       <!-- 文件名（去掉 .md） -->
<% tp.file.cursor(N) %>                   <!-- 光标位置 -->
<% tp.system.prompt("提示语") %>          <!-- 弹窗输入 -->
<% tp.system.suggest(["A", "B", "C"]) %>  <!-- 下拉选择 -->
<% tp.user.my_function() %>               <!-- 调用脚本 -->
```

## QuickAdd 配置

### 1. 设置 QuickAdd 宏

打开 `设置 → QuickAdd → Macros`，创建以下宏：

#### Macro: NewDaily
- 类型：Macro
- 命令：Templater: Insert template
- 模板：`Templater/Daily.md`
- 目标文件夹：`Daily`

#### Macro: NewProject
- 类型：Template
- 模板：`Templater/Project.md`
- 目标文件夹：`Projects`

#### Macro: NewKnowledge
- 类型：Template
- 模板：`Templater/Knowledge.md`
- 目标文件夹：`Knowledge`

#### Macro: NewDebug
- 类型：Template
- 模板：`Templater/Debug-Record.md`
- 目标文件夹：`Knowledge/Debug`

#### Macro: NewMeeting
- 类型：Template
- 模板：`Templater/Meeting.md`
- 目标文件夹：`Sessions/Meetings`

#### Macro: NewLiterature
- 类型：Template
- 模板：`Templater/Literature-Review.md`
- 目标文件夹：`Knowledge/Literature`

### 2. 设置快捷键

`设置 → 快捷键 → 搜索 QuickAdd` 给每个宏绑定快捷键。

推荐绑定：

| 宏 | 快捷键 |
|----|--------|
| NewDaily | `Ctrl + Shift + D` |
| NewProject | `Ctrl + Shift + P` |
| NewKnowledge | `Ctrl + Shift + K` |
| NewDebug | `Ctrl + Shift + B` |
| NewMeeting | `Ctrl + Shift + M` |
| NewLiterature | `Ctrl + Shift + L` |

## 高级：Templater 脚本

可在 `Templater/scripts/` 创建自定义 JS 函数：

```javascript
// scripts/date-utils.js
module.exports = {
  chineseDate: (format = "YYYY年MM月DD日") => {
    return moment().format(format);
  },
  weekOfYear: () => {
    return moment().week();
  }
};
```

调用：`<% tp.user.chineseDate() %>`

## 与 Dataview 联动

模板中的 `\`\`\`dataview` 块可在文件创建后自动查询：

```markdown
\`\`\`dataview
LIST
FROM "Projects"
WHERE status = "进行中"
\`\`\`
```

## 常见问题

### Q: 模板未生效？
A: 检查 Templater 插件是否启用、模板文件夹路径是否正确。

### Q: QuickAdd 不弹出宏选项？
A: 需要先在 QuickAdd 设置中添加 Macro。

### Q: 模板变量未替换？
A: 确认使用 `<% %>` 语法（Templater），而非 `{{ }}`（QuickAdd 原生）。

## 相关链接

- [Templater 官方文档](https://silentvoid13.github.io/Templater/)
- [QuickAdd 官方文档](https://github.com/chhoumann/quickadd)
- [[Templater 用户脚本库]]
