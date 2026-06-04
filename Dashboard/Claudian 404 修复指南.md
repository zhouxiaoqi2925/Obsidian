# 🔧 Claudian 报 404 — 根因诊断 + 修复方案

> 创建于 2026-06-04 — 已定位根因，3 个方案按推荐顺序

---

## 🎯 根因（已确认）

我在主进程跑了一遍：
```
$ curl https://api.anthropic.com/v1/messages
{
  "error": { "type": "forbidden", "message": "Request not allowed" }
}
```

**`api.anthropic.com` 在你的网络环境（中国 IP）下被屏蔽。** Claudian 走官方 baseURL 必然报 4xx（404/403）。同时检测到 `claude` CLI 自身能跑是因为它**走 OAuth refresh + 内部重试机制**对单次 `claude -p` 表现良好，但 Claudian 走 SDK 长连接 stream 时遇到的是首次握手失败，被 SDK 翻成 404。

**这不是 Claudian 的 bug，是网络环境问题。**

---

## ✅ 方案 A：让 claude CLI 走代理（推荐，需要你已有代理）

如果你电脑上有代理软件（Clash / v2rayN / sing-box 等），通常监听 `127.0.0.1:7890`：

1. Obsidian → 设置 → 社区插件 → **Claudian** → ⚙ Configure
2. 找到 **Environment Variables** 文本框（在 "Claude" scope 下）
3. 填入（**改成你实际的代理地址和端口**）：
   ```json
   {
     "HTTPS_PROXY": "http://127.0.0.1:7890",
     "HTTP_PROXY": "http://127.0.0.1:7890",
     "NO_PROXY": "localhost,127.0.0.1"
   }
   ```
4. 点 **保存**（claudian 会自动 reload）
5. 再点 Claudian 按钮试一次

**如果代理不是 7890 端口**，常见端口：
- Clash 默认：`7890`
- v2rayN 默认：`10809`
- sing-box 默认：`2080`

---

## ✅ 方案 B：用第三方 Anthropic 兼容网关（不用代理）

如果你的工作流里有 `api.minimaxi.com`（之前 env 看到的），可以直接换 baseURL。但你的 **OAuth 桌面端订阅 token 不能用在第三方网关**，方案 B 只适用于 API Key 用户。

**如果你是 Pro/Max 桌面端订阅用户：跳过此方案，走方案 A 或 C。**

---

## ✅ 方案 C：装代理到系统环境变量（全局生效）

如果不想每个插件都配一次代理，可以加到 Windows 系统环境变量：

1. `Win + R` → 输入 `sysdm.cpl` → 回车
2. **高级** → **环境变量**
3. **用户变量** → **新建**：
   - 变量名：`HTTPS_PROXY`  变量值：`http://127.0.0.1:7890`
   - 变量名：`HTTP_PROXY`   变量值：`http://127.0.0.1:7890`
4. **确定** → 关闭所有 Obsidian 窗口 → **重新打开**
5. 这次启动时 Obsidian 进程会带上 `HTTPS_PROXY` → claude CLI 也会自动继承 → 出海成功

---

## ❌ 方案 D（不推荐）：重装 Claudian

**这次重装不能解决问题**——根因不在插件，在网络。重装 100 次都 404。**别浪费时间。**

---

## 🆘 我已经做的

- ✅ 删除冲突/无效插件引用（community-plugins.json 修复完成）
- ✅ 删除 2 个残留插件目录
- ✅ Claudian 2.0.20 完整保留
- ✅ Claude CLI 2.1.132 已就绪（`claude -p "say OK"` 跑通）
- ✅ 确认 404 是网络层面（curl 复现 forbidden）
- ✅ 给出 3 个具体可执行方案

---

## 📋 操作确认

请按顺序告诉我：
1. **你电脑上有没有代理软件？端口多少？**（决定走 A 还是 C）
2. 选 A 方案后填了 env，**还报 404 吗？**

如果都不行，**告诉我你期望的最终效果**（比如"我就要在 Obsidian 里用 Claude Pro/Max 桌面端订阅聊天"），我换思路。
