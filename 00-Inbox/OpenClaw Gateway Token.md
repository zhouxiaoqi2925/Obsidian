---
tags:
  item:
    - openclaw
    - token
    - config
type: reference
title: OpenClaw Gateway Token
---
# OpenClaw Gateway Token

**生成时间**: 2026-06-05
**位置**: `G:\tk-ecommerce-workspace\.openclaw\openclaw.json` → `gateway.auth.token`
**明文副本**: `G:\tk-ecommerce-workspace\.openclaw\.gateway-token`

## Token 值

```
vCxOsyxWtp4ch7UZ562TAaZz8ybPm3W3uqis_vUtsws
```

## 使用说明

- Control UI 仪表盘登录时需要这个 token
- 浏览器打开 `http://127.0.0.1:18802` → 设置里粘贴
- 改完 `openclaw.json` 里的 token 后，gateway 会自动 SIGUSR1 重启
- 重启过程有约 60s 的 startup-sidecars 期间，WS 连接会返回 "gateway starting"

## 历史

- 原值是占位符 `your-secure-token-here`，导致 dashboard WS 收到 1008 unauthorized
- 这是用户说"回不了消息"的真正根因（不是冷启动）
- 真实冷启动时间 ~3-4 min，见 [[OpenClaw 冷启动优化]]
