---
title: Bootstrap
tags: [UI框架, CSS, 响应式, 移动优先, 经典]
---

# Bootstrap

## 前言

**定位**：Twitter 2011 年开源的经典 CSS 框架，"响应式 + 移动优先"的代名词，2013-2018 年是前端开发的事实标准，至今仍是最流行的 CSS 框架之一。

**核心价值**：
- 开箱即用的栅格系统 + 组件库，3 分钟搭出像样的页面
- 移动优先：5 个断点响应式，桌面/平板/手机通吃
- 跨浏览器兼容：老 IE 都能跑（5.x）
- 庞大的生态：Bootstrap Icons、Bootstrap Themes、第三方模板

**五大特性**：
1. **12 栅格系统**：行 + 列 + 偏移量，响应式标配
2. **组件丰富**：Navbar、Card、Modal、Carousel、Toast、Offcanvas 等 30+
3. **实用类**：间距、文本、显示、浮动等工具类
4. **SCSS 源码**：变量、混入、函数都可定制
5. **JS 组件**：纯 JS 实现，不依赖 jQuery（5.x）

**对比表**：

| 维度 | Bootstrap | Tailwind CSS | Bulma | Foundation | Materialize |
|---|---|---|---|---|---|
| 思维 | 组件式 | 原子化 | 组件式 | 组件式 | Material 组件 |
| CSS 体积 | ⚠️ 大 | ✅ 极小 | ⚠️ 中 | ⚠️ 大 | ⚠️ 中 |
| 定制性 | ✅ SCSS | ✅ 配置 | ✅ SCSS | ✅ SCSS | ⚠️ |
| 响应式 | ✅ 5 断点 | ✅ 容器查询 | ✅ 4 断点 | ✅ 5 断点 | ✅ |
| JS 依赖 | 5.x 无 | ❌ | ❌ | ⚠️ jQuery | ⚠️ |
| 适合 | 经典项目 | 现代 Web | 简单项目 | 邮件/企业 | Material 风格 |

## 思维导图

```mermaid
mindmap
  root((Bootstrap))
    核心概念
      12 栅格
        container
        row col
        col-md-6
        offset
      断点
        sm md lg xl xxl
        移动优先
      实用类
        d-flex p-3
        mt-4 text-center
    布局
      container
        固定宽度
      container-fluid
        100% 宽
      grid
        row + col
      breakpoints
        5 个断点
    组件
      导航
        Navbar
        Nav Tabs
        Breadcrumb
      容器
        Card
        List group
      表单
        Form Input
        Select Checkbox
      按钮
        btn btn-primary
        outline
        size
      反馈
        Alert Toast
        Modal
      轮播
        Carousel
        Offcanvas
    工具类
      间距
        m p mx my
        gx gy
      显示
        d-block
        d-flex
      文本
        text-center
        text-truncate
      颜色
        bg-primary
        text-danger
      边框
        border rounded
        shadow
    主题
      内置主题
        浅色为主
      自定义
        SCSS 变量
        $primary
        $secondary
      Bootstrap Icons
        图标库
      Bootstrap Themes
        官方商店
    JavaScript
      原生 JS
        不依赖 jQuery
      ES Module
        import { Modal }
      data 属性
        data-bs-toggle
    响应式
      显示隐藏
        d-none d-md-block
      栅格偏移
        offset-md-2
      排序
        order-md-1
    高级特性
      SCSS 定制
        覆盖变量
      暗色模式
        5.3+
        data-bs-theme
      CSS 变量
        5.x 内置
      RTL
        阿拉伯语
    生态
      Bootstrap Icons
        2000+ 图标
      React Bootstrap
        React 包装
      Vue Bootstrap
        Vue 包装
      ng-bootstrap
        Angular
    版本
      3.x
        经典
      4.x
        flexbox
      5.x
        无 jQuery
      5.3
        暗黑模式
```

## 关键代码

### 一、快速开始

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bootstrap 5 演示</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11/font/bootstrap-icons.css" rel="stylesheet">
</head>
<body>
  <nav class="navbar navbar-expand-lg bg-primary" data-bs-theme="dark">
    <div class="container">
      <a class="navbar-brand" href="#">MyApp</a>
      <button class="navbar-toggler" data-bs-toggle="collapse" data-bs-target="#nav">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="nav">
        <ul class="navbar-nav me-auto">
          <li class="nav-item"><a class="nav-link active" href="#">首页</a></li>
          <li class="nav-item"><a class="nav-link" href="#">产品</a></li>
          <li class="nav-item"><a class="nav-link" href="#">关于</a></li>
        </ul>
      </div>
    </div>
  </nav>

  <div class="container py-5">
    <h1 class="display-4">欢迎</h1>
    <p class="lead">这是一个 Bootstrap 5 演示页面。</p>
    <button class="btn btn-primary btn-lg">开始使用</button>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
```

### 二、栅格系统

```html
<!-- 12 栅格示例 -->
<div class="container">
  <div class="row">
    <!-- 手机 12 / 平板 6 / 桌面 4 -->
    <div class="col-12 col-md-6 col-lg-4">列 1</div>
    <div class="col-12 col-md-6 col-lg-4">列 2</div>
    <div class="col-12 col-md-12 col-lg-4">列 3</div>
  </div>

  <!-- 偏移 + 排序 -->
  <div class="row mt-4">
    <div class="col-md-4 order-md-2">第二</div>
    <div class="col-md-4 order-md-1">第一</div>
    <div class="col-md-4 order-md-3">第三</div>
  </div>

  <!-- 嵌套 -->
  <div class="row mt-4">
    <div class="col-md-8">
      <div class="row">
        <div class="col-md-6">嵌套 1</div>
        <div class="col-md-6">嵌套 2</div>
      </div>
    </div>
    <div class="col-md-4">侧栏</div>
  </div>
</div>
```

### 三、卡片 + 表单

```html
<div class="row g-3">
  <!-- 卡片列 -->
  <div class="col-sm-6 col-lg-3">
    <div class="card h-100 shadow-sm">
      <img src="https://picsum.photos/300/200" class="card-img-top" alt="...">
      <div class="card-body">
        <h5 class="card-title">产品 1</h5>
        <p class="card-text">简短描述</p>
        <span class="badge bg-success">新品</span>
      </div>
      <div class="card-footer d-flex justify-content-between">
        <span class="text-primary fw-bold">¥99</span>
        <button class="btn btn-sm btn-outline-primary">加入购物车</button>
      </div>
    </div>
  </div>
</div>

<!-- 表单 -->
<form class="row g-3 needs-validation" novalidate>
  <div class="col-md-6">
    <label class="form-label">姓名</label>
    <input type="text" class="form-control" required>
    <div class="invalid-feedback">请输入姓名</div>
  </div>
  <div class="col-md-6">
    <label class="form-label">邮箱</label>
    <input type="email" class="form-control" required>
  </div>
  <div class="col-12">
    <label class="form-label">留言</label>
    <textarea class="form-control" rows="3"></textarea>
  </div>
  <div class="col-12">
    <button class="btn btn-primary" type="submit">提交</button>
  </div>
</form>
```

### 四、JS 组件（Modal / Toast / Carousel）

```html
<!-- 按钮触发 Modal -->
<button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#myModal">
  打开
</button>

<div class="modal fade" id="myModal" tabindex="-1">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">确认操作</h5>
        <button class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <p>确定要执行此操作吗？</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
        <button class="btn btn-danger">确认</button>
      </div>
    </div>
  </div>
</div>

<!-- Toast 通知 -->
<div class="toast-container position-fixed top-0 end-0 p-3">
  <div class="toast show" role="alert">
    <div class="toast-header">
      <strong class="me-auto">通知</strong>
      <button class="btn-close" data-bs-dismiss="toast"></button>
    </div>
    <div class="toast-body">
      操作成功！
    </div>
  </div>
</div>

<!-- 轮播图 -->
<div id="carousel" class="carousel slide" data-bs-ride="carousel">
  <div class="carousel-indicators">
    <button data-bs-target="#carousel" data-bs-slide-to="0" class="active"></button>
    <button data-bs-target="#carousel" data-bs-slide-to="1"></button>
  </div>
  <div class="carousel-inner">
    <div class="carousel-item active">
      <img src="https://picsum.photos/800/300?random=1" class="d-block w-100">
    </div>
    <div class="carousel-item">
      <img src="https://picsum.photos/800/300?random=2" class="d-block w-100">
    </div>
  </div>
</div>
```

### 五、暗色模式（5.3+）

```html
<!-- 全局暗色 -->
<html data-bs-theme="dark">

<!-- 组件级暗色 -->
<div data-bs-theme="dark" class="bg-body p-4 rounded">
  <h5>暗色卡片</h5>
  <p>此区域使用暗色主题。</p>
</div>
```

```javascript
// 动态切换
document.documentElement.setAttribute("data-bs-theme", "dark");
```

### 六、SCSS 定制

```scss
// custom.scss
// 1. 覆盖变量
$primary: #00b96b;
$secondary: #6c757d;
$success: #28a745;
$border-radius: 0.5rem;
$font-family-sans-serif: "Inter", system-ui, sans-serif;

// 2. 引入 Bootstrap
@import "bootstrap/scss/bootstrap";

// 3. 自定义工具类
.btn-gradient {
  background: linear-gradient(45deg, $primary, darken($primary, 10%));
  color: white;
}
```

## 核心洞察

- **Bootstrap 仍是"实用主义首选"**：不懂前端的全栈/后端工程师用 Bootstrap 30 分钟搭出像样的页面，这是 Tailwind 替代不了的
- **Bootstrap 5.3 暗黑模式是真香**：`data-bs-theme` 切换 + CSS 变量支持，主题切换零 JS
- **Bootstrap Icons 价值被低估**：2000+ 开源图标，MIT 许可，与 Bootstrap 无缝集成
- **5.x 移除 jQuery 是里程碑**：从 5.0 起所有 JS 组件用纯 JS/ES Module 实现，包体积减少 30%+
- **Bootstrap 适合"营销页/管理后台"，不适合"现代 Web App"**：现代应用更倾向 Material UI / Ant Design / Tailwind
- **12 栅格仍是事实标准**：99% 设计稿按 12 栅格设计，Bootstrap/AntD/Element 都遵循
- **Bootstrap 5 引入 CSS 变量**：开发者终于可以运行时改主题了，是 5.0 最大的架构变化
- **Bootstrap 的"实用类"是 Tailwind 的前身**：`d-flex`/`p-3` 是 Bootstrap 早期就有的概念，Tailwind 把它做成主要思想
- **Bootstrap 5 不再支持 IE**：彻底抛弃 IE11，让代码更现代、变量更强大
- **Bootstrap 5 的栅格用 `g-3` 替代 4.x 的 `gx-3 gy-3`**：API 简化、记忆成本降低
- **React/Vue/Angular 包装库让 Bootstrap 不死**：`react-bootstrap` / `bootstrap-vue-next` 让 Bootstrap 在现代框架中也能用
- **Bootstrap 的 5.3.3 是最新稳定版**：2024 年发布，6.0 路线图未发布

## 跨项目引用

- **[[html]]** / **[[css]]**：Bootstrap 是 HTML + CSS 的"快捷方式"，核心是 CSS 类
- **[[javascript]]**：Bootstrap 5 的 JS 组件用纯 JS 实现（无 jQuery），data 属性触发
- **[[jquery]]**：Bootstrap 4 及以下依赖 jQuery；5.x 完全移除
- **[[react]]**：`react-bootstrap` 是最成熟的 React 包装库
- **[[vue]]**：`bootstrap-vue-next` 是 Vue 3 包装
- **[[angular]]**：`ng-bootstrap` 是 Angular 官方推荐
- **[[sass]]**：Bootstrap 5 源码用 SCSS 编写，覆盖变量即可定制
- **[[tailwind css]]**：与 Bootstrap 思路相反（原子化 vs 组件式），但都受 utility-first 思想影响
- **[[ant-design]]** / **[[material ui]]**：现代 React UI 库的"组件式 + 强类型"路线代表
- **[[cdn]]**：jsdelivr / unpkg 提供 Bootstrap CDN 镜像
- **[[figma]]**：Bootstrap 官方 Figma 设计套件
