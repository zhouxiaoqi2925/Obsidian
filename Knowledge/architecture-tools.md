---
title: 架构建模工具
date: 2026-05-31
tags: [建模工具, 开发工具]
---

# 架构建模工具

## 工具分类

### 1. UML建模工具

#### StarUML
- **平台**: Windows / Mac / Linux
- **特点**: 开源、支持逆向工程、插件丰富
- **适合**: 个人开发者和小型团队
- **费用**: 免费 (GPL) / 付费版

#### Visual Paradigm
- **平台**: Windows / Mac / Linux
- **特点**: 企业级、代码生成、团队协作
- **适合**: 大型项目和团队
- **费用**: 付费 (有免费版限制)

#### Enterprise Architect (EA)
- **平台**: Windows
- **特点**: 专业级、复杂系统建模
- **适合**: 大型企业、复杂架构
- **费用**: 付费

### 2. 在线协作工具

#### draw.io (diagrams.net)
- **特点**: 免费、直观、支持离线、导出多格式
- **适合**: 快速草图和团队协作
- **网址**: draw.io

#### Lucidchart
- **特点**: 协作友好、模板丰富
- **适合**: 团队设计和评审
- **费用**: 免费版 / 付费版

#### Mermaid Live Editor
- **特点**: 代码生成图、GitHub集成
- **适合**: 技术文档内嵌图
- **网址**: mermaid.live

### 3. 代码生成工具

#### PlantUML
- **特点**: 代码生成UML图、版本控制友好
- **支持**: 类图、时序图、用例图、活动图
- **集成**: VS Code、IntelliJ、GitHub

#### Structurizr
- **特点**: C4模型（Context, Container, Component, Code）
- **适合**: 软件架构可视化
- **支持**: DSL定义架构

### 4. 架构建模专用

#### C4 Model
**核心理念**：4个层级的架构视图

| 层级 | 描述 | 受众 |
|------|------|------|
| **Context** | 系统全景、用户、交互系统 | 所有人 |
| **Container** | 应用和技术选择 | 开发/架构师 |
| **Component** | 容器内的组件 | 开发人员 |
| **Code** | 详细代码结构 | 开发人员 |

```markdown
## C4 Model 示例

### Level 1: Context (系统全景)
[用户] --> [电商系统] --> [支付网关]
                     --> [物流API]

### Level 2: Container (应用容器)
[Web App] --> [API Gateway] --> [订单服务]
                              --> [用户服务]
                              --> [商品服务]

### Level 3: Component (组件)
[API Gateway] --> [Auth组件]
               --> [RateLimit组件]
               --> [Router组件]
```

#### Structurizr DSL

```java
workspace {
    model {
        user = person "用户" "使用电商系统购物"
        system = softwareSystem "电商系统" "提供在线购物服务"
        
        user -> system "浏览商品、下单、支付"
    }
    
    views {
        systemContext system "context" "系统全景"
        component system "components" "组件图"
    }
}
```

## 工具选择指南

| 场景 | 推荐工具 |
|------|----------|
| 快速草图 | draw.io |
| 技术文档图 | Mermaid / PlantUML |
| 正式设计 | StarUML / Visual Paradigm |
| 团队协作 | Lucidchart / draw.io |
| 企业架构 | Enterprise Architect |
| C4架构 | Structurizr |

## 架构建模最佳实践

### 1. 从高层到细节

```
Context → Container → Component → Code
(概览)    (应用)     (组件)     (代码)
```

### 2. 选择合适的视图

| 目标 | 视图 |
|------|------|
| 沟通系统范围 | Context 图 |
| 说明技术选型 | Container 图 |
| 指导开发 | Component 图 |
| 代码实现 | 类图/时序图 |

### 3. 保持模型同步

- 代码变更时更新模型
- 定期评审架构图
- 使用版本控制管理图文件

### 4. 团队约定

- 统一图表风格和符号
- 约定命名规范
- 建立图表模板库

## 集成开发环境 (IDE) 插件

| IDE | UML插件 |
|-----|---------|
| VS Code | PlantUML, Mermaid, Draw.io |
| IntelliJ | PlantUML, YEd, UML Support |
| Eclipse | Papyrus, PlantUML |
| WebStorm | PlantUML, Mermaid |

## 相关文档

- [[UML建模指南]] - UML详解
- [[软件架构导论]] - 基础概念