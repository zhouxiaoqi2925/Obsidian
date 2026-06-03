---
title: Cypress
tags: [端到端测试, E2E, 测试自动化, JavaScript, 浏览器测试]
---

# Cypress

## 前言

**定位**：现代化的前端端到端（E2E）测试框架，专为现代 Web 应用设计，与 Selenium 走完全不同的技术路线（直接运行在浏览器中）。

**核心价值**：
- 一行命令安装、几行代码写测试
- 时间旅行调试：每个测试步骤都可回放
- 自动等待：无需 `sleep` / `waitFor` 手动等待
- 实时重载：保存测试文件自动重跑

**五大特性**：
1. **浏览器内运行**：测试代码直接运行在浏览器中，无 WebDriver 中间层
2. **时间旅行**：Cypress 记录每一步 DOM 快照，可回放任意时刻
3. **自动等待**：自动重试直到元素出现/可交互/可见
4. **网络拦截**：`cy.intercept` 拦截/修改 XHR/Fetch，无需 mock 服务
5. **丰富的命令**：`cy.get().should().click()` 链式 API

**对比表**：

| 维度 | Cypress | Playwright | Selenium | Puppeteer | TestCafe |
|---|---|---|---|---|---|
| 定位 | E2E 主流 | 现代多浏览器 | 老牌 | Chrome 自动化 | 商用友好 |
| 浏览器 | Chromium/Firefox/WebKit | 全部主流 | 全部 | Chromium/FF | 全部 |
| 速度 | ✅ | ✅ 极快 | ⚠️ | ✅ 极快 | ⚠️ |
| 调试 | ✅ 极强 | ✅ 强 | ⚠️ | ⚠️ | ⚠️ |
| 并行 | ✅ Cypress Cloud | ✅ 原生 | ✅ Grid | ⚠️ | ✅ |
| 适合 | Web 应用 E2E | 跨浏览器 | 传统企业 | 脚本爬虫 | 商用 E2E |

## 思维导图

```mermaid
mindmap
  root((Cypress))
    核心概念
      Test
        it() 测试
      Suite
        describe() 套件
      Hook
        before beforeEach
      Custom Command
        cy.myCommand
    命令系统
      链式 API
        cy.get().should()
      查询
        get contains find
      动作
        click type check
        select submit scroll
      断言
        should expect
        BDD 风格
      等待
        wait
        自动重试
    浏览器控制
      cy.visit
        打开 URL
      cy.url
        当前 URL
      cy.title
        页面标题
      cy.viewport
        视口大小
      cy.go
        前进后退
    DOM 操作
      get find contains
      within
        限定范围
      its invoke
        调用方法
      wrap as
        包装对象
    网络
      intercept
        拦截
      route
        旧版
      request
        HTTP 调用
      fixture
        静态数据
      stub
        函数模拟
    测试类型
      端到端
        E2E
      组件
        Component Testing
        Vue React
      API
        cy.request
      单元
        不推荐
    调试
      时间旅行
        回放
      截图
        失败截图
      视频
        全程录制
      DevTools
        浏览器调试
      paused
        暂停模式
    配置
      cypress.config.js
        e2e component
      env
        环境变量
      baseUrl
        基础 URL
      viewport
        视口
    高级特性
      Cypress Cloud
        商业服务
        平行测试
      Dashboard
        录制备查
      Flake Detection
        抖动检测
      Smart Orchestration
        智能编排
    生态
      Testing Library
        @testing-library/cypress
      Cucumber
        BDD 集成
      Percy
        视觉测试
      Axe
        无障碍
    应用场景
      Web 应用
        E2E
      CI/CD
        持续集成
      回归测试
        防回归
      组件测试
        单元集成
```

## 关键代码

### 一、安装与配置

```bash
# 安装
npm install -D cypress

# 打开测试运行器
npx cypress open

# cypress.config.js
import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    specPattern: "cypress/e2e/**/*.{cy,spec}.{js,ts}",
    supportFile: "cypress/support/e2e.js",
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    screenshotOnRunFailure: true
  },
  component: {
    devServer: {
      framework: "react",
      bundler: "vite"
    },
    specPattern: "src/**/*.cy.{js,ts,jsx,tsx}"
  }
});
```

### 二、第一个 E2E 测试

```typescript
// cypress/e2e/login.cy.ts
describe("用户登录", () => {
  beforeEach(() => {
    cy.visit("/login");
  });

  it("成功登录", () => {
    // 自动等待元素出现
    cy.get('input[name="email"]').type("user@example.com");
    cy.get('input[name="password"]').type("password123");
    cy.get('button[type="submit"]').click();

    // 断言：跳转到首页
    cy.url().should("include", "/dashboard");
    cy.get('[data-testid="user-avatar"]').should("be.visible");
  });

  it("密码错误", () => {
    cy.get('input[name="email"]').type("user@example.com");
    cy.get('input[name="password"]').type("wrong");
    cy.get('button[type="submit"]').click();

    cy.contains("密码错误").should("be.visible");
    cy.url().should("include", "/login");
  });

  it("表单校验", () => {
    cy.get('button[type="submit"]').click();
    cy.get('input[name="email"]:invalid').should("exist");
  });
});
```

### 三、网络拦截

```typescript
// 拦截 API 返回
describe("用户列表", () => {
  beforeEach(() => {
    // 拦截 GET /api/users
    cy.intercept("GET", "/api/users", {
      statusCode: 200,
      body: {
        users: [
          { id: 1, name: "张三" },
          { id: 2, name: "李四" }
        ]
      }
    }).as("getUsers");

    cy.visit("/users");
  });

  it("显示用户列表", () => {
    cy.wait("@getUsers");
    cy.get('[data-testid="user-row"]').should("have.length", 2);
    cy.contains("张三").should("be.visible");
  });
});

// 拦截并修改响应
cy.intercept("POST", "/api/orders", (req) => {
  // 模拟服务端错误
  req.reply({ statusCode: 500, body: { error: "服务端错误" } });
});

// 用 fixture 静态数据
cy.intercept("GET", "/api/products", { fixture: "products.json" });
```

### 四、自定义命令

```typescript
// cypress/support/commands.ts
declare global {
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<void>;
      getByTestId(testId: string): Chainable<JQuery<HTMLElement>>;
      createUser(user: any): Chainable<any>;
    }
  }
}

Cypress.Commands.add("login", (email, password) => {
  cy.request("POST", "/api/auth/login", { email, password })
    .its("body.token")
    .as("token")
    .then(token => {
      window.localStorage.setItem("token", token);
    });
});

Cypress.Commands.add("getByTestId", (testId) => {
  return cy.get(`[data-testid="${testId}"]`);
});

Cypress.Commands.add("createUser", (user) => {
  return cy.request("POST", "/api/users", user);
});

// 使用
describe("Dashboard", () => {
  it("展示用户", () => {
    cy.login("admin@example.com", "password");
    cy.visit("/dashboard");
    cy.getByTestId("user-stats").should("contain", "100");
  });
});
```

### 五、组件测试

```typescript
// src/components/Counter.cy.tsx
import { Counter } from "./Counter";

describe("Counter 组件", () => {
  it("初始为 0，点击 +1", () => {
    cy.mount(<Counter initial={0} />);
    cy.contains("0").should("be.visible");
    cy.get('button[aria-label="increment"]').click();
    cy.contains("1").should("be.visible");
  });

  it("边界值", () => {
    cy.mount(<Counter initial={-1} />);
    cy.get('button[aria-label="decrement"]').click();
    cy.contains("-2").should("be.visible");
  });
});
```

### 六、Page Object 模式

```typescript
// cypress/pages/LoginPage.ts
export class LoginPage {
  visit() {
    cy.visit("/login");
    return this;
  }

  fillEmail(email: string) {
    cy.get('input[name="email"]').clear().type(email);
    return this;
  }

  fillPassword(password: string) {
    cy.get('input[name="password"]').clear().type(password);
    return this;
  }

  submit() {
    cy.get('button[type="submit"]').click();
    return this;
  }

  getError() {
    return cy.get('[data-testid="error-message"]');
  }
}

// 使用
import { LoginPage } from "../pages/LoginPage";

describe("用户登录", () => {
  it("登录失败", () => {
    new LoginPage()
      .visit()
      .fillEmail("user@example.com")
      .fillPassword("wrong")
      .submit();

    new LoginPage().getError().should("contain", "密码错误");
  });
});
```

### 七、CI/CD 集成

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on: [push]
jobs:
  cypress:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }

      - run: npm ci

      - name: 启动服务并测试
        run: |
          npm start &
          npx wait-on http://localhost:3000
          npx cypress run --record --key ${{ secrets.CYPRESS_KEY }}

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: cypress-screenshots
          path: cypress/screenshots
```

```bash
# 关键 CLI 命令
cypress run                              # 无头模式跑测试
cypress run --spec "cypress/e2e/login.cy.ts"
cypress run --browser chrome
cypress run --headed                     # 显示浏览器
cypress run --record --key <key>         # 上传到 Cypress Cloud
```

## 核心洞察

- **Cypress 与 Selenium 是两种哲学**：Selenium 走 WebDriver 协议、Cypress 直接跑在浏览器内核中——Cypress 更现代但只支持 Chromium/Firefox/WebKit
- **时间旅行是 Cypress 的杀手特性**：每个 `cy.*` 命令都生成快照，调试时可直接看到 DOM 在任意时刻的状态
- **自动等待消除了 `sleep`/`waitFor`**：Cypress 内部持续重试直到条件满足或超时（默认 4s），让测试稳定
- **Cypress 不适合爬虫场景**：固定浏览器实例、固定 URL，与 Puppeteer 的灵活性不同
- **Cypress Component Testing 是 v10 后的亮点**：用真实浏览器测试 React/Vue 组件，比 jsdom 真实，比 Storybook 测试专注
- **`cy.intercept` 替代了 `cy.route`**：v7 后改名为 `cy.intercept`，支持请求/响应双向修改
- **Cypress Cloud 是商业服务**：免费版有 5 万次/月测试额度，企业版支持并行、抖动检测、录制备查
- **Cypress 不支持跨域 iframe**：原生设计不支持跨源 iframe，需用 `cy.origin`（v12 后的实验功能）
- **Cypress 13 引入 `cy.session`**：复用登录状态，加速测试套件
- **Cypress 比 Playwright 慢但更稳**：Cypress 牺牲了部分速度换稳定性，对抖动测试（flaky test）容忍度更好
- **Playwright 是 Microsoft 的挑战者**：原生支持移动端、跨标签页，2024 年起很多新项目选 Playwright
- **Cypress 的 `data-testid` 习惯**：与组件解耦，测试不依赖 class/text，业界共识

## 跨项目引用

- **[[react]]** / **[[vue]]** / **[[angular]]**：Cypress 12+ 支持所有主流框架的组件测试
- **[[typescript]]**：Cypress 完整 TS 支持，配置 + 自定义命令类型化
- **[[playwright]]**：Cypress 的直接竞品，跨浏览器测试更强大但生态较新
- **[[selenium]]**：老牌 E2E 工具，仍是企业级 Java/SAP 项目的标配
- **[[puppeteer]]**：Chrome DevTools 协议，Cypress 底层借鉴
- **[[jest]]**：Cypress 负责 E2E、Jest 负责单元测试，分工明确
- **[[testing-library]]**：`@testing-library/cypress` 让选择器更语义化
- **[[mock]]**：Cypress 的 `cy.intercept` + `cy.fixture` 是前端 mock 数据的标配
- **[[github actions]]**：CI 中跑 Cypress 测试是标准做法
- **[[docker]]**：Cypress 提供官方 Docker 镜像 `cypress/included`，CI 一键启动
- **[[cucumber]]** / **BDD**：Cypress 可集成 cucumber 做 BDD 风格测试
