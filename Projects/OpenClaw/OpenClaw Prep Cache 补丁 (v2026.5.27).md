---
type: project-note
status: deployed
created: 2026-06-05T00:00:00.000Z
gateway: openclaw
gateway_version: 2026.5.27
gateway_pid: 16064
gateway_port: 18802
title: OpenClaw Prep Cache 补丁 (v2026.5.27)
---

# OpenClaw Prep Cache 性能补丁

## 背景
OpenClaw 每次收到新消息都要走一遍完整的 prep stage（core-plugin-tools 11s + system-prompt 16-37s = 总 27-48s 冷启动开销）。
通过 memoize 同一 (session, agent, model, channel, sender, workspace, skills, tools, exec, config) tuple 的输出，把重复请求的 prep 时间降到个位数 ms。

## 修改文件
- `G:\tk-ecommerce-workspace\.openclaw\npm\node_modules\@tencent-weixin\openclaw-weixin\node_modules\openclaw\dist\selection-C4e-Qn9W.js`
  - 第 10305-10383 行：插入 prep-cache 模块
  - 第 14467-14556 行：包裹 `createOpenClawCodingTools`
  - 第 14988-14989 行：包裹 `buildAttemptSystemPrompt`（用 `??` 短路 + 缓存 store）
- `G:\tk-ecommerce-workspace\.openclaw\gateway.cmd`
  - 末尾添加 3 行 env vars

## 缓存键
```
${sessionKey}|${agentId}|${provider}|${modelId}|${messageChannel}|${senderId}|${workspace}|${skillsSig}|${toolsAllowSig}|${execOverridesSig}|${configSig}
```

## 配置（env vars）
- `OPENCLAW_PREP_CACHE=1` — 总开关
- `OPENCLAW_PREP_CACHE_TTL_MS=300000` — 默认 5 分钟
- `OPENCLAW_PREP_CACHE_MAX_ENTRIES=64` — LRU 上限

## 状态
- ✅ 补丁写入完成（`node --check` 语法通过）
- ✅ Gateway 重启成功，PID 16064，端口 18802，dashboard 200 OK
- ⏳ 待用户实际聊天验证 cache hit 时的 prep 时间下降

## 已知限制
- 单进程内存缓存，重启清空
- `selection-C4e-Qn9W.js` 是 bundle 文件，OpenClaw 升级会覆盖（需重新打补丁）
- cosmetic 4-tab vs 3-tab 缩进差异（JS 不影响，但 grep 时可能干扰）
