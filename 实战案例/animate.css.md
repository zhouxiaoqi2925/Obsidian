# animate.css - 零运行时 CSS 动画库的极致扩展设计

**GitHub**: animate-css/animate.css
**Star**: 81k+
**语言**: CSS + JavaScript
**主题**: 动画库 / CSS-in-JS 替代 / 浏览器动画
**适用场景**: 营销页微动效、Hover 反馈、过渡转场、无障碍降级

## 第一段：基础范式

### 模式 1：6 行 CSS 变量定义整个库的扩展点

**问题场景**：传统 CSS 库把动画时长 hardcode 在每个 keyframe 里，用户改全局速度要搜遍 100+ 文件。

**解决方案**：animate.css v4 把"时长/延迟/重复次数"提到 CSS 变量，所有动画自动跟着变：
```css
/* source/_vars.css */
:root {
    --animate-duration: 1s;
    --animate-delay: 1s;
    --animate-repeat: 1;
}
```

**关键参数**：
- `--animate-duration`：默认动画时长，在任意祖先选择器覆盖
- `--animate-delay`：默认延迟（用于 `delay-1s` 等）
- `--animate-repeat`：默认重复次数（`repeat-N` 用 `calc(* N)`）
- 三个变量覆盖 13 个工具类 + 100+ 动画——最高 ROI 的扩展点设计
- 业务类与 animate.css 命名空间绝不冲突——所有变量带前缀

**最佳实践**：把"业务常量"提到 `:root` 变量——职责分离到极致；用 CSS 变量而不是 Sass 变量——运行时可改；一行 JS `document.documentElement.style.setProperty('--animate-duration', '0.5s')` 全局调速。

---

### 模式 2：calc() 等比缩放工具类

**问题场景**：用户想要"比默认快 2 倍"或"延迟 1.5s"——传统库要写 5+ 个 fixed 工具类。

**解决方案**：用 `calc(var(--animate-duration) * 0.8)` 让用户改一个变量，所有工具类自动等比缩放：
```css
.animated.faster { animation-duration: calc(var(--animate-duration) / 2); }
.animated.fast { animation-duration: calc(var(--animate-duration) * 0.8); }
.animated.slow { animation-duration: calc(var(--animate-duration) * 2); }
.animated.slower { animation-duration: calc(var(--animate-duration) * 3); }
.animated.delay-2s { animation-delay: calc(var(--animate-delay) * 2); }
```

**关键参数**：
- `.faster` × 0.5 短 hover 反馈
- `.fast` × 0.8 微动效
- `.slow` × 2 重要转场
- `.delay-Ns` N× 序列错峰
- `.infinite` 是 escape hatch——`calc` 不能表达"无限"
- 13 个工具类覆盖 95% 业务场景

**最佳实践**：`calc(var(--X) * N)` 让"参数化"覆盖到所有变体；不要硬写 `1s` / `0.5s`——永远走变量；用户改 `--animate-duration` 后所有工具类自动跟着等比缩放。

---

### 模式 3：animation-fill-mode: both 是默认值

**问题场景**：用户用 `.fadeIn` 后元素从 `opacity: 0` 开始动画——动画结束后元素回到 `opacity: 0` 突然消失。这是 v3 时代 80% 的 issue 来源。

**解决方案**：库默认给 `fill-mode: both`，消除跳变 bug：
```css
.animated {
    animation-duration: var(--animate-duration);
    animation-fill-mode: both;
}
```

**关键参数**：
- `forwards` 末帧状态（推荐）
- `backwards` 首帧状态
- `both` 首帧 + 末帧（animate.css 选用）
- `none` 元素跳变回原样式
- `forwards` 也能解决"结束后跳变"，但不能解决"开始前是 opacity:0"

**最佳实践**：库默认给 `fill-mode: both`——消除 80% 跳变 bug；用户不用关心这个属性——只管用 `.bounce` 就行；不暴露 `fill-mode` 工具类——不让用户错配。

---

### 模式 4：.animated 容器类 + 工具类的配置层分离

**问题场景**：动画名（`.bounce`）和动画配置（时长/重复/延迟）耦合，用户改不了配置。

**解决方案**：引入"必须同时有 `.animated` 和 `.bounce`"的双类模式——配置层独立：
```html
<button class="animated bounce delay-2s repeat-3">点击</button>
```

**关键参数**：
- `.animated` 容器类：必带，定义"动画如何运行"
- `.bounce` 动画类：指定"哪个动画"
- `.faster/.delay-2s` 工具类：调"运行参数"
- 双类模式让"动画名"和"动画配置"解耦

**最佳实践**：双类模式让"动画名"和"动画配置"解耦——可独立扩展；13 个工具类足以覆盖 95% 业务；`.animated` 是"必须"——`.bounce` 单独没效果；v3 兼容版不强制 `.animated`——单类模式。

---

### 模式 5：分类子目录 + 1 文件 1 动画的原子化

**问题场景**：100+ 动画平铺在一个 `animations.css` 文件里——PR 审查噩梦、git 冲突频繁。

**解决方案**：用 16 个分类子目录 + 1 文件 1 动画组织，降低 PR 心智负担：
```
source/
├── attention_seekers/   13 个：bounce, flash, pulse, shake, tada, jello
├── back_entrances/      4 个：backInDown/Left/Right/Up
├── fading_entrances/    13 个：fadeIn + 方向 + Big + 角落
├── flippers/            5 个：flip + flipInX/Y + flipOutX/Y
├── rotating_entrances/  5 个：rotateIn + 4 角
├── specials/            4 个：hinge / jackInTheBox / rollIn / rollOut
└── ... 16 个分类目录
```

**关键参数**：
- 文件粒度：1 动画 1 文件——PR diff 最小
- 目录组织：按"语义分类"（attention_seekers 比 misc 直观）
- 命名约定：kebab-case
- 文件行数：14-43 行
- 每个动画文件结构高度一致——`@keyframes` + `.className` 2 段

**最佳实践**：1 动画 1 文件 = PR 审查最小粒度；git blame 能精确追溯"这个动画是谁写的"；新加动画 = 在合适子目录创建新文件——不破坏现有文件。

---

## 第二段：扩展范式

### 模式 6：bounce 经典 cubic-bezier 缓动

**问题场景**：匀速动画看起来"机械"——没有"重力感"。真实 bounce 需要上升时减速（缓出），下降时加速（缓入）。

**解决方案**：`bounce` 是不同时段用不同 timing-function 的范本：
```css
@keyframes bounce {
    from, 20%, 53%, 80%, to { animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1); }
    40%, 43% { animation-timing-function: cubic-bezier(0.755, 0.05, 0.855, 0.06); }
}
.bounce { animation-name: bounce; transform-origin: center bottom; }
```

**关键参数**：
- 上升段 `(0.215, 0.61, 0.355, 1)` = easeOutQuart
- 下降段 `(0.755, 0.05, 0.855, 0.06)` = easeInQuart
- `transform-origin: center bottom` 旋转中心在底部——模拟"球在地面"
- `transform: translate3d(0, 0, 0)` 强制开启 GPU 合成
- 5 段关键帧形成 4 次"弹跳"——视觉节奏感

**最佳实践**：上升用 easeOutQuart、下降用 easeInQuart——符合真实物理；不同时段用不同 cubic-bezier——不是全局一个缓动。

---

### 模式 7：3D 变换 transform-origin 实战

**问题场景**：2D `transform: rotate(45deg)` 看起来"扁平"。要做出"翻牌"效果需要 3D `rotateY` + `perspective` + `transform-origin` 配合。

**解决方案**：`flip` 系列是 3D 变换的精密编排：
```css
@keyframes flip {
    from { transform: perspective(400px) rotate3d(0, 1, 0, -360deg); }
    50% { transform: perspective(400px) rotate3d(0, 1, 0, -170deg); }
}
.flip { backface-visibility: visible; animation-name: flip; }
```

**关键参数**：
- `perspective(400px)` 观察者距离，数值越小透视越强
- `rotate3d(0, 1, 0, -360deg)` 绕 Y 轴转 -360°
- `backface-visibility: visible` 让"翻过去"后仍可见
- 关键帧切分细——`40% / 50% / 80%` 把"减速→加速"分段
- 3D 动画必然触发 GPU 合成——性能好但吃显存

**最佳实践**：3D 旋转必须配 `perspective`——否则看起来还是 2D；`rotate3d(x, y, z, angle)` 比 `rotateY(angle)` 更可读；`backface-visibility: visible` 让"翻过去"后仍可见。

---

### 模式 8：heartBeat 等比缩放实战

**问题场景**：很多动画 hardcode "0% / 50% / 100%" 时间点，但用户的 `--animate-duration` 变化时关键帧时间点不变——动画"长"了但"心电图"形状没变。

**解决方案**：用 `scale()` 配合 CSS 变量实现"等比缩放"：
```css
@keyframes heartBeat {
    0% { transform: scale(1); }
    14% { transform: scale(1.3); }
    28% { transform: scale(1); }
    42% { transform: scale(1.3); }
    70% { transform: scale(1); }
}
.heartBeat { animation-duration: calc(var(--animate-duration) * 1.3); }
```

**关键参数**：
- 关键帧时间点（14%/28%/42%）不用变量——动画形状不变
- `calc(var(--animate-duration) * 1.3)` 让时长跟着变量变
- `scale(1.3)` 是经验值——再大显卡通，再小看不清
- "0% → 14% → 28% → 42% → 70% → 100%" 留 30% 缓冲
- 双心跳模式（14%/42%）模拟真实"扑通扑通"

**最佳实践**：`calc(var(--animate-duration) * 1.3)` 让时长跟着变量变；关键帧时间点不用变量——动画形状不变；`scale(1.3)` 是经验值。

---

### 模式 9：多关键帧 stagger 节奏

**问题场景**：列表项"依次出现"需要 `animation-delay` 逐项 +0.1s，但 CSS 没办法"基于 index 算 delay"。

**解决方案**：用同一动画 + JS 触发实现 stagger。`hinge` 是"分阶段"动画的典范：
```css
@keyframes hinge {
    0% { animation-timing-function: ease-in-out; }
    20%, 60% { transform: rotate3d(0, 0, 1, 80deg); }
    to { transform: translate3d(0, 700px, 0); opacity: 0; }
}
.hinge { animation-duration: calc(var(--animate-duration) * 2); transform-origin: top left; }
```

**关键参数**：
- `transform-origin: top left` 把"铰链"放在左上角
- 不同关键帧用不同 timing-function——分段缓动
- `to { opacity: 0 }` 让元素最终消失
- `calc(* 2)` 延长时长——hinge 物理上需要更慢
- 多关键帧形成"分阶段物理"——不是简单的"线性运动"

**最佳实践**：`transform-origin: top left` 把"铰链"放在左上角——模拟"门被风吹开"；不同关键帧用不同 timing-function——分段缓动；`fill-mode: both` 保留消失状态。

---

### 模式 10：rotateIn 4 角变体的方向化模板

**问题场景**：4 个方向的"旋转入场"动画如果不复用模板，会有 80% 重复代码。

**解决方案**：用"差量关键帧"模式——4 个动画的关键帧只在起点位置不同，旋转+缓动完全相同：
```css
@keyframes rotateInDownLeft {
    from { transform: rotate3d(0, 0, 1, -45deg); opacity: 0; }
    to { transform: translate3d(0, 0, 0); opacity: 1; }
}
.rotateInDownLeft { animation-name: rotateInDownLeft; transform-origin: left bottom; }
```

**关键参数**：
- `rotateInDownLeft` -45° from left bottom
- `rotateInUpRight` 90° from right bottom
- `rotateInDownRight` 45° from right bottom
- `rotateInUpLeft` -90° from left bottom
- `transform-origin` 是变体的核心差异——决定"从哪个角落"
- `opacity: 0 → 1` 是入场动画标配

**最佳实践**：4 个变体共享"结束状态 + 缓动"——只改"起点"和"旋转中心"；4 个变体不用 mixin 复用——保持每个文件独立可读；`translate3d(0, 0, 0)` 强制 GPU 合成。

---

## 第三段：进阶范式

### 模式 11：PostCSS import 编排入口

**问题场景**：100+ CSS 文件如何"按依赖顺序打包"？`@import` 是 CSS 原生语法，但浏览器会串行请求。

**解决方案**：PostCSS `postcss-import` 在编译期内联——一次 HTTP 请求拿到所有 CSS：
```js
// postcss.config.js
module.exports = (ctx) => ({
    plugins: [
        atImport(),
        prefixer({ prefix: ctx.prefix }),
        autoprefixer(),
        presetEnv({ stage: 3 }),
        ctx.env === 'prod' ? cssnano() : null,
    ].filter(Boolean),
});
```

**关键参数**：
- `postcss-import` 编译期内联 `@import`
- `postcss-prefixer` 批量加前缀（`bounce` → `animate__bounce`）
- `postcss-preset-env` 未来语法降级
- `autoprefixer` 加浏览器前缀
- `cssnano` 压缩
- import 顺序就是依赖顺序——`_vars.css` 必须先于 `_base.css`

**最佳实践**：`postcss-import` 在编译期解析——无运行时开销；PostCSS 插件按"重要性"排序：import → prefixer → autoprefixer → minify；`ctx.env === 'prod' ? cssnano() : null` 在 dev 模式跳过压缩。

---

### 模式 12：postcss-prefixer 编译时 prefix

**问题场景**：v4 引入 `animate__` 前缀解决类名冲突，但源码不能写 `animate__bounce`——会污染 git blame。

**解决方案**：`postcss-prefixer` 在编译时批量加前缀，源码保持 `.bounce`：
```js
prefixer({ prefix: ctx.prefix, ignore: [':root', /^html/] }),
```

**关键参数**：
- `prod` env 输出 `animate.min.css`（带前缀）
- `raw` env 输出 `animate.css`（开发版，无前缀）
- `compat` env 输出 `animate.compat.css`（v3 兼容，无前缀）
- `ignore: [':root', /^html/]` 防止全局选择器被 prefix
- `:root` 里的 CSS 变量名不加前缀
- 同一个源码 3 个产物——一套代码多场景

**最佳实践**：prefix 在编译时加——无运行时 CSS 体积膨胀；`ignore: [':root', /^html/]` 防止全局选择器被 prefix；同一个源码 3 个产物——一套代码多场景；prefix 改动 = 升级 major version。

---

### 模式 13：autoprefixer 浏览器矩阵

**问题场景**：CSS `transform` 在 Safari 旧版要 `-webkit-transform`，`transition` 在 Android 4 要 `-webkit-transition`。手写所有 prefix 不可能。

**解决方案**：autoprefixer + browserslist 自动覆盖：
```json
"browserslist": [
    "> 3%",
    "last 2 versions"
]
```

**关键参数**：
- `transform` Chrome 36+ / Safari 9+
- `animation` Chrome 43+ / Safari 9+
- `transition` Chrome 26+ / Safari 6.1+
- `keyframes` Chrome 43+ / Safari 9+
- browserslist 写最低门槛——`> 3%` + `last 2 versions` 够 95% 用户
- 不为 IE11 写 prefix——IE11 已退出市场

**最佳实践**：browserslist 写最低门槛——`> 3%` + `last 2 versions` 够 95% 用户；autoprefixer 在编译期跑——无运行时判断；用 caniuse 查询具体特性支持——不要凭记忆。

---

### 模式 14：cssnano minify 与产物分级

**问题场景**：编译后 CSS 100KB+——生产环境必须 minify 到 ~70KB。但开发环境需要可读 CSS 用于调试。

**解决方案**：用 3 个 npm script 产出 3 个不同环境的 CSS：
```json
"scripts": {
    "raw": "postcss source/animate.css -o animate.css --env raw",
    "prod": "postcss source/animate.css -o animate.min.css --env prod",
    "compat": "postcss source/animate.css -o animate.compat.css --env compat"
}
```

**关键参数**：
- `animate.css` ~100KB 开发调试（含 prefix、未 minify）
- `animate.min.css` ~70KB 生产 CDN（minify + prefix）
- `animate.compat.css` ~70KB v3 兼容（无 prefix）
- 用 `npm-run-all` 并行跑 3 个产物
- 在 README 标注 3 个产物的区别

**最佳实践**：dev 产物不 minify——开发可读；prod 产物 minify + prefix——CDN 友好；compat 产物给 v3 迁移用户——不强制升级；在 README 标注 3 个产物的区别——避免用户用错。

---

### 模式 15：自建静态站生成器 docsSource

**问题场景**：100+ 动画需要"可视化"展示——用 VuePress/Docusaurus 杀鸡用牛刀，且不带任何 npm 依赖也能跑。

**解决方案**：用 3 个 Node 脚本（`compileMD.js` / `compileAnimationList.js` / `index.js`）自建：
```js
const sections = fs.readdirSync('docsSource/sections')
    .filter(f => f.endsWith('.md'))
    .map(compileMD);
const html = template
    .replace('{{SECTIONS}}', sections.join('\n'))
    .replace('{{ANIMATION_LIST}}', animationList);
fs.writeFileSync('docs/index.html', html);
```

**关键参数**：
- 文档站生成器：自建 3 个 Node 脚本（0 依赖、纯 HTML）
- markdown 解析：markdown-it（体积小、API 简单）
- 模板：178 行 HTML 字符串
- 部署：Firebase / GitHub Pages
- 用正则扫描 `import` 块生成动画目录——无需解析 AST

**最佳实践**：文档站不要复杂 SSG——一个 index.html + 几个 .mjs 模块；模板用字符串 `.replace()` 即可——不引模板引擎；自建生成器让仓库无重依赖（除 markdown-it）。

---

## 第四段：实战范式

### 模式 16：prefers-reduced-motion: reduce 1ms 降级

**问题场景**：前庭功能障碍用户对动画敏感——长动画会导致眩晕。系统提供 `prefers-reduced-motion` 媒体查询，但传统做法是 `animation: none`（直接禁用），会跳变。

**解决方案**：用 `1ms` 而非 `0s`——几乎无视觉差但能可靠触发 `animationend` 事件：
```css
@media print, (prefers-reduced-motion: reduce) {
    .animated {
        animation-duration: 1ms !important;
        animation-delay: 1ms !important;
        animation-iteration-count: 1 !important;
    }
}
```

**关键参数**：
- `animation: none` 元素跳到末帧，无 `animationend`
- `animation-duration: 0s` 不可靠，部分浏览器不触发 end
- `animation-duration: 1ms` 几乎无视觉差 + 可靠触发 end（推荐）
- 同步禁用 `animation-delay` + `animation-iteration-count`
- 媒体查询合并 `@media print`——打印场景同样降级
- 用 `!important` 覆盖——用户动画自定义不能突破降级

**最佳实践**：用 `1ms` 而非 `0s`——可靠触发 `animationend` 事件；同步禁用 `animation-delay` + `animation-iteration-count`——彻底降级；用 `!important` 覆盖——用户动画自定义不能突破降级。

---

### 模式 17：v3 兼容版 compat.css 的温和升级

**问题场景**：v4 引入 `animate__` 前缀是破坏性变更——所有 v3 用户升级后动画类名全失效。

**解决方案**：给老项目"无 prefix"版，不强迫升级：
```js
ctx.env === 'compat' 
    ? null  // 跳过 prefix
    : prefixer({ prefix: ctx.prefix }),
```

**关键参数**：
- `animate.min.css` 带 `animate__` 前缀（4.x 新项目）
- `animate.compat.css` 无前缀（v3 迁移项目）
- compat 版不是 LTS——给老项目过渡期
- 文档明确"建议 6-12 个月内迁移到 4.x"
- compat 版不接受新功能 PR——避免双重维护

**最佳实践**：破坏性变更必须给兼容版——降低迁移成本；compat 版不接受新功能 PR——避免双重维护；在 README 标注"3.x → 4.x 升级指南"。

---

### 模式 18：Hippocratic-2.1 伦理型 License

**问题场景**：MIT 允许任何用途——包括侵犯人权的场景（如监控工具）。

**解决方案**：Hippocratic-2.1 在 MIT 基础上增加"伦理条款"：禁止用于侵犯人权的项目：
```
Hippocratic License 2.1
Permission is hereby granted... subject to the following conditions:
The above rights may be exercised only if the licensed entity and the work 
it produces do not violate... human rights or principles of environmental 
sustainability.
```

**关键参数**：
- MIT 商用/修改/闭源 ✅ + 伦理条款 ❌
- Apache 2.0 + 专利条款
- Hippocratic-2.1 + 禁止侵犯人权
- 伦理条款不可自动验证——靠用户自律
- 国内接受度不高——企业项目偏向 MIT/Apache
- 选 License 不可逆——切换 License 等于切社区信任

**最佳实践**：选 License 时考虑"项目最终被用在哪里"——Hippocratic 给"不想被监控工具使用"的开发者一个选项；在 README 顶部明确 License——避免误解。

---

### 模式 19：Husky + lint-staged 提交前格式化

**问题场景**：100+ 贡献者提 PR——格式不统一会导致巨大 diff。

**解决方案**：用 `husky` + `lint-staged` 在 commit 前自动格式化——保证仓库格式一致：
```json
"husky": {
    "hooks": { "pre-commit": "lint-staged" }
},
"lint-staged": {
    "*.css": ["prettier --write", "git add"],
    "*.js": ["prettier --write", "git add"]
}
```

**关键参数**：
- husky 触发 git hooks（commit 前）
- lint-staged 只 lint staged 文件（节省时间）
- prettier 格式化（提交前自动）
- codeql 安全扫描（push / PR 时）
- Prettier 配置强制——无 `.prettierrc` 不允许

**最佳实践**：提交前自动格式化——格式不应该是讨论点；`lint-staged` 只处理 staged 文件——避免全仓 lint；Husky pre-commit 不做编译/测试——commit 速度要快；CodeQL 在 push 时跑——安全扫描不在本地。

---

### 模式 20：playground 模块 + dark mode + slow down

**问题场景**：用户看动画需要"放慢看" / "切深色背景" / "暂停复现"——但文档站不带任何交互。

**解决方案**：在 `docs/modules/` 提供 6 个 playground 模块——慢放/暂停/重播/dark mode：
```js
// docs/modules/slowDown.mjs
const slowDownButton = document.querySelector('#slow-down');
let speed = 1;
slowDownButton.addEventListener('click', () => {
    speed *= 0.5;
    document.documentElement.style.setProperty('--animate-duration', `${1 * speed}s`);
});
```

**关键参数**：
- `playground` 选择动画 + 触发
- `darkMode` 切深色背景
- `slowDown` ×0.5 / ×0.25 慢放
- `pause` 暂停 / 恢复
- 6 个模块各自独立——可单独 import
- `dark mode` 用 `data-theme`——CSS 变量天然支持
- `slow down` 用 0.5× 倍率——视觉清晰可见

**最佳实践**：文档站 playground 复用 `animate.css` 变量——不用 JS 直接改属性；`dark mode` 用 `data-theme`——CSS 变量天然支持；`slow down` 用 0.5× 倍率——视觉清晰可见；文档站 deploy 走 Firebase + GitHub Actions——零配置。

---

## 附：仓库元信息

| 字段 | 值 |
|:---|:---|
| 仓库 | github.com/animate-css/animate.css |
| 协议 | Hippocratic-2.1 |
| 总文件 | 150 |
| 主语言 | CSS（核心）+ JavaScript（构建/文档站） |
| 构建 | PostCSS（import / prefixer / preset-env / cssnano） |
| Star | 81k+ |
| 当前版本 | 4.1.1 |
| 团队 | Elton Mesquita + Waren Gonzaga + 社区 |
| 关键里程碑 | v1 (2013) → v3.7 (reduced-motion) → v4.0 (前缀+变量) → v4.1.1 |
| 浏览器 | `> 3%` + `last 2 versions` |
