---
title: Templater 用户脚本库
tags: [Templater, 脚本, 自动化]
date: 2026-06-01
---

# Templater 用户脚本库

> 自定义 JS 脚本，通过 `<% tp.user.xxx() %>` 调用

## 存放位置

`Templater/scripts/` 文件夹（需在 Templater 设置中配置 "用户脚本文件夹位置"）

## 实用脚本

### 1. 中文日期

```javascript
// scripts/chinese-date.js
function chineseDate() {
  const now = new Date();
  const weekDays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 周${weekDays[now.getDay()]}`;
}

module.exports = chineseDate;
```

调用：`<% tp.user.chineseDate() %>`

输出：`2026年6月1日 周一`

### 2. 项目代号生成

```javascript
// scripts/project-code.js
function projectCode(name) {
  const letters = name.match(/[A-Z]/g) || [];
  const prefix = letters.length >= 2 ? letters.slice(0, 2).join("") : name.slice(0, 2).toUpperCase();
  const num = String(Math.floor(Math.random() * 99)).padStart(2, "0");
  return `${prefix}-${num}`;
}

module.exports = projectCode;
```

调用：`<% tp.user.projectCode(tp.file.title) %>`

### 3. 知识 ID 自增

```javascript
// scripts/next-knowledge-id.js
async function nextKnowledgeId(tp) {
  const files = tp.app.vault.getMarkdownFiles()
    .filter(f => f.path.startsWith("Knowledge/"));
  const nums = files
    .map(f => parseInt(f.basename.match(/KN-(\d+)/)?.[1] || "0"))
    .filter(n => !isNaN(n));
  const next = (Math.max(0, ...nums) + 1).toString().padStart(3, "0");
  return `KN-${next}`;
}

module.exports = nextKnowledgeId;
```

### 4. 自动获取上级分类

```javascript
// scripts/parent-category.js
async function parentCategory(tp) {
  const folder = tp.file.folder();
  if (folder.includes("/")) {
    return folder.split("/").slice(0, -1).join("/");
  }
  return folder;
}

module.exports = parentCategory;
```

### 5. 随机鼓励语

```javascript
// scripts/encouragement.js
const quotes = [
  "今天又是充满可能的一天！",
  "持续学习，持续成长 🚀",
  "代码改变世界 💻",
  "细节决定成败 ⚙️",
  "保持好奇，保持饥饿"
];

function encouragement() {
  return quotes[Math.floor(Math.random() * quotes.length)];
}

module.exports = encouragement;
```

## 配置步骤

1. 在 Vault 根目录创建 `Templater/scripts/` 文件夹
2. 将上述 JS 文件放入
3. Templater 设置 → "用户脚本文件夹位置" → 选择该文件夹
4. 在模板中通过 `<% tp.user.函数名() %>` 调用

## 调试

- 打开 `Ctrl + P` → `Templater: Open template folder`
- 打开开发者控制台（`Ctrl + Shift + I`）查看错误
- 测试时使用简单的 `<% console.log("hello") %>`

## 进阶：动态模板

结合 Obsidian API 实现复杂逻辑：

```javascript
// scripts/auto-related-notes.js
async function autoRelated(tp) {
  const currentTitle = tp.file.title;
  const allFiles = tp.app.vault.getMarkdownFiles();
  
  // 提取关键词
  const keywords = currentTitle.toLowerCase().split(/\s+/);
  
  // 查找相关笔记
  const related = allFiles
    .filter(f => f.basename !== currentTitle)
    .map(f => ({
      name: f.basename,
      score: keywords.filter(k => f.basename.toLowerCase().includes(k)).length
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(x => `- [[${x.name}]]`);
  
  return related.join("\n") || "（暂无相关笔记）";
}

module.exports = autoRelated;
```
