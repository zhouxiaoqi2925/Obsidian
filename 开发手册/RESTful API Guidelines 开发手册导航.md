---
created: '2026-05-31'
source: github.com/zalando/restful-api-guidelines
tags:
  - restful
  - api-design
  - 规范
title: RESTful API Guidelines 开发手册导航
---
# RESTful API Guidelines 知识库

**来源**：https://github.com/zalando/restful-api-guidelines
**整理时间**：2026-05-31
**数量**：20份核心知识

---

## 目录

| # | 知识主题 |
|---|----------|
| 1 | [[RAG - API 设计原则]] |
| 2 | [[RAG - HTTP 方法与状态码]] |
| 3 | [[RAG - URL 设计规范]] |
| 4 | [[RAG - 请求响应格式]] |

---

## 一、API 设计原则 (20份)

### 第一章：基础规范

1. **API 设计原则**
   - 以资源为中心
   - 一致性优先
   - 可发现性
   - 向下兼容

2. **API 版本管理**
   - URL 路径版本
   - Header 版本
   - 版本兼容性策略
   - 废弃流程

3. **URL 设计**
   - 路径结构
   - 命名约定
   - 复数名词
   - 嵌套资源

4. **查询参数**
   - 分页参数
   - 排序参数
   - 过滤参数
   - 字段筛选

### 第二章：HTTP 规范

5. **HTTP 方法**
   - GET/POST/PUT/PATCH/DELETE
   - 幂等性保证
   - 安全性保证
   - 方法选择指南

6. **状态码**
   - 2xx 成功
   - 3xx 重定向
   - 4xx 客户端错误
   - 5xx 服务端错误
   - 自定义状态码

7. **Headers**
   - Content-Type
   - Authorization
   - 自定义 Headers
   - CORS Headers

8. **缓存策略**
   - ETag
   - Last-Modified
   - Cache-Control
   - 条件请求

### 第三章：数据格式

9. **JSON 规范**
   - 属性命名
   - 日期格式 (ISO 8601)
   - 空值处理
   - 数字精度

10. **错误响应**
    - 错误格式统一
    - 错误码设计
    - 错误消息
    - 错误链路追踪

11. **分页响应**
    - 游标分页
    - 偏移分页
    - 分页元数据
    - 总数统计

12. **元数据**
    - 响应元数据
    - 请求跟踪
    - 限流信息
    - 速率限制

### 第四章：安全与性能

13. **认证授权**
    - API Key
    - OAuth 2.0
    - JWT
    - 权限模型

14. **限流策略**
    - 限流维度
    - 限流响应
    - 重试策略
    - 配额管理

15. **CORS 配置**
    - 跨域请求
    - 预检请求
    - 允许源
    - 暴露 Headers

16. **压缩与传输**
    - Gzip 压缩
    - 分块传输
    - 断点续传
    - 多部分上传

### 第五章：文档与测试

17. **API 文档**
    - OpenAPI/Swagger
    - 文档内容
    - 示例请求
    - 错误场景

18. **SDK 设计**
    - SDK 结构
    - 错误处理
    - 重试机制
    - 超时配置

19. **API 测试**
    - 单元测试
    - 集成测试
    - Contract Testing
    - 冒烟测试

20. **监控与告警**
    - 请求监控
    - 性能指标
    - 错误率告警
    - 可用性监控

---

## 二、高级主题 (将后续整理)

- GraphQL vs REST
- WebSocket
- gRPC
- API Gateway

---

**标签**：#restful #api-design #zalando
**状态**：20/20 份
**待续**：高级主题 10份
