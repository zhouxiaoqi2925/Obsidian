# DefinitelyTyped - 类型治理仓库

**来源**：GitHub DefinitelyTyped/DefinitelyTyped (50k+ stars)
**创建时间**：2026-06-02

---

## 一、类型机制（Type Mechanics）

### 1. types/{pkg}/ 5 文件约定（约定优于配置）

**问题场景**：8000+ 个包、1 万贡献者，任何"灵活配置"都会让治理崩溃。DT 用 5 个铁律文件**消除一切认知负担**——看一个包就能理解所有包。

**解决方案**：
```
types/react/
├── index.d.ts           # 必需：类型定义主体
├── react-tests.ts       # 必需：编译即测试
├── package.json         # 必需：元数据 + typesVersions
├── tsconfig.json        # 必需：strict + typeRoots 配置
└── .npmignore           # 必需：发布排除（保留 -tests.ts 之外）

types/node/
├── index.d.ts           # 70+ 子模块 reference
├── fs.d.ts              # 子模块
├── http.d.ts
├── ...
└── tsconfig.json
```

每个 `package.json` 模板：
```json
{
  "name": "@types/react",
  "version": "18.2.0",
  "description": "TypeScript definitions for react",
  "license": "MIT",
  "contributors": [
    { "name": "Asad Saeeduddin", "githubUsername": "asad-saeeduddin" }
  ],
  "main": "",
  "types": "index.d.ts",
  "repository": {
    "type": "git",
    "url": "https://github.com/DefinitelyTyped/DefinitelyTyped.git",
    "directory": "types/react"
  },
  "scripts": {},
  "dependencies": {
    "csstype": "~3.0.2"
  },
  "peerDependencies": {}
}
```

**关键参数**：

| 文件 | 作用 | 必填 |
|---|---|---|
| `index.d.ts` | 类型定义主体 | ✅ |
| `*-tests.ts` | 类型测试（编译时） | ✅ |
| `package.json` | npm 元数据 | ✅ |
| `tsconfig.json` | strict + baseUrl 配置 | ✅ |
| `.npmignore` | 排除发布（除 index.d.ts） | ✅ |
| `OLD-VERSIONS/` | 历史版本（只读） | ❌ |
| `ts5.0/` `ts5.1/` | TS 版本切换 | ❌ |

**最佳实践**：
1. ✅ **复制 5 文件就建新包**——任何贡献者零学习成本
2. ✅ `index.d.ts` 是唯一对外暴露的入口，其它文件不发布到 npm
3. ✅ `*-tests.ts` 后缀让 TypeScript 编译器在 build 时**强制检查**
4. ✅ `package.json` 的 `types` 字段必须指向 `index.d.ts`
5. ✅ `OLD-VERSIONS/` 是只读区——新 PR 不能动它（历史快照）

### 2. 三层 lib reference（Node.js 类型的扩展术）

**问题场景**：Node.js 类型需要用 TS 5.2+ 新增的 `using` 语法（`Symbol.dispose`），但又不能"重新发明"这个类型。DT 用 **三层 lib reference** 借用 TS 内置 lib，再扩展。

**解决方案**：
```ts
// types/node/index.d.ts
/// <reference lib="es2020" />
/// <reference lib="esnext.disposable" />
/// <reference lib="esnext.float16" />

// 70+ 子模块 reference
/// <reference path="fs.d.ts" />
/// <reference path="fs/promises.d.ts" />
/// <reference path="http.d.ts" />
/// <reference path="https.d.ts" />
/// <reference path="net.d.ts" />
/// <reference path="stream.d.ts" />
/// <reference path="stream/consumers.d.ts" />
/// <reference path="stream/web.d.ts" />
// ... 70+ 行

// 扩展内置 lib
declare global {
    namespace NodeJS {
        interface ProcessEnv {
            [key: string]: string | undefined;
        }
    }
}
```

**关键参数**：

| reference 类型 | 作用 | 语法 |
|---|---|---|
| `lib` | 引用 TS 内置 lib（`es2020`/`esnext.*`） | `/// <reference lib="..." />` |
| `path` | 引用同包其它 .d.ts 文件 | `/// <reference path="..." />` |
| `types` | 引入 npm 包类型 | tsconfig 字段 `types: ["node"]` |
| `triple-slash` 注释 | TS 1.x 时代的"include"机制 | 仍可工作但建议现代代码用 `import type` |

**最佳实践**：
1. ✅ `lib reference` 一定要先于代码——保证 lib 类型已加载
2. ✅ 70+ sub-module reference 一次性写在 `index.d.ts` 顶部
3. ✅ 不要在 sub-module .d.ts 里再 reference 同级（循环引用会编译警告）
4. ✅ `declare global` 扩展 NodeJS.ProcessEnv 等内置类型
5. ✅ 用 `Symbol.dispose`（TS 5.2+）时必须先 `reference lib="esnext.disposable"`

### 3. tsconfig.json strict + typeRoots 范式

**问题场景**：DT 包要测"自己 + 依赖"，但不能引入 `@types/node`（污染全局）。每个 type 包用一致的 tsconfig 配置——`strict` 强制类型严格、`baseUrl: "../"` 让依赖可见、`types: []` 防止全局污染。

**解决方案**：
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "lib": ["es6"],
    "noImplicitAny": true,
    "noImplicitThis": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "baseUrl": "../",
    "typeRoots": ["../"],
    "types": [],
    "noEmit": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["."],
  "files": ["index.d.ts", "react-tests.ts"]
}
```

**关键参数**：

| 配置 | 推荐 | 作用 |
|---|---|---|
| `module` | `commonjs` | DT 测试用 CommonJS（兼容性最好） |
| `noImplicitAny` | `true` | 禁止隐式 any |
| `strict` | `true` | 严格模式总开关 |
| `baseUrl` | `"../"` | 允许 `import from "../other-types"` |
| `typeRoots` | `["../"]` | 只认 `./` 下的 type 包 |
| `types: []` | **空数组** | 关键：禁止全局类型污染 |
| `noEmit` | `true` | 只 type-check，不输出 .js |
| `skipLibCheck` | `true` | 跳过 .d.ts 自身检查（速度） |

**最佳实践**：
1. ✅ `types: []` 是 DT 范式核心——避免 `@types/node` 自动污染所有包
2. ✅ `baseUrl: "../"` + `typeRoots: ["../"]` 组合是 DT 独有模式
3. ✅ `noImplicitAny: true` + `strictNullChecks: true` 强制类型严格
4. ✅ `forceConsistentCasingInFileNames` 防 Mac/Windows 大小写不一致
5. ✅ `skipLibCheck: true` 跳过 .d.ts 内部检查（dtslint 的性能关键）

### 4. ts5.0/ts5.1 dist-tags 多版本切换

**问题场景**：旧项目还跑 TS 4.x，新项目跑 TS 5.6+。DT 包**一个版本无法同时兼容所有 TS 版本**。DT 用 npm **dist-tags** 让 `@types/react@ts5.0` 指向旧版、`@types/react@latest` 指向新版。

**解决方案**：
```bash
# 发布多个 dist-tag（DefinitelyTyped-tools/publisher 脚本自动）
npm publish --tag ts4.0 .   # 旧版
npm publish --tag ts4.8 .
npm publish --tag ts5.0 .
npm publish --tag ts5.1 .
npm publish --tag ts5.2 .
npm publish --tag latest .  # 最新

# 用户用 npm 8+ 自动匹配
npm install @types/react
# npm 会读 package.json 的 engines.ts 自动选对应 dist-tag

# 或显式指定
npm install @types/react@ts5.0
```

`package.json` 里的 engines 字段：
```json
{
  "name": "@types/react",
  "engines": {
    "node": ">=18"
  },
  "typesVersions": {
    ">=5.0.0-0": {
      "*": ["ts5.0/*"]
    },
    ">=4.8.0-0": {
      "*": ["ts4.8/*"]
    }
  }
}
```

**关键参数**：

| dist-tag | 含义 | 用户场景 |
|---|---|---|
| `ts4.8` | TS 4.8-5.0 兼容 | 旧项目 |
| `ts5.0` | TS 5.0-5.2 兼容 | 主流项目 |
| `ts5.1` | TS 5.1+ | 新项目 |
| `latest` | 最新发布 | 默认 |
| `next` | beta/rc | 测试 |

**最佳实践**：
1. ✅ npm 8+ 会根据 `engines.ts` 自动选 dist-tag，无需手动指定
2. ✅ **不要在 CI 中固定到 dist-tag**——`@types/react@ts5.0` 可能过期
3. ✅ 升级 TS 时把旧 dist-tag 保留 6 个月——给用户缓冲
4. ✅ `ts5.0/`、`ts5.1/` 子目录存不同版本的 .d.ts
5. ✅ 旧 dist-tag 失效前在 GitHub Discussions 公告

### 5. OLD-VERSIONS 历史存档（只读考古区）

**问题场景**：用户从 `react@15` 升级到 `react@18`，需要回看 2015 年的类型签名。DT 保留所有历史版本在 `OLD-VERSIONS/`，但**禁止新 PR 修改**——这是考古博物馆。

**解决方案**：
```
types/react/
├── OLD-VERSIONS/
│   ├── 0.14/
│   │   ├── index.d.ts
│   │   ├── react-tests.ts
│   │   └── package.json
│   ├── 15.0/
│   │   └── ...
│   ├── 16.0/
│   │   └── ...
│   └── 17.0/
│       └── ...
├── index.d.ts           ← 当前版本
├── react-tests.ts
├── package.json
└── tsconfig.json
```

OLD-VERSIONS 的 package.json 用 `deprecated` 字段：
```json
{
  "name": "@types/react",
  "version": "15.0.0",
  "deprecated": "This is a deprecated version of @types/react. Please upgrade to the latest version."
}
```

**关键参数**：

| 文件 | 是否可改 | 何时 |
|---|---|---|
| `OLD-VERSIONS/*` | ❌ 不可改 | 历史快照，永久 |
| `index.d.ts` | ✅ 可改 | 当前版本演进 |
| `ts5.0/*` | ❌ 不可改 | 旧 dist-tag 锁定 |
| `ts5.1/*` | ✅ 可改 | 当前主推 |

**最佳实践**：
1. ✅ 升级大版本时新建 `ts5.X/` 目录，**不直接覆盖**旧版
2. ✅ OLD-VERSIONS 文件夹可用来 git blame 历史 bug
3. ✅ `deprecated` 字段让 npm 提示用户升级
4. ✅ 用户从 npm 装 `react@15` 类型时，DT 自动选 OLD-VERSIONS
5. ✅ CI 跑 symlink 检查时 OLD-VERSIONS 也不能有 symlink

## 二、Monorepo 治理（Repository Governance）

### 6. pnpm monorepo 工作区（硬链接省 90% 磁盘）

**问题场景**：8000+ 包，npm 7 workspaces 装一遍要几十 GB 磁盘（每个包独立 `node_modules`）。DT 2022 年从 npm workspaces 切换到 **pnpm 9 workspaces**——用硬链接共享 node_modules，磁盘降到 1.6GB。

**解决方案**：
```yaml
# pnpm-workspace.yaml
packages:
  - "types/*"
```

```ini
# .npmrc
registry=https://registry.npmjs.org/
strict-peer-dependencies=false
auto-install-peers=true
shamefully-hoist=false
```

```json
// 根 package.json
{
  "name": "definitely-typed",
  "private": true,
  "version": "0.0.1",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "test": "dtslint --files types",
    "lint": "eslint scripts"
  },
  "devDependencies": {
    "@definitelytyped/dtslint": "^0.0.127",
    "@definitelytyped/dts-gen": "^0.5.0",
    "pnpm": "^9.0.0"
  }
}
```

**关键参数**：

| 配置 | 推荐 | 作用 |
|---|---|---|
| `packages: "types/*"` | - | 8000+ 包都算 workspace |
| `registry` | `https://registry.npmjs.org/` | 官方源 |
| `shamefully-hoist` | `false` | 不用 npm 兼容模式（更快） |
| `strict-peer-dependencies` | `false` | DT 接受 peer dep 缺失 |
| `auto-install-peers` | `true` | 自动装 peer deps |

**最佳实践**：
1. ✅ pnpm 9 + `corepack enable` 启用——不要全局装 pnpm
2. ✅ 单包测试用 `pnpm --filter @types/react test`，不要全量
3. ✅ `shamefully-hoist: false` 保持 pnpm 严格依赖图
4. ✅ 升级 pnpm 9+ 才支持 DT 当前的硬链接优化
5. ✅ Windows + WSL 2 是最佳开发环境（pnpm 硬链接在 NTFS 上有 bug）

### 7. CODEOWNERS 自动路由（按包分片 owner）

**问题场景**：10000 贡献者提交 PR，maintainer 怎么知道"这次 PR 归谁 review"？手动 @ 不到所有人。DT 用 GitHub 原生 **CODEOWNERS** 文件，让 GitHub 自动 @owner。

**解决方案**：
```gitignore
# .github/CODEOWNERS（节选）

# 默认 owner 是 DT maintainers 团队
*                                       @DefinitelyTyped/DefinitelyTyped

# React / React-DOM 由社区 lead 维护
/types/react/                           @asad-saeeduddin
/types/react-dom/                       @asad-saeeduddin

# Node.js 由官方 maintainers 维护
/types/node/                            @DefinitelyTyped/DefinitelyTyped
/types/node-fetch/                      @types-node-fetch-maintainers

# Lodash 由团队维护
/types/lodash/                          @types-lodash-maintainers

# CSS 相关
/types/csstype/                         @types-css-maintainers
```

提交 PR 时 GitHub 自动：
1. 解析 PR 改了哪些路径
2. 匹配 CODEOWNERS
3. 在 PR 评论里 @ 对应 owner
4. **没 owner approve 不能 merge**（GitHub 强制）

**关键参数**：

| 路径模式 | owner 写法 | 触发条件 |
|---|---|---|
| `*` | `@org/team` | 默认 fallback |
| `/types/react/` | `@username` | 精确路径 |
| `/types/react-*/` | `@team` | 通配符 |
| `**/test.ts` | `@team` | 任意子目录 |

**最佳实践**：
1. ✅ 一个包至少有 1-2 个 owner——防止"孤儿包"
2. ✅ ghostbuster 脚本每周扫"无 owner 的包"，自动 issue 提醒
3. ✅ owner 自己也要写类型——不能挂名不做事
4. ✅ 大包（react/vue）有多人 co-maintain——避免单点失联
5. ✅ CODEOWNERS 改动要 PR 提——不要直接 push

### 8. mergebot 自动 @owner/lint/merge（PR 自治）

**问题场景**：1000+ PR/天，人 review 不完。DT 用 **mergebot** 7x24 自动跑 dtslint、自动 @owner、全过则自动 merge。人类只 review"分歧点"。

**解决方案**：
```yaml
# .github/workflows/mergebot.yml
name: Merge Bot
on:
  pull_request:
    types: [opened, edited, synchronize, reopened]
  issue_comment:
    types: [created]

jobs:
  merge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 9
      - name: Install
        run: pnpm install --frozen-lockfile
      - name: Run dt-mergebot
        uses: DefinitelyTyped/dt-mergebot@main
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          DT_BOT_USER_TOKEN: ${{ secrets.DT_BOT_TOKEN }}
```

mergebot 做的事：
```ts
// dt-mergebot/src/index.ts 简化
async function processPR(pr: PullRequest) {
    // 1. 识别包名（PR title 必须 "Package: description"）
    const pkgMatch = pr.title.match(/^([a-z0-9-]+):/);
    if (!pkgMatch) {
        await pr.comment('PR title must start with package name');
        return;
    }
    const pkg = pkgMatch[1];

    // 2. 找 owner
    const owners = await getOwners(pkg);
    await pr.comment(`@${owners.join(' @')}`);

    // 3. 跑 dtslint
    const lint = await runDtslint(pkg);
    if (lint.failed) {
        await pr.comment('Lint failed: ' + lint.errors);
        return;
    }

    // 4. 等 approve
    if (pr.approvals < 1) return;

    // 5. 自动 merge
    await pr.merge();
}
```

**关键参数**：

| 触发事件 | bot 行为 |
|---|---|
| `pull_request: opened` | 识别包名、@owner、跑 lint |
| `pull_request: synchronize` | 重跑 lint |
| `issue_comment: created` | 识别"rebuild"等指令 |
| `pull_request: closed` | 清理分支 |

**最佳实践**：
1. ✅ PR title 必须 `Package: 描述`——bot 不识别会卡住
2. ✅ AI 自动 PR 必须带 `[auto-generated]` 标签
3. ✅ AI 一次只能提一个 PR（README 明文禁止）
4. ✅ Bot 评论失败可手动 re-run
5. ✅ 不要在 PR 评论里"@ bot"——bot 不响应

### 9. AI 反作弊条款（README 9-18 行）

**问题场景**：2024 年起，AI 工具（如 Cursor/Copilot）能"批量给所有 untyped 包提 PR"——但这些 PR 质量低、没有真实使用。DT 2024 年在 README **明文禁止** AI spam。

**解决方案**：
```markdown
<!-- README.md 9-18 行（DT 强规范） -->

## Don't write a PR

- The package itself includes types (e.g. `axios` ships .d.ts, don't add @types/axios)
- The PR is generated by AI without verification
- You're submitting PRs for a large number of packages at once
- You have not actually used the package's types in a real project
- You're fixing an issue without explaining why your fix is correct
- The PR title is not `Package-Name: Description`

## AI 工具特别要求

- 必须 PR title 加 `[auto-generated]` 标签
- 一次只能提一个 PR（禁止批量给 100 个包提 PR）
- 必须有人在真实项目里用过这些类型
- CI 全过才能 merge（bot 自动跑 dtslint）
```

**关键参数**：

| 禁止行为 | 后果 |
|---|---|
| 批量 AI 提 PR | bot 自动 close + 警告 |
| 库自带 .d.ts 还装 @types | 重复类型冲突 |
| 标题不规范 | mergebot 跳过 |
| 无真实使用 | maintainer 拒绝 |

**最佳实践**：
1. ✅ AI 生成的 PR 必须标 `[auto-generated]` 让人识别
2. ✅ 一次只改一个包——不要跨包提 PR
3. ✅ 修改前先在真实 TS 项目里用 @types/foo 验证
4. ✅ PR 描述里说明"为什么这样改是对的"——不只是改代码
5. ✅ 库自带 .d.ts 时**不要**新建 @types/foo

### 10. SUPPORT WINDOW 2 年滚动窗口

**问题场景**：TS 5.0 发布后，DT 旧类型（如 TS 4.x 兼容写法）需要持续测试。维护成本太高。DT 引入 **2 年 SUPPORT WINDOW**——TS 5.0 发布两年后放弃测试，专注新版。

**解决方案**：
```yaml
# .github/workflows/CI.yml 的矩阵
strategy:
  matrix:
    # SUPPORT WINDOW 决定测试哪些 TS 版本
    ts: ['4.8', '4.9', '5.0', '5.1', '5.2', '5.3', '5.4', '5.5', '5.6']
    # 老的 TS 4.0-4.7 已退出 WINDOW，不再测试
```

window 滚动规则：
```js
// scripts/support-window.js
const TS_RELEASES = {
    '5.0': '2023-03-14',
    '5.1': '2023-11-01',
    '5.2': '2024-08-22',
    '5.3': '2024-11-12',
    '5.4': '2025-01-22',
    // ...
};

const WINDOW_YEARS = 2;

function inWindow(version) {
    const release = new Date(TS_RELEASES[version]);
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - WINDOW_YEARS);
    return release > cutoff;
}
```

**关键参数**：

| TS 版本 | 发布日 | 退出 WINDOW | 当前状态 |
|---|---|---|---|
| 4.0 | 2020-08 | 2022-08 | 已退出 |
| 4.8 | 2022-08 | 2024-08 | 边缘（半年内退出） |
| 5.0 | 2023-03 | 2025-03 | 在窗口内 |
| 5.4 | 2025-01 | 2027-01 | 在窗口内 |

**最佳实践**：
1. ✅ 新 TS 版本发布后**当天**进 SUPPORT WINDOW
2. ✅ 旧版本出窗口后不再跑 CI（节省 30% CI 时间）
3. ✅ 升级 `ts5.0/` 目录不删除——dist-tag 还能用
4. ✅ 用户用 TS 4.0 时——必须自己 fork 老版 DT
5. ✅ WINDOW 公告在 GitHub Discussions——提前 3 个月通知

## 三、CI 与发布（CI & Publishing）

### 11. -tests.ts 编译即测试（零运行时）

**问题场景**：8000+ 包用 jest/mocha 测试不现实（要装运行时框架）。DT 用 **types-only tests**——测试代码不执行，只让 tsc 编译。编译失败 = 测试失败。

**解决方案**：
```ts
// types/react/react-tests.ts
import * as React from 'react';
import { expectType, expectError, expectAssignable } from 'dtslint';

// 期望类型
const el = <div className="foo" />;
expectType<JSX.Element>(el);

// 期望编译错误
expectError(<div invalidProp="x" />);

// 期望可赋值
const handler: React.MouseEventHandler = (e) => {
    expectType<React.MouseEvent>(e);
    expectAssignable<MouseEvent>(e.nativeEvent);
};

// 异步测试
async function fetchUser() {
    const user = await api.getUser();
    expectType<Promise<User>>(api.getUser());
    return user;
}
```

dtslint 的核心实现：
```ts
// dtslint/index.ts 简化
function checkFile(file: string) {
    const program = ts.createProgram([file], config);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    return diagnostics;
}
```

**关键参数**：

| 函数 | 作用 | 用途 |
|---|---|---|
| `expectType<T>(v)` | 期望 v 类型为 T | 验证返回类型 |
| `expectError(e)` | 期望 e 编译报错 | 验证类型守卫 |
| `expectAssignable<T>(v)` | 期望 v 可赋给 T | 验证参数 |
| `expectNotAssignable<T>(v)` | 期望 v 不可赋给 T | 验证类型约束 |

**最佳实践**：
1. ✅ 测试**永远不执行**——只 type-check
2. ✅ 测试代码用 `import * as React from 'react'`（dtslint 强制）
3. ✅ `expectError` 比 `expectType` 更难写——但能验证类型守卫
4. ✅ 测试文件命名 `{pkg}-tests.ts`——dtslint 自动发现
5. ✅ dtslint 比 jest 跑得快 100x（毫秒级 vs 秒级）

### 12. dtslint expectType/expectError（自定义类型断言）

**问题场景**：普通测试框架无法表达"类型期望"——你不能 `assert(typeof x === 'Promise')` 测类型。dtslint 提供**编译期断言函数**，让"类型期望"成为一等公民。

**解决方案**：
```ts
// dtslint/expectType.ts
export function expectType<T>(value: T): void;  // 签名

// 实现（伪代码）
declare global {
    function expectType<T>(): <U>(value: U & (T extends U ? U : 'expected ' + string)) => void;
}

// 用法
expectType<Promise<string>>(foo());  // 编译通过
expectType<Promise<number>>(foo());  // 编译失败：期望 number 实际 string

// expectError 实现
declare global {
    function expectError<T extends true>(value: T): void;
}

// 用法
expectError(<div invalidProp="x" />);  // 编译通过（有错）
expectError(<div className="x" />);    // 编译失败（无错）
```

**关键参数**：

| 断言 | 编译时检查 | 失败表现 |
|---|---|---|
| `expectType<T>(v)` | v 必须类型为 T | "Type X is not assignable to T" |
| `expectError(e)` | e 必须编译报错 | "Expected error" |
| `expectAssignable<T>(v)` | v 可赋给 T | "X is not assignable to T" |
| `expectNotAssignable<T>(v)` | v 不可赋给 T | "T is assignable to X" |

**最佳实践**：
1. ✅ 任何新加 API 都必须有 `expectType` 测试
2. ✅ 故意拒绝的用法用 `expectError` 验证
3. ✅ 内部 SDK 的类型库可以参考 dtslint 模式
4. ✅ dtslint 不能测 runtime 行为——只能测类型
5. ✅ `expectAssignable` 是"宽松相等"——能用就用它

### 13. 增量 CI 矩阵（只测改动的包）

**问题场景**：8000+ 包全量跑 CI 一次要 4 小时。DT 用 **git diff + pnpm filter** 找出"被改动包及其依赖"，只跑这些。

**解决方案**：
```yaml
# .github/workflows/CI.yml:45-53
- id: matrix
  run: |
    if [ "${{ github.event_name == 'schedule' || github.event_name == 'workflow_dispatch' }}" == "true" ]; then
      TESTS=all
    else
      # 找所有依赖本次改动的 @types 包
      TESTS=$(pnpm ls --depth -1 --parseable --filter '...@types/**[HEAD^1]' | wc -)
    fi
    MATRIX=$(node ./scripts/get-ci-matrix $TESTS)
    echo "matrix=$MATRIX" >> $GITHUB_OUTPUT
```

shard 算法（`scripts/get-ci-matrix.js`）：
```js
// 把 8000 包切成 N 个 shard 并行
function shard(packages, n) {
    // 按修改时间排序，最近改的优先跑
    packages.sort((a, b) => b.modified - a.modified);
    const shards = Array.from({length: n}, () => []);
    packages.forEach((pkg, i) => shards[i % n].push(pkg));
    return shards;
}
```

**关键参数**：

| 触发 | 测试范围 | 时间 |
|---|---|---|
| `pull_request` | 改动包 + 依赖包 | 5-15 分钟 |
| `schedule` (每天 12PM UTC) | 全部 8000 包 | 4 小时 |
| `workflow_dispatch` | 全部 | 4 小时 |
| `push` (main) | 全部 | 4 小时 |

**最佳实践**：
1. ✅ PR 触发增量矩阵——只跑改的包
2. ✅ cron 每天全量——抓"间接依赖"问题
3. ✅ shard 切分用 `modified` 排序——最近改的优先
4. ✅ `--parseable` 让 pnpm 输出机器可读格式
5. ✅ shard 数量 = `min(总包数, 50)`——超过后意义不大

### 14. symlink 检查（Windows 友好性）

**问题场景**：Windows 上检出代码时，symlink 经常断链。DT **完全禁止**仓库里有 symlink——`find . -type l` 必须在 CI 失败。

**解决方案**：
```yaml
# .github/workflows/CI.yml:75-80
- name: 'Pre-run validation'
  run: |
    symlinks="$(find . -type l)"
    if [[ -n "$symlinks" ]]; then
      printf "Aborting: symlinks found:\n%s" "$symlinks"; exit 1
    fi
```

```bash
# 本地验证
find . -type l | head
# 输出为空 = 干净
```

**关键参数**：

| 命令 | 用途 |
|---|---|
| `find . -type l` | 找所有符号链接 |
| `find . -type l | wc -l` | 计数 |
| `readlink <path>` | 查看 symlink 指向 |
| `git ls-files -s` | git 跟踪的 symlink |

**最佳实践**：
1. ✅ 任何新包不能用 symlink——必须真实文件
2. ✅ Windows + WSL 2 开发体验最好
3. ✅ Windows + Git Bash 时 `find` 命令可能不识别
4. ✅ git worktree 在 DT 仓库里**不工作**——故意放弃兼容性
5. ✅ 跨平台包用**纯文本**而非 symlink 引用

### 15. get-ci-matrix.js 分片算法

**问题场景**：8000+ 包跑单 CI job 要 4 小时。`get-ci-matrix.js` 把它们切到 50 个 shard 并行跑，每个 shard 80 个包。

**解决方案**：
```js
// scripts/get-ci-matrix.js 简化
const fs = require('fs');
const path = require('path');

const TYPES_DIR = 'types';
const N_SHARDS = 50;

function getAllPackages() {
    return fs.readdirSync(TYPES_DIR)
        .filter(f => fs.statSync(path.join(TYPES_DIR, f)).isDirectory());
}

function getChangedPackages() {
    const diff = execSync('git diff --name-only HEAD^1 HEAD -- types/').toString();
    return diff.split('\n')
        .filter(line => line.startsWith('types/'))
        .map(line => line.split('/')[1]);
}

function shard(packages) {
    // 按包名字典序排
    packages.sort();
    const shards = Array.from({length: N_SHARDS}, () => []);
    packages.forEach((pkg, i) => shards[i % N_SHARDS].push(pkg));
    return shards;
}

const pkg = process.argv[2] === 'all' ? getAllPackages() : getChangedPackages();
const shards = shard(pkg);
console.log(JSON.stringify(shards));
```

**关键参数**：

| 配置 | 默认 | 说明 |
|---|---|---|
| `N_SHARDS` | 50 | shard 数量（GitHub Actions 限额 256） |
| 输入参数 | `all` 或具体包数 | 决定全量还是增量 |
| 输出格式 | JSON | GitHub Actions 解析 |

**最佳实践**：
1. ✅ shard 数量 = `min(总包数 / 5, 50)`——平衡并发和开销
2. ✅ 字典序排序保证 shard 稳定——同一包总在同一 shard
3. ✅ modified 排序也能用——最近改的优先
4. ✅ shard 数量超过 50 后，GitHub Actions 反而变慢
5. ✅ get-ci-matrix.js 是 DT 内部 hack——不要在 PR 改

## 四、可靠性与生态（Reliability & Ecosystem）

### 16. dts-gen 脚手架生成器（5 分钟新建 type 包）

**问题场景**：新 npm 包要写 .d.ts，但贡献者不知道"5 文件铁律"的细节。DT 提供 **dts-gen** 工具——一行命令生成完整 type 包结构。

**解决方案**：
```bash
# 1. 安装
npm install -g dts-gen

# 2. 初始化 type 包
npx dts-gen --dt --name foo --template dts-gen/templates/foo

# 3. 自动生成 5 个文件
types/foo/
├── index.d.ts          # 基础模板
├── foo-tests.ts        # 空测试
├── package.json        # 自动生成元数据
├── tsconfig.json       # DT 标准配置
└── .npmignore          # 排除发布
```

dts-gen 内部实现：
```ts
// dts-gen/src/index.ts
async function generate(opts: GenerateOptions) {
    const { name, template } = opts;

    // 1. 读模板
    const tpl = await loadTemplate(template);

    // 2. 替换占位符
    const indexDts = tpl.indexDts.replace(/{{NAME}}/g, name);
    const pkgJson = tpl.pkgJson(name);

    // 3. 写文件
    const dir = path.join('types', name);
    await fs.mkdir(dir, {recursive: true});
    await fs.writeFile(path.join(dir, 'index.d.ts'), indexDts);
    await fs.writeFile(path.join(dir, `${name}-tests.ts`), '');
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(pkgJson, null, 2));
    await fs.writeFile(path.join(dir, 'tsconfig.json'), JSON.stringify(tpl.tsConfig, null, 2));
    await fs.writeFile(path.join(dir, '.npmignore'), tpl.npmIgnore);
}
```

**关键参数**：

| 模板 | 用途 |
|---|---|
| `dts-gen/templates/foo` | 简单函数库 |
| `dts-gen/templates/react` | React 组件库 |
| `dts-gen/templates/node` | Node.js 模块 |
| `dts-gen/templates/jest` | 测试框架 |

**最佳实践**：
1. ✅ 新 type 包都用 dts-gen 生成——不要手写 5 文件
2. ✅ 模板里 `--name` 是包名（必填）
3. ✅ 生成后用 `pnpm --filter @types/foo test` 验证
4. ✅ 模板版本要保持最新——CI 会检查
5. ✅ 自定义模板可放 `templates/` 私有目录

### 17. pnpm-lock.yaml 锁定（CI 可重现）

**问题场景**：DT 8000+ 包都依赖 pnpm-lock.yaml 锁定的版本。CI 严格用 `--frozen-lockfile`——lockfile 改了就 fail。

**解决方案**：
```yaml
# .github/workflows/CI.yml
- name: Install
  run: pnpm install --frozen-lockfile  # ← 关键

# 失败示例
# ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because ...
# → 提示 lockfile 过期
```

```bash
# 开发者本地更新
pnpm install  # 自动更新 lockfile
git add pnpm-lock.yaml
git commit -m "chore: update pnpm-lock.yaml"
```

**关键参数**：

| 命令 | 行为 |
|---|---|
| `pnpm install` | 更新 lockfile |
| `pnpm install --frozen-lockfile` | 严格匹配，lockfile 改就 fail |
| `pnpm install --no-frozen-lockfile` | 关闭严格模式（CI 不能用） |

**最佳实践**：
1. ✅ **永远** `--frozen-lockfile` 跑 CI——确保 lockfile 提交
2. ✅ 升级依赖时本地 `pnpm install` 更新 lockfile
3. ✅ lockfile 必须 commit 到 git
4. ✅ 不同分支用同一个 lockfile 不会冲突
5. ✅ dependabot 自动 PR 会更新 lockfile

### 18. cron publisher 自动发布

**问题场景**：mergebot 自动 merge 后，@types/* 需要发布到 npm。DT 用 **cron job** 每 24h 扫一次"已 merge 的 PR"，自动 publish 到 `@types/*` scope。

**解决方案**：
```yaml
# .github/workflows/publisher.yml
name: Publish to npm
on:
  schedule:
    - cron: '0 12 * * *'  # 每天 12PM UTC
  workflow_dispatch:

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0  # 全 history
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          registry-url: https://registry.npmjs.org/
      - name: Install
        run: npm ci
      - name: Publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: node scripts/publish-packages.js
```

publisher 做的事：
```js
// scripts/publish-packages.js 简化
async function publishChanged() {
    // 1. 找最近 24h merge 的 PR
    const merged = await getRecentMergedPRs();
    const packages = merged.map(pr => extractPkgName(pr.title));

    // 2. 准备发布
    for (const pkg of packages) {
        const dir = path.join('types', pkg);
        const version = await bumpVersion(dir);
        const distTags = ['ts4.8', 'ts5.0', 'ts5.1', 'ts5.2', 'latest'];

        // 3. publish 到所有 dist-tag
        for (const tag of distTags) {
            await execInDir(dir, `npm publish --tag ${tag}`);
        }
    }
}
```

**关键参数**：

| 触发 | 行为 |
|---|---|
| `cron: 0 12 * * *` | 每天 12PM UTC 全量扫 |
| `workflow_dispatch` | 手动触发 |
| 失败重试 | 3 次（指数退避） |

**最佳实践**：
1. ✅ 不发布 PR merge 后立即发——等 24h 沉淀
2. ✅ `NPM_TOKEN` 用 GitHub Secret——不要写代码
3. ✅ publish 失败要人工介入——自动回滚没意义（npm 不支持）
4. ✅ publisher 脚本独立仓库 DefinitelyTyped-tools
5. ✅ Microsoft 持有 `@types/*` scope 的 npm publish 权限

### 19. dependabot CVE 监控（每周自动 PR）

**问题场景**：DT 8000+ 包都可能引入 CVE。DT 用 **dependabot** 自动扫 `@types/*` 的依赖，每周开 PR 升级有漏洞的包。

**解决方案**：
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/types/foo"  # 每周扫每个 type 包的 package.json
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    labels:
      - "dependency"
    ignore:
      - dependency-name: "csstype"
        versions: ["3.x"]
```

dependabot 自动开 PR：
```
[dependabot] Bump csstype from 3.0.2 to 3.1.0 in /types/react
- Bumps [csstype](https://github.com/csstype/csstype) from 3.0.2 to 3.1.0.

Changes:
  3.1.0
  - Add `Property` type union

Commits:
  - feat: add Property type

Signed-off-by: dependabot[bot] <support@dependabot.com>
```

**关键参数**：

| 配置 | 用途 |
|---|---|
| `package-ecosystem: npm` | 扫 npm 依赖 |
| `directory: /types/foo` | 单一包或 `/` 全量 |
| `interval: weekly` | 每周一跑 |
| `open-pull-requests-limit: 5` | 最多 5 个并发 PR |
| `ignore: { dependency-name: csstype }` | 忽略特定包 |

**最佳实践**：
1. ✅ dependabot PR merge 到 `main`——不要 fork
2. ✅ 升级前先看 changelog——不要盲升
3. ✅ `ignore` 字段排除不兼容升级
4. ✅ DT 8000+ 包每周共 100+ dependabot PR
5. ✅ CI 自动跑 dtslint 验证升级

### 20. blobless clone 浅克隆（1.6GB → 几百 MB）

**问题场景**：DT 仓库 1.6GB，1 万贡献者每天克隆会把 GitHub 拖垮。DT 文档要求**必须用 blobless clone**——只下 metadata，blob 按需 fetch。

**解决方案**：
```bash
# ❌ 全量克隆（1.6GB + 几小时）
git clone https://github.com/DefinitelyTyped/DefinitelyTyped.git

# ✅ blobless clone（几百 MB + 几分钟）
git clone --filter=blob:none https://github.com/DefinitelyTyped/DefinitelyTyped.git dt
cd dt
git checkout main  # 此时按需下载

# ✅ sparse checkout（只下特定包）
git clone --filter=blob:none --sparse https://github.com/DefinitelyTyped/DefinitelyTyped.git dt
cd dt
git sparse-checkout set types/react types/jest types/lodash
```

git config 优化：
```bash
# 启用 partial clone + fsmonitor
git config --global feature.manyFiles true
git config --global core.fsmonitor true
git config --global protocol.version 2
```

**关键参数**：

| 参数 | 效果 |
|---|---|
| `--filter=blob:none` | 不下文件 blob（按需 fetch） |
| `--depth=1` | 不要历史 |
| `--sparse` | sparse-checkout 模式 |
| `--filter=blob:limit=1m` | 只下 1MB 以下文件 |

**最佳实践**：
1. ✅ **永远** `--filter=blob:none`——这是 DT 强制推荐
2. ✅ `--sparse` + `sparse-checkout set types/foo` 减少磁盘 99%
3. ✅ 提交后用 `git fetch --filter=blob:none` 增量更新
4. ✅ Windows + WSL 2 是最佳开发环境
5. ✅ git worktree **不工作**——DT 故意放弃兼容性

**标签**：#DefinitelyTyped #TypeScript #monorepo #类型定义
**状态**：20/20 份详细内容
