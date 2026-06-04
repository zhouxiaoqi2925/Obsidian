---
title: GSAP
tags: [动画库, 时间轴, 滚动, 缓动, 性能]
---

# GSAP

## 前言

**定位**：GreenSock Animation Platform（GSAP），2006 年起家至今是 Web 端专业动画库的事实标准，被 Apple、Google、Adobe 等大厂官方推荐。

**核心价值**：
- 时间轴（Timeline）+ 缓动函数（Easing）+ 插件（Plugin）三件套
- 极致性能：相比 CSS 动画，复杂场景下 GSAP 更稳定
- 框架无关：原生 JS、React、Vue、Angular 都能用
- ScrollTrigger 插件：滚动驱动的"网红"动画

**五大特性**：
1. **Timeline 时间轴**：多动画编排同步，拖时间轴调试
2. **Easing 缓动系统**：30+ 内置缓动 + CustomEase 自定义
3. **Plugin 插件体系**：ScrollTrigger/MotionPath/Draggable/SplitText/MorphSVG
4. **GSAP 3 改用 ESM + 函数式 API**：`gsap.to()` 替代 `TweenMax.to()`
5. **零依赖**：核心库 30KB gzipped

**对比表**：

| 维度 | GSAP | anime.js | Framer Motion | Motion One | Velocity |
|---|---|---|---|---|---|
| 性能 | ✅ 极致 | ✅ | ✅ | ✅ | ✅ |
| 时间轴 | ✅ 极强 | ⚠️ | ✅ | ⚠️ | ⚠️ |
| 滚动驱动 | ✅ ScrollTrigger | ⚠️ | ✅ | ✅ | ❌ |
| 路径动画 | ✅ MotionPath | ✅ | ⚠️ | ✅ | ❌ |
| 包大小 | 30-100KB | 20KB | 50KB | 5KB | 30KB |
| 商业 | 免费 + 商业插件 | MIT | MIT | MIT | MIT |
| 适合 | 专业动画 | 通用 | React 项目 | 轻量 | 旧项目 |

## 思维导图

```mermaid
mindmap
  root((GSAP))
    核心
      Tween
        单动画
      Timeline
        时间轴
      Easing
        缓动
      Plugin
        插件
    动画方法
      gsap.to
        动到目标值
      gsap.from
        从初始值动
      gsap.fromTo
        双向
      gsap.set
        立即设置
      gsap.timeline
        时间轴
    目标
      CSS 选择器
        .box
      DOM
        element
      对象
        { x: 0 }
      数组
        批量
    缓动
      power1-power4
        缓入缓出
      back
        回弹
      elastic
        弹性
      bounce
        弹跳
      circ
        圆周
      expo
        指数
      CustomEase
        自定义
      CustomBounce
        自定义弹跳
    时间轴
      position
        插入点
      add
        添加动画
      pause
        暂停
      play
        播放
      reverse
        反向
      timeScale
        速度
      labels
        标签
    滚动插件
      ScrollTrigger
        滚动驱动
      trigger
        触发元素
      scrub
        滚动联动
      pin
        固定元素
      snap
        吸附
      callbacks
        回调
    其他插件
      Draggable
        拖拽
      MotionPath
        路径动画
      MorphSVG
        SVG 形变
      SplitText
        文字分割
      DrawSVG
        描边
      Physics2D
        物理
      Inertia
        惯性
    属性
      transform
        x y z
        scale rotate
      CSS 属性
        width color
      SVG 属性
        cx cy r
      对象属性
        任意属性
    性能
      GPU 加速
        transform opacity
      force3D
        强制 3D
      lazy
        延迟渲染
      批量更新
        帧合并
    框架集成
      原生 JS
        核心
      React
        @gsap/react
      Vue
        useGSAP
      Angular
        通用方式
    高级
      observer
        滚动观察
      quickTo
        快速动画
      quickSetter
        快速设置
      context
        作用域
    调试
      GSDevTools
        可视化
      motionPath
        路径编辑器
    商业
      Club GreenSock
        商业授权
      SplitText
        商业
      MorphSVG
        商业
      DrawSVG
        商业
      ScrollSmoother
        商业
    应用场景
      营销页
        网红 H5
      交互
        拖拽
      滚动叙事
        沉浸式
      数据展示
        动画
      游戏
        H5 小游戏
      产品展示
        高端
```

## 关键代码

### 一、安装与基础

```bash
# 核心
npm install gsap

# React 集成
npm install @gsap/react
```

```typescript
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);
```

### 二、Tween 基础

```typescript
// 1. 动到目标值
gsap.to(".box", {
  x: 200,
  y: 100,
  rotation: 360,
  scale: 1.5,
  duration: 1,
  ease: "power2.out"
});

// 2. 从初始值动
gsap.from(".box", {
  x: -200,
  opacity: 0,
  duration: 1,
  ease: "bounce.out"
});

// 3. 双向
gsap.fromTo(".box",
  { x: -200, opacity: 0 },   // 起点
  { x: 0, opacity: 1, duration: 1 }
);

// 4. 立即设置（无动画）
gsap.set(".box", { x: 100, opacity: 0 });
```

### 三、Timeline 时间轴

```typescript
const tl = gsap.timeline({
  defaults: { duration: 0.5, ease: "power2.out" }
});

tl.to(".box1", { x: 100 })
  .to(".box2", { y: 100 }, "-=0.3")      // 提前 0.3s 开始
  .to(".box3", { rotation: 180 }, "<")   // 与上一个同时开始
  .to(".box4", { scale: 2 }, ">-0.2")    // 上一个结束后 0.2s
  .to(".all", { opacity: 0 }, "+=1");    // 延迟 1s

// 标签
tl.addLabel("start")
  .to(".box1", { x: 100 }, "start")
  .to(".box2", { y: 100 }, "start+=0.5")
  .addLabel("end");

// 控制
tl.pause();
tl.play();
tl.reverse();
tl.timeScale(2);   // 2 倍速
```

### 四、Easing 缓动

```typescript
// 内置缓动
gsap.to(".box", { x: 100, ease: "power1.out" });     // 缓出
gsap.to(".box", { x: 100, ease: "bounce.inOut" });   // 弹跳
gsap.to(".box", { x: 100, ease: "elastic.out(1, 0.3)" }); // 弹性

// 自定义曲线
import { CustomEase } from "gsap/CustomEase";
gsap.registerPlugin(CustomEase);

CustomEase.create("myEase", "M0,0 C0.5,0 0.5,1 1,1");

gsap.to(".box", { x: 100, ease: "myEase" });
```

### 五、ScrollTrigger 滚动

```typescript
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);

// 1. 元素进入视口时动画
gsap.from(".section-title", {
  y: 100,
  opacity: 0,
  scrollTrigger: {
    trigger: ".section-title",
    start: "top 80%",     // 元素顶部到视口 80% 时触发
    end: "bottom 20%",
    toggleActions: "play none none reverse"
  }
});

// 2. 滚动联动（scrub）
gsap.to(".progress-bar", {
  width: "100%",
  scrollTrigger: {
    trigger: ".section",
    start: "top top",
    end: "bottom bottom",
    scrub: 1   // 1 秒平滑
  }
});

// 3. 固定（pin）
gsap.to(".box", {
  x: 500,
  scrollTrigger: {
    trigger: ".section",
    start: "top top",
    end: "+=1000",     // 滚动 1000px 距离
    pin: true,         // 固定元素
    scrub: true
  }
});

// 4. 批量设置
ScrollTrigger.batch(".card", {
  start: "top 80%",
  onEnter: batch => gsap.to(batch, { y: 0, opacity: 1, stagger: 0.1 })
});
```

### 六、React 集成

```tsx
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

export function AnimatedBox() {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.from(".box", {
      y: 100,
      opacity: 0,
      stagger: 0.1
    });
  }, { scope: container });

  return (
    <div ref={container}>
      <div className="box">A</div>
      <div className="box">B</div>
      <div className="box">C</div>
    </div>
  );
}
```

### 七、SVG 动画

```typescript
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
gsap.registerPlugin(MotionPathPlugin, DrawSVGPlugin);

// 路径动画
gsap.to(".airplane", {
  duration: 5,
  ease: "power1.inOut",
  motionPath: {
    path: ".flight-path",
    align: ".flight-path",
    alignOrigin: [0.5, 0.5],
    autoRotate: true
  }
});

// 描边动画
gsap.from(".signature", {
  drawSVG: false,   // false = 从无到有
  duration: 2
});
```

### 八、滚动叙事（H5 长页）

```typescript
const sections = gsap.utils.toArray<HTMLElement>(".section");

sections.forEach((section) => {
  gsap.fromTo(
    section.querySelector(".title"),
    { y: 100, opacity: 0 },
    {
      y: 0,
      opacity: 1,
      scrollTrigger: {
        trigger: section,
        start: "top 70%",
        end: "top 30%",
        scrub: 1
      }
    }
  );
});
```

### 九、回调与控制

```typescript
gsap.to(".box", {
  x: 100,
  duration: 1,
  onStart: () => console.log("开始"),
  onUpdate: () => console.log("进行中"),
  onComplete: () => console.log("完成"),
  onRepeat: () => console.log("重复"),
  repeat: 2,         // 重复 2 次
  repeatDelay: 0.5,
  yoyo: true         // 来回
});

// 杀死所有动画
gsap.killTweensOf(".box");
gsap.globalTimeline.clear();
```

## 核心洞察

- **GSAP 是 Web 动画的"专业级"**：vs anime.js 业余、Framer Motion 框架绑定，GSAP 通用 + 专业
- **GSAP 3 在 2020 年大重写**：函数式 API 替代 TweenMax/Lite，体积减 50%、API 统一
- **GSAP 的 Timeline 是杀手特性**：编排多动画同步，类似视频编辑软件的时间轴
- **GSAP 的 ScrollTrigger 是"网红 H5"的标配**：Apple、Microsoft、Adobe 都在用
- **GSAP 商业插件（SplitText/MorphSVG）是营收来源**：免费版够用 90%，商业插件是高级功能
- **GSAP 不需要 polyfill**：兼容 IE6+（虽然现在没人在意 IE）
- **GSAP 的 transform 比 CSS transform 性能好**：自动 batch、自动 force3D
- **GSAP 的 GSDevTools 是调试神器**：可视化时间轴编辑器
- **GSAP 的 Draggable 是拖拽标准**：惯性 + 边界 + 吸附开箱即用
- **GSAP 的 MotionPathPlugin 实现路径动画**：SVG path + autoRotate 飞机/汽车沿路径动
- **GSAP 的 CustomEase 让设计师"画曲线"**：上传 cubic-bezier 截图，自动生成缓动
- **GSAP 3.12 引入 `gsap.context()`**：作用域管理，自动清理动画，避免 React 严格模式双调用问题

## 跨项目引用

- **[[react]]**：`@gsap/react` 的 `useGSAP` 是 React 端最佳实践
- **[[vue]]**：GSAP + Vue Composition API 配合使用
- **[[framer-motion]]**：Framer Motion 是 React 端的 GSAP 替代（更 React 化）
- **[[anime.js]]**：anime.js 是轻量级替代，体积小但能力弱
- **[[three.js]]**：GSAP + Three.js 做 3D 动画（相机/对象沿时间轴动）
- **[[lottie]]**：Lottie 是 AE 动画导出，GSAP 是 Web 原生动画
- **[[svg]]**：GSAP 的 MotionPath/MorphSVG/DrawSVG 都是 SVG 动画
- **[[d3]]**：D3 transition + GSAP 混合使用：D3 计算数据，GSAP 动画
- **[[scrollmagic]]**：ScrollMagic 是 ScrollTrigger 的老前辈，被 GSAP 超越
- **[[css]]**：CSS animations 简单场景用，GSAP 复杂场景用
- **[[storybook]]**：Storybook 集成 GSAP 做动画演示
- **[[marketing]]**：营销 H5 长页用 GSAP + ScrollTrigger 是行业标配
