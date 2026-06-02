---
tags: [knowledge, obsidian, plugin-dev]
created: 2026-05-31
source: Obsidian知识库搭建
---

# Obsidian 插件开发要点

## 项目结构

```
.obsidian/plugins/my-plugin/
├── src/main.ts          # TypeScript 源码
├── main.js              # esbuild 打包输出
├── manifest.json        # 插件注册信息
├── versions.json        # Obsidian 版本兼容
├── styles.css           # 样式（可选）
├── esbuild.config.mjs   # 构建配置
├── package.json
└── tsconfig.json
```

## manifest.json 格式

```json
{
  "id": "my-plugin-id",
  "name": "插件显示名称",
  "version": "1.0.0",
  "minAppVersion": "1.0.0",
  "description": "描述",
  "author": "作者",
  "isDesktopOnly": false
}
```

## CommonJS 导出 (关键!)

Obsidian 插件必须使用 CommonJS 模块格式：

```javascript
// esbuild 输出格式
var main_exports = {};
__export(main_exports, {
  default: () => MyPlugin
});
module.exports = __toCommonJS(main_exports);
```

**esbuild 构建命令**:
```bash
npx esbuild src/main.ts --bundle --platform=node \
  --external:obsidian --format=cjs --target=es2020 \
  --outfile=main.js
```

## Plugin API 要点

```typescript
export default class MyPlugin extends Plugin {
  async onload() {
    // 侧边栏按钮
    this.addRibbonIcon("sparkles", "标题", callback);

    // 命令面板
    this.addCommand({ id: "xxx", name: "显示名", callback });

    // 编辑器命令
    this.addCommand({
      id: "xxx",
      name: "显示名",
      editorCallback: (editor) => { ... }
    });
  }

  onunload() { }
}
```

## 注册到 Obsidian

1. `community-plugins.json` 添加插件 ID
2. `hotkeys.json` 添加快捷键绑定（可选）
3. 重启 Obsidian
4. Settings → Community Plugins → 启用

## 注意事项

- ✅ 使用 TypeScript + esbuild，不要手写 CommonJS
- ✅ `require("obsidian")` 必须在打包时标记为 external
- ✅ 插件 ID 必须与 manifest.json 一致
- ❌ 不要直接 `module.exports = function() {}`
- ❌ GitHub raw URL 在中国可能被墙，用 jsDelivr CDN
