# PDF.js - Mozilla 的浏览器 PDF 渲染器

**GitHub**: mozilla/pdf.js
**Star**: 51k
**语言**: JavaScript
**主题**: pdf-viewer、mozilla、pdf、渲染器
**适用场景**: 浏览器内嵌 PDF 阅读、PDF 转图片、PDF 解析、PDF.js 二次开发

---

## 一、基础范式

### 模式 1 · Worker 线程 + 主线程双层架构

**问题场景**：PDF 解析 CPU 密集，阻塞主线程导致页面卡顿。

**解决方案**：pdf.js 采用 Worker 线程跑 PDF 解析（`pdf.worker.js`），主线程负责 UI 渲染和事件处理，通过 `postMessage` 双向通信。

**关键参数**：
- `pdfjsLib.GlobalWorkerOptions.workerSrc` 入口
- Worker 解析 PDF 结构
- 主线程渲染 Canvas
- postMessage 通信
- transferable objects

**最佳实践**：所有 PDF 解析都开 Worker，主线程零阻塞。

### 模式 2 · PDF 结构解析（cross-reference table）

**问题场景**：PDF 文档结构复杂（多版本 / 加密 / 流式），需要准确解析。

**解决方案**：pdf.js 实现 PDF 1.7 规范全部内容：cross-reference table（对象位置索引）/ trailer / stream filters（FlateDecode / LZWDecode / ASCII85Decode）/ xref streams（PDF 1.5+）。

**关键参数**：
- cross-reference table
- trailer dictionary
- FlateDecode / LZW
- xref streams
- linearized PDF

**最佳实践**：所有 PDF 库都从 xref + trailer 入手解析。

### 模式 3 · Canvas 渲染管线

**问题场景**：PDF 怎么在浏览器显示。

**解决方案**：pdf.js 解析 page → 渲染 Operator List → Canvas2D 绘制：`page.render({ canvasContext, viewport })` 一行完成。

**关键参数**：
- `page.render({ canvasContext, viewport })`
- `pdfjsLib.renderTextLayer` 文本层
- `pdfjsLib.renderAnnotationLayer` 注释层
- `viewport.transform` 缩放
- Canvas 2D API

**最佳实践**：所有 PDF 显示都用 Canvas2D，3D 用 WebGL（pdf.js 2.x 预览）。

### 模式 4 · 文本层 + 注释层（可选）

**问题场景**：Canvas 渲染无法选中文本，无法点击链接。

**解决方案**：pdf.js 提供 `TextLayer`（透明 DIV 覆盖 Canvas 选中文字）+ `AnnotationLayer`（链接 / 注释交互），与 Canvas 完美对齐。

**关键参数**：
- `renderTextLayer` 选项
- `renderAnnotationLayer` 选项
- 文本项 `item.str` / `item.transform`
- 链接 `annotation.url`
- 注释 dict

**最佳实践**：所有 PDF 阅读器都用 TextLayer + AnnotationLayer，UX 提升 100%。

### 模式 5 · 分页加载（lazy page load）

**问题场景**：1000 页 PDF 一次性加载耗内存。

**解决方案**：`getPage(n)` 异步获取指定页，`page.destroy()` 释放内存；`getDocument({ url })` + `numPages` 知道总页数。

**关键参数**：
- `pdf.getPage(n)` 单页
- `numPages` 总数
- `page.destroy()` 释放
- 异步 API
- `pdfDocument` 实例

**最佳实践**：所有 PDF > 50 页必须分页加载，节省 80% 内存。

---

## 二、扩展范式

### 模式 6 · 缩放 + 旋转（viewport）

**问题场景**：PDF 缩放 / 旋转 / 适应屏幕。

**解决方案**：`pdfjsLib.PDFPageProxy.getViewport({ scale, rotation })` 返回当前缩放 / 旋转的 viewport，Canvas 重新渲染。

**关键参数**：
- `scale: 1.5` 放大
- `rotation: 0/90/180/270`
- `viewport.width` / `viewport.height`
- 自适应
- `getViewport({ scale: containerWidth / pageWidth })`

**最佳实践**：所有 PDF 阅读器都用 viewport 抽象处理缩放 / 旋转。

### 模式 7 · 表单字段（AcroForm / XFA）

**问题场景**：PDF 表单需要填写 / 提交 / 验证。

**解决方案**：pdf.js 解析 AcroForm 字段（`page.getAnnotations()`），提供 `util` 工具类创建响应式表单；XFA 表单支持有限（v3.x 实验性）。

**关键参数**：
- `page.getAnnotations()`
- AcroForm 字段
- 文本 / 复选 / 单选 / 列表
- 提交按钮
- XFA 实验

**最佳实践**：表单 PDF 用 AcroForm（兼容性最好），避免 XFA。

### 模式 8 · 加密 PDF 解析

**问题场景**：PDF 加密（用户密码 / owner 密码）怎么解析。

**解决方案**：`getDocument({ password: 'xxx' })` 传密码，pdf.js 自动解密；handler 内置 40+ 加密算法（RC4 / AES）。

**关键参数**：
- `password` 选项
- RC4-40 / RC4-128
- AES-128 / AES-256
- Owner 密码
- User 密码

**最佳实践**：所有 PDF 库都支持密码解析，pdf.js 是 40+ 算法覆盖最全的。

### 模式 9 · 文本提取（getTextContent）

**问题场景**：需要从 PDF 提取纯文本做搜索 / NLP。

**解决方案**：`page.getTextContent()` 返回 text items 数组（含位置 + 字体 + 内容），可拼成完整文本。

**关键参数**：
- `page.getTextContent()`
- `item.str` 文本
- `item.transform` 位置
- `item.fontName` 字体
- `item.width` 宽度

**最佳实践**：PDF 转文本用 `getTextContent`，比手写解析快 100x。

### 模式 10 · PDF 生成（jsPDF 补充）

**问题场景**：pdf.js 只读不写，需要 PDF 生成。

**解决方案**：搭配 `jsPDF`（生成）+ `pdf.js`（展示），或用 `pdf-lib` 统一读写。pdf.js 1.10+ 实验性 `PDFPageProxy` 支持 `getOperatorList()` 可定制渲染。

**关键参数**：
- `jsPDF` 库
- `pdf-lib` 统一读写
- `pdfjsLib` 读取
- 实验性渲染
- PDF 2.0

**最佳实践**：读用 pdf.js，写用 pdf-lib，复杂操作两个结合。

---

## 三、进阶范式

### 模式 11 · 预加载 + 缓存

**问题场景**：用户翻页需要快速响应。

**解决方案**：`getDocument({ range: ..., length: ... })` 支持 HTTP Range Requests 按需加载，pdf.js 内部用 `PDFObjects` 缓存已解析对象。

**关键参数**：
- HTTP Range Requests
- 按需加载
- PDFObjects 缓存
- 内存管理
- 预加载下一页

**最佳实践**：所有大型 PDF 用 Range Requests，节省 70% 带宽。

### 模式 12 · TypeScript 类型 + API 文档

**问题场景**：pdf.js API 多，TypeScript 类型不全。

**解决方案**：`pdfjsLib` 命名空间暴露全部 API，`@types/pdfjs-dist` 第三方类型，`/api/` 目录完整文档。

**关键参数**：
- `pdfjsLib` 全局
- `@types/pdfjs-dist` 类型
- API 文档
- ESM / UMD
- viewer.html 演示

**最佳实践**：所有项目用 `@types/pdfjs-dist` + 文档。

### 模式 13 · 国际化（i18n）

**问题场景**：PDF 阅读器需要多语言。

**解决方案**：`/locale/` 目录提供 100+ 语言包，`pdfjsLib.Localization` 切换。

**关键参数**：
- 100+ 语言包
- `pdfjsLib.Localization`
- `/locale/zh-CN/viewer.properties`
- 自定义翻译
- 浏览器语言自动

**最佳实践**：所有国际化用 `locale/` 目录 + properties 文件。

### 模式 14 · 性能优化（Canvas + Worker）

**问题场景**：PDF 渲染慢（每页 1-2 秒）。

**解决方案**：5 招优化：① Worker 解析 ② Canvas2D 硬件加速 ③ OffscreenCanvas 后台渲染 ④ `rangeChunkSize` 调优 ⑤ 关闭不必要的注释 / 文本层。

**关键参数**：
- Worker 线程
- Canvas2D 硬件加速
- OffscreenCanvas
- rangeChunkSize
- 关闭注释层

**最佳实践**：所有大型 PDF 渲染都开 OffscreenCanvas + Worker。

### 模式 15 · PDF 2.0 + 增量更新

**问题场景**：需要 PDF 2.0 新特性（加密 v5 / 改进流）。

**解决方案**：pdf.js 2.x+ 支持 PDF 2.0 规范（部分），incremental update 增量更新实验性支持。

**关键参数**：
- PDF 2.0
- 加密 v5 (AES-256)
- 改进流
- 增量更新
- 实验性

**最佳实践**：所有 2024+ 项目用 pdf.js 4.x，PDF 2.0 兼容。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：从零搭 PDF 阅读器。

**解决方案**：7 件套：① `pdfjsLib` 引入 ② Worker 路径 ③ `getDocument` 加载 PDF ④ `getPage` 取页 ⑤ `render` 渲染 ⑥ `TextLayer` 文本层 ⑦ `AnnotationLayer` 注释层。

**关键参数**：
- `pdfjsLib.GlobalWorkerOptions.workerSrc`
- `getDocument`
- `getPage`
- `render`
- TextLayer + AnnotationLayer

**最佳实践**：所有 PDF 阅读器 7 件套模板，10 分钟跑起来。

### 模式 17 · 跨平台兼容（IE11 / 移动端）

**问题场景**：PDF 阅读器在 IE11 / 移动端需要兼容。

**解决方案**：`pdfjsLib` 2.x+ 不再支持 IE11，3.x+ 需要现代浏览器；移动端用 `viewport` meta 标签 + 触摸事件。

**关键参数**：
- 现代浏览器
- 移动端 viewport
- 触摸事件
- pinch-to-zoom
- 微信 X5 内核

**最佳实践**：IE11 兼容用 pdf.js 1.10.x；新项目用 4.x 走现代浏览器。

### 模式 18 · 性能基准 + 调优

**问题场景**：PDF 加载慢 / 翻页卡。

**解决方案**：5 招调优：① Worker 池（多 Worker 并行）② Range Requests ③ 预加载下一页 ④ OffscreenCanvas ⑤ 内存回收 `page.destroy()`。

**关键参数**：
- Worker 池
- 范围加载
- 预加载
- OffscreenCanvas
- destroy

**最佳实践**：所有大型 PDF 阅读器用 5 招组合，翻页时间 < 200ms。

### 模式 19 · 与 pdf-lib / jsPDF / react-pdf 对比

**问题场景**：PDF 选型在 pdf.js / pdf-lib / jsPDF / react-pdf 之间。

**解决方案**：pdf.js 定位「浏览器渲染 + Mozilla 官方」适合内嵌 PDF 阅读；pdf-lib 定位「现代读写」适合 PDF 生成 / 修改；jsPDF 定位「轻量生成」适合客户端生成；react-pdf 定位「React 集成」适合 React 项目。

**关键参数**：
- 渲染：pdf.js > react-pdf > pdf-lib > jsPDF
- 生成：pdf-lib > jsPDF > react-pdf > pdf.js
- 体积：jsPDF < react-pdf < pdf-lib < pdf.js
- 学习曲线：react-pdf < jsPDF < pdf.js < pdf-lib

**最佳实践**：渲染选 pdf.js，生成选 pdf-lib，React 项目选 react-pdf。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想 fork pdf.js 做内部 PDF 工具。

**解决方案**：7 天分 6 步：① PDF 结构解析（xref + trailer） ② stream filters（FlateDecode） ③ Operator List 解析 ④ Canvas 渲染 ⑤ TextLayer 文本层 ⑥ Worker 线程。

**关键参数**：
- Day 1-2: xref + trailer
- Day 3: filters
- Day 4: Operator List
- Day 5: Canvas
- Day 6: TextLayer
- Day 7: Worker

**最佳实践**：7 天复刻只求「够用 80% 场景」，完整 pdf.js 复刻需要 6 个月+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\pdf.js\`
- **大小**: ~100 MB
- **总文件数**: 数千 JS 文件
- **关键 commit**: v4.x（现代浏览器主版本）
- **团队**: Mozilla 主导
- **许可**: Apache-2.0

## 一句话总结

PDF.js 用「Worker 线程 + 主线程双层架构 + Canvas 渲染 + TextLayer / AnnotationLayer」把 PDF 阅读器做到浏览器原生性能，是 Firefox 和无数内嵌 PDF 阅读器的核心引擎。
