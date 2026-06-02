# Mermaid - 图表 DSL 与渲染管线

**来源**：GitHub mermaid-js/mermaid
**创建时间**：2026-06-02

---

## 一、解析器：DSL → AST 的两代方案

### 1. JISON 文法与 yy 对象桥接（LALR Parser）

**问题场景**：30+ 种图表需要不同的 DSL 文法（flowchart / sequenceDiagram / classDiagram...），每种写 hand-written parser 不可能；JISON 生成 LALR(1) 解析器，但 JISON 是 ES5 时代产物，调用 `yy.method` 全局回调，与 ES6 class 兼容性差。

**解决方案**：
```typescript
// packages/mermaid/src/Diagram.ts 简化
public static async fromText(text, metadata = {}) {
  const type = detectType(text, config);
  try { getDiagram(type); }
  catch {
    const loader = getDiagramLoader(type);
    const { id, diagram } = await loader();
    registerDiagram(id, diagram);
  }
  const { db, parser, renderer, init } = getDiagram(type);
  if (parser.parser) parser.parser.yy = db;  // JISON 桥：yy 全局对象挂到 db
  db.clear?.();
  init?.(config);
  await parser.parse(text);
  return new Diagram(type, text, db, parser, renderer);
}

// flowDb.ts 简化
constructor() {
  // 显式 bind：JISON 调 yy.method 时 this 必须指向 db 实例
  this.addVertex = this.addVertex.bind(this);
  this.firstGraph = this.firstGraph.bind(this);
  this.lex = { firstGraph: this.firstGraph.bind(this) };
}
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `parser.parser.yy = db` | JISON 解析期间回调入口 |
| `this.x = this.x.bind(this)` | 14 个方法的显式绑定 |
| `db.lex` | 词法分析阶段回调 |

**最佳实践**：
- ✅ 业务方在 JISON 调用的方法必须 `bind(this)` 一次
- ✅ 抽 `autoBind(this)` 工具避免 14 行冗余 bind
- ✅ 解析失败用 `try-catch getDiagram` 触发 lazy load
- ❌ 切勿假设 JISON 调 `yy.method` 时 `this` 上下文正确
- ❌ 切勿在 JISON 文法里用现代 JS 语法（let/箭头函数）

### 2. Langium 新解析器（Eclipse Langium）

**问题场景**：JISON 文法难写（YAML 风格 BNF）、类型推导弱、IDE 支持差；新图类型（architecture / eventmodeling / packet / treemap）需要更现代的解析器。

**解决方案**：
```typescript
// packages/parser/src/language-server/architecture.langium 简化
grammar ArchitectureGrammar {
  entry Architecture: elements += ArchitectureElement*;
  
  ArchitectureElement: Group | Service | Junction;
  
  Group: 'group' name=ID '{' elements += ArchitectureElement* '}';
  Service: 'service' name=ID (label=STRING)? '{' }';
  Junction: 'junction' name=ID;
}

// 业务方用
import { createServices } from '@mermaid-js/parser';
const services = await createServices({ connection: ... });
const parser = services.architecture.parser.LangiumParser;
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `entry` | 入口规则 |
| `elements +=` | 数组赋值 |
| `name=ID` | 标识符 |
| `STRING?` | 可选字符串 |

**最佳实践**：
- ✅ 新图类型用 Langium（IDE 友好 + 类型安全）
- ✅ 老图（flowchart / sequence）暂不迁 JISON → Langium（成本高）
- ✅ 业务方用 `createServices` 启动独立解析器
- ❌ 切勿把 Langium 用到老图迁移（破坏向后兼容）
- ❌ 切勿在 Langium 文法里用正则（用 grammar 规则）

### 3. detectType 检测器链（Type Detection）

**问题场景**：用户输入一段 mermaid 文本，库要先知道是 flowchart / sequence / classDiagram 中的哪一种；不能用正则（30+ 种图 regex 互相覆盖）。

**解决方案**：
```typescript
// packages/mermaid/src/diagram-api/detectType.ts
export const detectType = function (text, config) {
  text = text
    .replace(frontMatterRegex, '')    // 剥 YAML frontmatter
    .replace(directiveRegex, '')      // 剥 %%{init: ...}%%
    .replace(anyCommentRegex, '\n');  // 注释行变空行
  for (const [key, { detector }] of Object.entries(detectors)) {
    const diagram = detector(text, config);
    if (diagram) return key;  // 首个匹配的 detector 胜出
  }
  throw new UnknownDiagramError(...);
};
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `frontMatterRegex` | YAML frontmatter 正则 |
| `directiveRegex` | `%%{init: ...}%%` 指令 |
| `anyCommentRegex` | `%% ... %%` 注释 |
| detectors 顺序 | 优先级（先注册先匹配） |

**最佳实践**：
- ✅ detector 顺序敏感：`architectureDetector` 必须在 `flowchart` 之前（否则 `flowchart LR` 抢走）
- ✅ 注释行变空行而非删除（保留行号，让 JISON 报错信息准确）
- ✅ detector 只看净化后文本，避免 frontmatter 误判
- ❌ 切勿在 detector 里做昂贵操作（每行都要走一遍）
- ❌ 切勿让两个 detector 同时命中同一文本（顺序敏感是 hack）

### 4. 指令系统与 frontmatter（Directives）

**问题场景**：每张图需要不同配置（主题、字体、布局算法）；如果只能 `mermaid.initialize({ ... })` 全局配置，业务方无法"一张图一个风格"。

**解决方案**：
```text
%%{init: {'theme': 'dark', 'flowchart': {'htmlLabels': false}}}%%
flowchart LR
  A[Start] --> B[Process]
  B --> C[End]
```
```yaml
---
title: My Architecture
config:
  theme: forest
---
flowchart TB
  ...
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `%%{init: {...}}%%` | inline 指令（覆盖全局） |
| `---` | YAML frontmatter（title + config） |
| `%% ... %%` | 注释行 |

**最佳实践**：
- ✅ 业务方用 frontmatter 写文档级配置
- ✅ 用 `%%{init: ...}%%` 单图覆盖
- ✅ 解析失败 fallback（frontmatter 错误不阻断渲染）
- ❌ 切勿在 frontmatter 写超大配置（每次 render 解析）
- ❌ 切勿让两个 frontmatter 冲突（后面覆盖前面）

### 5. 大特性惰性加载（Lazy Loading）

**问题场景**：mermaid 支持 30+ 图类型，但只有 ~10 种常用（flowchart / sequence / class / state / gantt / pie / git / info / journey / quadrant）；ELK / mindmap / architecture 算法每个 200-600KB，全打包让 default bundle 突破 4MB。

**解决方案**：
```typescript
// packages/mermaid/src/diagram-api/diagram-orchestration.ts
const registerLargeFeatures = () => {
  if (injected.includeLargeFeatures) {
    registerDiagram('architecture', ...);  // ELK
    registerDiagram('mindmap', ...);
    registerDiagram('c4', ...);
  }
};

// 按需 import
const { id, diagram } = await loader();  // 异步加载图
```

**关键参数**：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `injected.includeLargeFeatures` | `false` | CDN 模式默认关 |
| `lazyLoadThreshold` | 100KB | 单图超过此值才惰性 |
| default bundle | ~700KB gzipped | 只含常用图 |

**最佳实践**：
- ✅ 业务方按需引用大图：`await import('@mermaid-js/mermaid/architecture')`
- ✅ enterprise 版本 `injected.includeLargeFeatures = true`
- ✅ 用 `import()` 触发 code-split（Vite/Webpack 自动拆 chunk）
- ❌ 切勿让 default bundle 包含所有图（CDN 用户下不动）
- ❌ 切勿在 server 端 `await import()` 后忘记缓存（每次 render 重新加载）

---

## 二、Diagram 抽象：5 元组模式

### 6. DiagramDefinition 五元组（Diagram 抽象）

**问题场景**：30+ 图类型共享同一渲染管线，但每种图有独特结构（flowchart 节点-边 / sequence 参与者-消息 / class 类-继承）；每种重写管线 2000 行不现实。

**解决方案**：
```typescript
// packages/mermaid/src/diagram-api/diagramAPI.ts
export interface DiagramDefinition {
  parser: ParserClass;     // 解析器（如 flow.jison）
  db: DBClass;             // 内存模型
  renderer: RendererClass; // 渲染器
  init?: (config) => void; // 初始化
  styles?: string;         // CSS 样式
  detector?: (text) => Diagram | null;  // 类型检测
}

// 业务方注册自定义图
registerDiagram(
  'myflow',
  {
    parser: MyFlowParser,
    db: MyFlowDb,
    renderer: MyFlowRenderer,
    detector: detectMyFlow,
  },
  detectMyFlow
);
```

**关键参数**：

| 字段 | 必填 | 用途 |
| --- | --- | --- |
| `parser` | ✅ | 解析 DSL → DB |
| `db` | ✅ | 内存模型 |
| `renderer` | ✅ | DB → SVG |
| `init` | ❌ | 配置初始化 |
| `styles` | ❌ | CSS 主题 |
| `detector` | ❌ | 类型检测 |

**最佳实践**：
- ✅ 业务方扩展图只需写 5 元组 + 文法
- ✅ 自定义 CSS 放 `styles`（不污染全局）
- ✅ `init` 用于参数校验和默认值
- ❌ 切勿在 `db` 里加渲染逻辑（违反 SRP）
- ❌ 切勿在 `parser` 里直接生成 SVG（应在 renderer）

### 7. 内存模型 DB 与侵入式 Builder（Diagram DB）

**问题场景**：解析器需要把"节点、边、子图、样式"等数据填到内存模型；手写 getter/setter 又长又臭。

**解决方案**：
```typescript
// packages/mermaid/src/diagrams/flowchart/flowDb.ts 简化
class FlowDB {
  vertices: Vertex[] = [];
  edges: Edge[] = [];
  subGraphs: SubGraph[] = [];
  
  addVertex(id: string, label: string, shape: Shape) {
    this.vertices.push({ id, label, shape, classes: [] });
  }
  
  addEdge(from: string, to: string, label?: string, type?: EdgeType) {
    this.edges.push({ from, to, label, type });
  }
  
  addSubGraph(id: string, title: string) {
    this.subGraphs.push({ id, title, nodes: [] });
  }
  
  clear() {
    this.vertices = [];
    this.edges = [];
    this.subGraphs = [];
  }
}
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `vertices` | 节点列表 |
| `edges` | 边列表 |
| `subGraphs` | 子图（cluster） |
| `clear()` | 每次渲染前清空 |
| `funs[]` | 渲染后回调（tooltip / click） |

**最佳实践**：
- ✅ DB 类只存数据 + 提供 JISON 调用的方法
- ✅ `clear()` 在每次 render 前调用（防状态污染）
- ✅ `funs[]` 数组延迟绑定事件（DOM 注入后才有意义）
- ❌ 切勿让 DB 类超过 1500 行（拆子类）
- ❌ 切勿在 DB 内直接调 renderer

### 8. Renderer 抽象 SVG 生成（SVG Renderer）

**问题场景**：30+ 图类型都要输出 SVG，但 SVG 结构各异（flowchart 用 dagre / sequence 用 swimlane / pie 用 sector）；手写 SVG string 拼接易错。

**解决方案**：
```typescript
// packages/mermaid/src/rendering-util/render.ts 简化
class SVG {
  elem: string;
  vertices: string[];
  edges: string[];
  
  draw(): string {
    return `<svg viewBox="0 0 ${this.width} ${this.height}">
      ${this.vertices.join('')}
      ${this.edges.join('')}
    </svg>`;
  }
}

// 用例
const svg = new SVG();
svg.vertices.push(`<rect x="0" y="0" width="100" height="50" class="node"/>`);
svg.edges.push(`<path d="M100,25 L200,25" class="edge"/>`);
return svg.draw();
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `viewBox` | SVG 坐标空间 |
| `width` / `height` | 渲染尺寸 |
| `class` | CSS hook（`.node` / `.edge`） |
| `<g>` | 分组（layer） |

**最佳实践**：
- ✅ 业务方用 `<g class="layer">` 分层（背景 / 节点 / 边 / 标签）
- ✅ className 命名 `mermaid-<element>` 前缀（防 CSS 冲突）
- ✅ `viewBox` 而非 `width/height`（响应式）
- ❌ 切勿在 SVG 里写 inline style（污染主题）
- ❌ 切勿让 SVG 字符串超过 1MB（DOM 操作慢）

### 9. layout algorithm 可插拔（Layout Strategy）

**问题场景**：不同图需要不同布局算法（flowchart 用 dagre 层次布局 / architecture 用 ELK / 树状图用 tidy-tree）；库作者要支持运行时切换。

**解决方案**：
```typescript
// packages/mermaid/src/rendering-util/render.ts
const registerDefaultLayoutLoaders = () => {
  registerLayoutLoaders([
    { name: 'dagre', loader: async () => await import('./layout-algorithms/dagre/index.js') },
    ...(injected.includeLargeFeatures
      ? [{ name: 'cose-bilkent', loader: async () => await import('./layout-algorithms/cose-bilkent/index.ts') }]
      : []),
  ]);
};

// 业务方注册自定义布局
registerLayoutLoaders([{
  name: 'my-layout',
  loader: async () => await import('./my-layout.js')
}]);

// 切换布局
mermaid.initialize({ layout: 'elk' });
```

**关键参数**：

| 布局 | 适用 | 大小 |
| --- | --- | --- |
| `dagre` | flowchart / state（默认） | 50KB |
| `elk` | 复杂 architecture | 600KB |
| `cose-bilkent` | 网络图（force） | 200KB |
| `tidy-tree` | mindmap / 树 | 80KB |

**最佳实践**：
- ✅ 业务方用 `mermaid.initialize({ layout: 'elk' })` 切换
- ✅ 复杂图用 ELK（处理上千节点仍稳）
- ✅ 默认 dagre 体积小，覆盖 80% 用例
- ❌ 切勿在 flowchart 强制用 ELK（启动慢）
- ❌ 切勿让 layout 算法 modify DB（layout 只读）

### 10. 渲染管线与异步流程（Pipeline）

**问题场景**：mermaid 渲染涉及 parse → layout → draw → sanitize 多步，每步可能异步；用户需要知道"图渲染失败时哪一步出错"。

**解决方案**：
```typescript
// packages/mermaid/src/Diagram.ts 简化
public static async render(id, text, container) {
  const diagram = await Diagram.fromText(text);
  
  // 1. parse
  await diagram.parser.parse(text);  // 同步或异步
  
  // 2. layout
  const layout = await layoutAlgorithms[diagram.renderer.layout]();
  const layoutData = layout(diagram.db);  // 同步
  
  // 3. draw SVG
  const svg = diagram.renderer.draw(layoutData, diagram.db, {
    width: container.clientWidth,
  });
  
  // 4. sanitize + inject
  const safe = DOMPurify.sanitize(svg);
  container.innerHTML = `<div class="mermaid">${safe}</div>`;
  
  return { diagram, svg: safe };
}
```

**关键参数**：

| 步骤 | 同步/异步 | 失败处理 |
| --- | --- | --- |
| parse | 异步 | throw 语法错误 |
| layout | 同步 | throw 节点冲突 |
| draw | 同步 | throw 节点缺失 |
| sanitize | 同步 | 静默过滤 |

**最佳实践**：
- ✅ 业务方用 `try-catch` 包 `Diagram.render()` 抓全链路错误
- ✅ DOMPurify sanitize 防 XSS（用户输入含恶意 SVG）
- ✅ `container.innerHTML` 在 client 端才用，server 端返回字符串
- ❌ 切勿跳过 sanitize（XSS 漏洞）
- ❌ 切勿在 server 端调 `container.innerHTML`（无 DOM）

---

## 三、性能与渲染：DOMPurify、布局、Cypress

### 11. DOMPurify XSS 净化（Sanitization）

**问题场景**：用户输入的 mermaid 文本可能含恶意 SVG 标签（`<script>` / `<foreignObject>` / `onclick`），直接 innerHTML 注入会触发 XSS。

**解决方案**：
```typescript
// packages/mermaid/src/Diagram.ts
import DOMPurify from 'dompurify';

const svg = renderer.draw(layoutData, db);
const safe = DOMPurify.sanitize(svg, {
  USE_PROFILES: { svg: true, svgFilters: true },
  ALLOWED_TAGS: ['svg', 'g', 'path', 'rect', 'text', 'circle', ...],
});
container.innerHTML = safe;
```

**关键参数**：

| 字段 | 推荐 |
| --- | --- |
| `USE_PROFILES.svg` | 开启 SVG profile |
| `FORBID_TAGS` | `['script', 'foreignObject']` |
| `FORBID_ATTR` | `['onload', 'onclick', 'onerror']` |
| `KEEP_CONTENT` | `true`（保留节点内容） |

**最佳实践**：
- ✅ 业务方必须用 DOMPurify sanitize（不可信输入必走）
- ✅ 自定义白名单（只允许 SVG 标准标签）
- ✅ CI 跑 XSS 测试用例（`<script>` / `<foreignObject>`）
- ❌ 切勿跳过 sanitize（哪怕是内部文档）
- ❌ 切勿用正则 replace sanitize（绕过太多）

### 12. 主题系统与 CSS 变量（Theming）

**问题场景**：mermaid 支持 forest / default / dark / base / neutral 5 套主题；业务方要能切换、自定义主题。

**解决方案**：
```typescript
// packages/mermaid/src/themes/theme-base.js 简化
export const themeBase = {
  themeVariables: {
    fontFamily: '"Helvetica", sans-serif',
    primaryColor: '#ECECFF',
    primaryTextColor: '#000',
    primaryBorderColor: '#9370DB',
    lineColor: '#333',
    secondaryColor: '#ffffde',
    tertiaryColor: '#ffffde',
  },
  // ...
};

// 切换主题
mermaid.initialize({ theme: 'dark' });
// 或 inline 指令
%%{init: {'theme': 'forest'}}%%
```

**关键参数**：

| 变量 | 用途 |
| --- | --- |
| `primaryColor` | 节点主色 |
| `primaryTextColor` | 节点文字 |
| `primaryBorderColor` | 节点边框 |
| `lineColor` | 边颜色 |
| `fontFamily` | 字体 |

**最佳实践**：
- ✅ 业务方自定义主题继承 `theme-base`，只覆盖 `themeVariables`
- ✅ 用 CSS 变量（`--mermaid-primary`）让用户再覆盖
- ✅ 主题切换只改 CSS 变量，零重渲染
- ❌ 切勿让主题里包含图像（体积大）
- ❌ 切勿在主题里硬编码字号（应支持响应式）

### 13. ID 唯一性与 domId 冲突（UID Uniqueness）

**问题场景**：同页多张图时，所有图共享同一 `mermaid` class；节点 `id="A"` 会冲突；点击事件 bind 错对象。

**解决方案**：
```typescript
// packages/mermaid/src/rendering-util/uid.ts
let idCounter = 0;
export const getId = (prefix: string) => `${prefix}-mermaid-${idCounter++}`;

// 业务方
mermaid.render(`mermaid-${idCounter}`, text);
// 每个图拿独立 id
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `idCounter` | 单调递增 ID |
| domId 前缀 | `mermaid-{idCounter}-{nodeId}` |
| 安全 | 防止 ID 注入特殊字符 |

**最佳实践**：
- ✅ 业务方每张图传独立 `id` 参数
- ✅ nodeId 用 `flow_A_1` 这种自解释格式
- ✅ 避免特殊字符（`:` / `/` / `\`）在 ID
- ❌ 切勿让两个图共用同一 id（DOM 冲突）
- ❌ 切勿在 ID 里带用户输入（XSS 风险）

### 14. 构建与 esbuild（Build Pipeline）

**问题场景**：mermaid 作为 npm 包需要 ESM / CJS / UMD 多格式输出；浏览器/Node/CDN 三种使用场景；构建复杂度高。

**解决方案**：
```json
// package.json
{
  "main": "dist/mermaid.core.cjs.js",
  "module": "dist/mermaid.core.esm.min.mjs",
  "browser": "dist/mermaid.min.js",
  "types": "dist/packages/mermaid/index.d.ts"
}
```
```typescript
// esbuild.config.mjs
import { build } from 'esbuild';

await build({
  entryPoints: ['src/mermaid.ts'],
  bundle: true,
  format: 'esm',
  splitting: true,
  outdir: 'dist',
});
```

**关键参数**：

| 字段 | 推荐 | 说明 |
| --- | --- | --- |
| `format` | esm / cjs | 输出格式 |
| `splitting` | true | code-split 拆 chunk |
| `external` | 依赖列表 | 不打包 |
| `minify` | true | 生产环境压缩 |

**最佳实践**：
- ✅ 业务方发布 npm 包用 `tsup` 或 `esbuild`（比 webpack 快 10x）
- ✅ `format: 'esm'` + `splitting: true` 让 Vite/Webpack 自动优化
- ✅ 提供 `module` / `main` / `browser` 三种入口字段
- ❌ 切勿发布未压缩产物（CDN 用户下不动）
- ❌ 切勿让 ESM 输出有 .js 后缀（要 .mjs 让 bundler 识别）

### 15. Cypress 视觉回归双引擎（Visual Regression）

**问题场景**：图表视觉敏感（节点位置 / 边走向 / 字体渲染），代码改动后单元测试通过但视觉 regression 无人发现。

**解决方案**：
```typescript
// cypress/e2e/flowchart.test.ts
it('renders basic flowchart', () => {
  cy.visit('/demos/flowchart.html');
  cy.get('.mermaid').compareSnapshot('flowchart-basic');
});
```
```yaml
# .github/workflows/e2e-argos.yml
- uses: argos-ci/action.yml
  with:
    token: ${{ secrets.ARGOS_TOKEN }}
- uses: applitools/eyes-cypress-action@v1
```

**关键参数**：

| 引擎 | 特点 | 价格 |
| --- | --- | --- |
| Argos | 开源 / 自托管 / GitHub PR 评论 | 免费 |
| Applitools | 商业 / AI 智能 diff | 商业付费 |
| `compareSnapshot` | Cypress 截图 + 比对 |  |

**最佳实践**：
- ✅ 业务方关键组件走视觉回归（`compareSnapshot`）
- ✅ 大图拆小图测试（单测渲染 50 节点，比对 10 张截图）
- ✅ 用 `e2e:scope` 只跑 git diff 相关图
- ❌ 切勿对随机数据跑视觉回归（永远 diff）
- ❌ 切勿跳过视觉回归 PR review

---

## 四、生态与扩展：插件、CDN、文档

### 16. registerDiagram 扩展点（Plugin API）

**问题场景**：用户要加自定义图类型（archi / block / radar / 业务流程）；不可能每个都合并到核心。

**解决方案**：
```typescript
// 第三方注册自定义图
import { registerDiagram } from '@mermaid-js/mermaid';
import { MyFlowParser, MyFlowDb, MyFlowRenderer } from 'my-flow-package';

registerDiagram(
  'myflow',
  {
    parser: MyFlowParser,
    db: MyFlowDb,
    renderer: MyFlowRenderer,
    detector: (text) => text.startsWith('myflow') ? { id: 'myflow' } : null,
  },
  (text) => text.startsWith('myflow') ? { id: 'myflow' } : null
);
```

**关键参数**：

| 字段 | 必填 |
| --- | --- |
| `id` | ✅ 图类型 ID |
| `def.parser` | ✅ |
| `def.db` | ✅ |
| `def.renderer` | ✅ |
| `detector` | ✅ 类型检测函数 |

**最佳实践**：
- ✅ 第三方用 `registerDiagram` 注入自定义图
- ✅ 同名 id 会覆盖（设计选择，但业务方要小心）
- ✅ 业务方配 `injectUtils` 拿到 mermaid 运行时（log / config / sanitize）
- ❌ 切勿修改核心 diagram（应 fork）
- ❌ 切勿让 detector 太宽松（误匹配其他图）

### 17. CDN 部署与浏览器端使用（CDN Distribution）

**问题场景**：业务方想"在 HTML 里直接用 mermaid 渲染"，不想走 npm install；CDN + UMD 是最简单路径。

**解决方案**：
```html
<!-- jsdelivr CDN -->
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>
  mermaid.initialize({ startOnLoad: true });
</script>

<!-- ESM CDN -->
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true });
</script>
```

**关键参数**：

| CDN | URL |
| --- | --- |
| jsDelivr | `cdn.jsdelivr.net/npm/mermaid@10/dist/` |
| unpkg | `unpkg.com/mermaid@10/dist/` |
| ESM | `cdn.jsdelivr.net/npm/mermaid@10/+esm` |

**最佳实践**：
- ✅ 业务方文档站用 jsDelivr（免费、全球 CDN）
- ✅ 用 ESM 版本（import 静态分析，tree-shake）
- ✅ `startOnLoad: true` 自动找 `pre.mermaid` 块
- ❌ 切勿用未压缩 UMD 体积（800KB+）
- ❌ 切勿在 production 引用 `latest`（应固定版本）

### 18. SSR 与 Node 端渲染（Server-Side Rendering）

**问题场景**：服务端生成 HTML 嵌入 mermaid SVG（提升首屏、SEO 友好）；不能在 server 调 DOM API。

**解决方案**：
```typescript
// server 端（Node）
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false });

// 用 jsdom 模拟 DOM
const { JSDOM } = await import('jsdom');
const dom = new JSDOM('<!DOCTYPE html><body></body>');
globalThis.document = dom.window.document;

const { svg } = await mermaid.render('id1', 'flowchart LR\n A-->B');
return `<div>${svg}</div>`;
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `jsdom` | Node 端模拟 DOM |
| `mermaid.render(id, text)` | 返回 `{svg, diagramType}` |
| 不调 `innerHTML` | 返回字符串给 client |

**最佳实践**：
- ✅ 业务方用 `puppeteer` 或 `playwright` 真渲染（更准）
- ✅ jsdom 性能低，CI 谨慎用
- ✅ SVG 字符串可缓存（同一 text → 同一 svg）
- ❌ 切勿在 server 端调 `mermaid.run()`（依赖 DOM）
- ❌ 切勿忽略 jsdom 与真实浏览器的 SVG 差异

### 19. 文档站 VitePress（Documentation Site）

**问题场景**：mermaid 文档站要展示 DSL 语法 + 实时渲染 + 代码高亮 + 多语言；普通静态站太弱。

**解决方案**：
```bash
# docs/package.json
{
  "scripts": {
    "dev": "vitepress dev",
    "build": "vitepress build"
  }
}

# docs/.vitepress/config.ts
export default {
  title: 'Mermaid',
  themeConfig: {
    sidebar: syntaxMenu,  // 自动从 syntax/ 生成
  },
}
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `.vitepress/config.ts` | VitePress 配置 |
| `docs/syntax/*.md` | 每种图语法文档 |
| `themeConfig.sidebar` | 自动生成侧边栏 |
| `markdown.code` | 代码块配置 |

**最佳实践**：
- ✅ 业务方文档站用 VitePress / Docusaurus（生态成熟）
- ✅ `syntax/` 目录每图一个 md，自动生成侧边栏
- ✅ 用 `::: mermaid` 容器在文档里嵌入实时渲染
- ❌ 切勿文档站直接用 mermaid.run()（要控制 lifecycle）
- ❌ 切勿把文档站和核心库强耦合（解耦部署）

### 20. 多语言与本地化（i18n）

**问题场景**：mermaid 错误信息要支持多语言；业务方在全球部署，错误信息需本地化。

**解决方案**：
```typescript
// packages/mermaid/src/i18n/index.ts
import en from './lang/en';
import zh from './lang/zh';
import ja from './lang/ja';

export const translations = { en, zh, ja };

// 错误信息
throw new UnknownDiagramError({
  message: translations[lang].unknownDiagram,
});
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `lang` | 浏览器语言 |
| `translations` | key → 多语言映射 |
| `Intl.DateTimeFormat` | 浏览器原生 i18n |

**最佳实践**：
- ✅ 业务方 i18n 用 ICU MessageFormat（支持复数 / 性别）
- ✅ 错误信息文案在 `lang/*.json` 集中管理
- ✅ 业务方可用 `mermaid.setLocale('zh')`
- ❌ 切勿在源码中硬编码英文
- ❌ 切勿把 i18n 文件塞进 main bundle（动态 import）

---

**标签**：#mermaid #diagram #typescript #parser
**状态**：20/20 份详细内容
