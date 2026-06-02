---
title: SRS 闪记卡 - 软件架构
tags: [SRS, 闪记卡, 软件架构]
date: 2026-06-01
---

# SRS 闪记卡 - 软件架构

> 复习软件架构核心概念。按 Spaced Repetition 插件语法编写。

## 5 种架构模式

5 种主流软件架构模式是::单体架构、微服务架构、客户端-服务器、分层架构(N-tier)、事件驱动架构

单体架构的核心特征是::单一容器部署，所有功能在一个进程中

微服务架构的核心特征是::多个独立服务，通过 API 通信，独立部署和扩展

分层架构(N-tier) 通常分为几层::4 层（表现层、业务层、应用层、数据层）

事件驱动架构的核心特征是::通过事件触发，松耦合，适合实时处理

## SOLID 原则

SOLID 中 S 代表::单一职责原则 (Single Responsibility Principle)

SOLID 中 O 代表::开闭原则 (Open/Closed Principle)，对扩展开放，对修改关闭

SOLID 中 L 代表::里氏替换原则 (Liskov Substitution Principle)，子类可替换父类

SOLID 中 I 代表::接口隔离原则 (Interface Segregation Principle)，接口小而专

SOLID 中 D 代表::依赖反转原则 (Dependency Inversion Principle)，依赖抽象而非具体实现

## 架构选型

复杂度低的应用适合::单体架构

企业级电商系统适合::分层架构 (N-tier)

现代云原生应用适合::微服务架构

实时流处理系统适合::事件驱动架构

## 工具

UML 的 4+1 视图模型中"4"指::逻辑视图、过程视图、物理视图、开发视图

C4 模型的 4 个层级是::Context、Container、Component、Code

#flashcard
软件架构的 4 个核心质量属性是::
?
可扩展性、可维护性、可复用性、安全性

#flashcard
为什么微服务比单体更复杂却仍被广泛采用::
?
独立部署、技术异构、故障隔离、团队自治

#flashcard
SOLID 中的依赖反转原则的核心思想::
?
高层模块不应依赖低层模块，两者都应依赖抽象；抽象不应依赖细节，细节应依赖抽象

## 使用方法

1. 安装 Spaced Repetition 插件
2. 打开本笔记
3. 插件会自动识别 `::` 闪记语法
4. 每天复习，间隔重复算法自动安排时间
