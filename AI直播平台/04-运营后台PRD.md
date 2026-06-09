---
title: 运营后台 PRD
tags: [运营后台, 合规, 网信办, 备案, 管理后台]
created: 2026-06-06
status: 规划中
---

# 运营后台 · 产品需求文档 (PRD)

## 1. 角色与权限

### 1.1 角色树
```
超级管理员
├── 运营总监 (查看所有 + 报表导出)
├── 内容审核员 (肖像/直播审核)
├── 客服主管 (订单/退款处理)
├── 财务 (账单/对账/发票)
├── 客服 (订单查询/工单)
├── 合规专员 (备案材料/审计)
└── 技术运维 (系统监控/配置)
```

### 1.2 权限矩阵
| 功能 | 超管 | 运营总监 | 审核员 | 客服主管 | 财务 | 合规 |
|---|---|---|---|---|---|---|
| 用户管理 | ✅ | 👁 | ❌ | 👁 | ❌ | 👁 |
| 肖像审核 | ✅ | ❌ | ✅ | ❌ | ❌ | 👁 |
| 数字人上下架 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 订单管理 | ✅ | 👁 | ❌ | ✅ | 👁 | ❌ |
| 退款审核 | ✅ | ❌ | ❌ | ✅ | 👁 | ❌ |
| 财务对账 | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 合规导出 | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 系统配置 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

✅=完全权限 👁=只读 ❌=无权限

## 2. 核心功能模块

### 2.1 审核中心

#### 2.1.1 肖像确权审核
- 审核队列 (按提交时间/风险等级)
- 单条审核 (查看视频 + 7 项检测结果 + 人工判定)
- 批量审核 (低风险自动通过)
- 申诉处理 (用户异议)
- 统计：日审核量/通过率/平均时长/驳回原因分布

#### 2.1.2 直播内容审核
- 实时弹幕监控 (关键词告警)
- 录像抽检 (10% 抽样)
- 违规处置 (警告/封禁/上报)
- 黑名单管理

#### 2.1.3 数字人审核
- 私人定制形象质量评分
- 平台预制形象上线审核
- 风格/合规性检查 (无暴力/色情/政治敏感)

### 2.2 数字人管理

#### 2.2.1 预制形象管理
- 上下架 (含定时发布)
- 分类/标签/排序
- 价格调整 (含历史价)
- 推荐位管理
- 库存监控

#### 2.2.2 训练任务监控
- 实时队列 (等待/训练中/完成/失败)
- GPU 资源池监控
- 失败任务人工介入
- 训练时长统计 (P50/P95/P99)

#### 2.2.3 版权管理
- 形象版权登记
- 授权使用记录
- 侵权检测 (跨平台)

### 2.3 订单与财务

#### 2.3.1 订单管理
- 全量订单查询 (按用户/时间/类型/状态)
- 订单详情 (含支付/退款/发票)
- 异常订单处理
- 订单导出 (Excel/CSV)

#### 2.3.2 退款审核
- 退款申请列表
- 自动审核规则 (如 7 天内未使用 + < 100 元 → 自动通过)
- 人工审核 (复杂场景)
- 退款原因分析

#### 2.3.3 财务对账
- 日账单 (与第三方支付对账)
- 月账单 (营收/退款/手续费/税费)
- 平台分成 (数字人作者分成)
- 发票管理 (申请/开具/作废)

#### 2.3.4 充值管理
- 余额充值
- 套餐订阅管理
- 自动续费
- 续费失败告警

### 2.4 数据统计

#### 2.4.1 用户分析
- DAU/MAU/留存 (1/7/30 天)
- 新增/活跃/付费用户
- 用户画像 (地域/年龄/设备)
- 行为路径漏斗

#### 2.4.2 业务分析
- GMV/订单数/客单价
- 数字人销量排行
- 直播效果排行
- 平台分布 (抖音/快手/TikTok)

#### 2.4.3 收入分析
- 营收 (按套餐/平台/数字人)
- 退款率/坏账率
- 成本 (GPU/带宽/存储)
- 利润 (毛利/净利)

### 2.5 系统配置

#### 2.5.1 基础配置
- 服务参数 (TTS/数字人/直播)
- 价格管理 (可视化编辑)
- 套餐配置 (月/季/年)
- 优惠活动 (满减/折扣/优惠券)

#### 2.5.2 平台配置
- 5 大平台 API 凭证
- 推流地址模板
- 商品库映射
- 限流规则

#### 2.5.3 风控规则
- 反作弊规则 (注册/登录/支付)
- 敏感词库 (三级: 警告/拦截/上报)
- 设备指纹黑名单
- IP 黑白名单

## 3. 合规资质管理

### 3.1 网信办深度合成备案

**备案材料包** (一键导出 ZIP)：
```
/备案包_2026Q2/
├── 算法备案信息表.pdf
├── 算法安全评估报告.pdf
├── 训练数据来源证明.pdf
├── 用户协议.pdf
├── 隐私政策.pdf
├── 肖像确权流程说明.pdf
├── 人工审核制度.pdf
├── 应急处置预案.pdf
├── 关键词库清单.xlsx
├── 历史投诉处理记录.xlsx
├── 数据安全评估报告.pdf
└── 算法解释说明.pdf
```

### 3.2 ICP 经营许可证
- 域名备案信息
- 经营场所证明
- 股东信息
- 财务报表

### 3.3 增值电信业务许可证
- ICP 证
- EDI 证 (在线数据处理)
- 呼叫中心许可证 (如需)

### 3.4 跨境数据合规 (TikTok)
- 数据本地化存储证明
- 个人信息出境标准合同
- 数据保护影响评估 (DPIA)
- 用户单独同意记录

### 3.5 监管对接
- 网信办 API (深度合成内容标识)
- 公安网监 API (实名认证/日志留存)
- 工商 API (营业执照核验)
- 税务 API (发票开具)

## 4. 关键表设计

```sql
-- 管理员
CREATE TABLE admin_users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    real_name VARCHAR(50),
    email VARCHAR(100),
    phone VARCHAR(20),
    role_id INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    two_factor_secret VARCHAR(50),
    last_login_at TIMESTAMP,
    last_login_ip INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 角色权限
CREATE TABLE admin_roles (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    permissions JSONB NOT NULL,            -- 权限树
    description TEXT
);

-- 敏感词库
CREATE TABLE sensitive_words (
    id BIGSERIAL PRIMARY KEY,
    word VARCHAR(100) NOT NULL,
    category VARCHAR(20),                  -- warning/block/report
    level INTEGER,                         -- 1-3
    source VARCHAR(50),                    -- 来源 (网信办/工商/自定义)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 审计日志 (3 年保留)
CREATE TABLE admin_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    admin_id INTEGER NOT NULL,
    action VARCHAR(50) NOT NULL,           -- create/update/delete/export/approve/reject
    resource_type VARCHAR(50),             -- user/order/portrait/digital_human
    resource_id BIGINT,
    before_value JSONB,
    after_value JSONB,
    ip INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_admin ON admin_audit_logs(admin_id);
CREATE INDEX idx_audit_resource ON admin_audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_created ON admin_audit_logs(created_at);
```

## 5. API 设计 (精选)

```
GET    /api/v1/admin/dashboard           # 工作台首页
GET    /api/v1/admin/portrait/queue      # 肖像审核队列
POST   /api/v1/admin/portrait/approve    # 肖像审核通过
POST   /api/v1/admin/portrait/reject     # 肖像审核拒绝
GET    /api/v1/admin/digital-human/list  # 数字人列表
POST   /api/v1/admin/digital-human/list  # 数字人上架
GET    /api/v1/admin/orders              # 订单列表
POST   /api/v1/admin/refund/approve      # 退款审核
GET    /api/v1/admin/stats/overview      # 总览数据
GET    /api/v1/admin/stats/revenue       # 营收数据
GET    /api/v1/admin/sensitive-words     # 敏感词列表
POST   /api/v1/admin/sensitive-words     # 新增敏感词
POST   /api/v1/admin/compliance/export   # 合规材料包导出
GET    /api/v1/admin/audit-logs          # 审计日志
```

## 6. 性能指标

| 指标 | 目标 |
|---|---|
| 页面加载 | ≤ 2s |
| 数据查询 | ≤ 3s (百万级) |
| 报表导出 | ≤ 30s (10 万行) |
| 审核操作响应 | ≤ 1s |
| 审计日志保留 | 3 年 |
| 并发管理员 | 100 人 |
