"""
DeepSeek AI 笔记生成器 - 本地服务
访问 http://localhost:3847 使用
"""
import http.server
import socketserver
import json
import urllib.request
import urllib.error
import os
from datetime import datetime

PORT = 3847
API_KEY = "sk-e6a62d4c92224761abb59a339f1896ca"
API_URL = "https://api.deepseek.com/chat/completions"
REST_KEY = "8b64de8e96add01b70a97a197c20622f5021300653878eb145e2d3db72f0eb74"
REST_URL = "https://127.0.0.1:27124"

HTML = """<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>DeepSeek AI 笔记生成器</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:system-ui,-apple-system,sans-serif; background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%); color:#eee; min-height:100vh; padding:20px; }
.container { max-width:720px; margin:0 auto; }
h1 { text-align:center; color:#4a9eff; font-size:28px; margin:20px 0; }
h1 span { font-size:32px; }
.card { background:#0f3460; border-radius:16px; padding:24px; margin-bottom:16px; box-shadow:0 8px 32px rgba(0,0,0,0.3); }
.card h2 { font-size:16px; color:#4a9eff; margin-bottom:12px; }
textarea { width:100%; background:#1a1a2e; border:1px solid #333; border-radius:10px; padding:14px; color:#ddd; font-size:14px; line-height:1.6; resize:vertical; min-height:140px; outline:none; transition:border 0.2s; }
textarea:focus { border-color:#4a9eff; box-shadow:0 0 0 3px rgba(74,158,255,0.15); }
textarea::placeholder { color:#555; }
.btn { display:inline-flex; align-items:center; gap:6px; padding:12px 28px; border-radius:10px; border:none; font-size:15px; cursor:pointer; transition:all 0.2s; font-weight:600; }
.btn-primary { background:#4a9eff; color:#fff; }
.btn-primary:hover { background:#3a8eef; box-shadow:0 4px 16px rgba(74,158,255,0.4); }
.btn-primary:disabled { opacity:0.5; cursor:not-allowed; }
.btn-secondary { background:#333; color:#aaa; }
.btn-secondary:hover { background:#444; }
.actions { display:flex; gap:10px; margin-top:14px; }
.tips { font-size:12px; color:#555; margin-top:8px; }
.result { background:#1a1a2e; border-radius:10px; padding:16px; margin-top:16px; font-size:14px; line-height:1.8; white-space:pre-wrap; word-break:break-word; max-height:500px; overflow-y:auto; border:1px solid #333; color:#ccc; }
.result:empty { color:#555; font-style:italic; text-align:center; padding:40px; }
.status { margin-top:10px; font-size:13px; color:#4a9eff; text-align:center; min-height:20px; }
.status.error { color:#ff6b6b; }
.status.success { color:#51cf66; }
.loading { display:inline-block; width:16px;height:16px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 0.7s linear infinite; }
@keyframes spin { to{transform:rotate(360deg)} }
.quick-btns { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
.quick-btn { padding:6px 14px; background:#1a1a2e; border:1px solid #333; border-radius:20px; color:#888; font-size:12px; cursor:pointer; transition:all 0.2s; }
.quick-btn:hover { border-color:#4a9eff; color:#4a9eff; background:rgba(74,158,255,0.1); }
</style>
</head>
<body>
<div class="container">
  <h1><span>🤖</span> DeepSeek 笔记生成器</h1>

  <div class="card">
    <h2>📝 提示词</h2>
    <div class="quick-btns">
      <button class="quick-btn" onclick="setPrompt('整理一份 [主题] 学习笔记，包含核心概念、实战案例、常见问题')">📚 学习笔记</button>
      <button class="quick-btn" onclick="setPrompt('写一份 [主题] 项目总结，包含背景、进展、问题、下一步')">📋 项目总结</button>
      <button class="quick-btn" onclick="setPrompt('制定 [主题] 周报，包含本周完成、下周计划、风险评估')">📅 周报</button>
      <button class="quick-btn" onclick="setPrompt('整理 [主题] 的竞品分析，包含功能对比、优劣势、定价策略')">🔍 竞品分析</button>
    </div>
    <textarea id="prompt" placeholder="输入你想生成的内容，例如：&#10;整理一份 React 完整学习路线图，包含基础入门、进阶、源码解析、实战项目&#10;&#10;或直接点击上面的快捷按钮选择模板"></textarea>
    <div class="tips">💡 Ctrl+Enter 快速生成 | 自动保存到 Obsidian</div>
    <div class="actions">
      <button class="btn btn-primary" id="genBtn" onclick="generate()">🚀 开始生成</button>
      <button class="btn btn-secondary" onclick="clearAll()">清空</button>
    </div>
    <div id="status" class="status"></div>
  </div>

  <div class="card" id="resultCard" style="display:none;">
    <h2>📄 生成结果</h2>
    <div class="result" id="result"></div>
    <div class="actions">
      <button class="btn btn-primary" onclick="saveToObsidian()">💾 保存到 Obsidian</button>
      <button class="btn btn-secondary" onclick="copyText()">📋 复制</button>
    </div>
  </div>
</div>

<script>
const API_KEY = "%API_KEY%";
const REST_KEY = "%REST_KEY%";
const REST_URL = "%REST_URL%";
let genText = "";

function setStatus(msg, type="") {
  document.getElementById("status").textContent = msg;
  document.getElementById("status").className = "status " + type;
}

function setPrompt(t) { document.getElementById("prompt").value = t; }

function clearAll() {
  document.getElementById("prompt").value = "";
  document.getElementById("resultCard").style.display = "none";
  document.getElementById("status").textContent = "";
  genText = "";
}

async function generate() {
  const prompt = document.getElementById("prompt").value.trim();
  if (!prompt) { setStatus("请输入提示词", "error"); return; }
  const btn = document.getElementById("genBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> 生成中...';
  setStatus("DeepSeek 思考中...");

  try {
    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization":"Bearer " + API_KEY },
      body: JSON.stringify({ model:"deepseek-chat", messages:[{role:"user",content:prompt}], stream:false, max_tokens:3000, temperature:0.7 })
    });
    if (!resp.ok) {
      const e = await resp.json().catch(()=>({}));
      throw new Error(e?.error?.message || "HTTP " + resp.status);
    }
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("生成结果为空");
    genText = text;
    document.getElementById("result").textContent = text;
    document.getElementById("resultCard").style.display = "block";
    setStatus("生成完成！", "success");
    // 自动保存
    await saveToObsidian(true);
  } catch(e) {
    setStatus("错误: " + e.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = "🚀 开始生成";
  }
}

async function saveToObsidian(silent) {
  if (!genText) return;
  const now = new Date().toLocaleString("zh-CN");
  const prompt = document.getElementById("prompt").value.trim();
  const content = "# DeepSeek 生成记录\\n\\n**时间**: " + now + "\\n\\n## 提示词\\n" + prompt + "\\n\\n## 生成内容\\n" + genText;
  const filename = "DeepSeek_" + now.replace(/[/:\\s]/g, "-").replace(",", "") + ".md";
  try {
    setStatus("保存到 Obsidian...");
    const resp = await fetch(REST_URL + "/vault/" + encodeURIComponent(filename), {
      method: "PUT",
      headers: { "Authorization":"Bearer " + REST_KEY, "Content-Type":"application/json" },
      body: JSON.stringify({ content: content })
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    if (!silent) setStatus("已保存: " + filename, "success");
  } catch(e) {
    if (!silent) setStatus("保存失败: " + e.message, "error");
  }
}

function copyText() {
  if (!genText) return;
  navigator.clipboard.writeText(genText).then(() => setStatus("已复制！", "success"))
    .catch(() => setStatus("复制失败", "error"));
}

document.getElementById("prompt").addEventListener("keydown", e => {
  if (e.key === "Enter" && e.ctrlKey) generate();
});
</script>
</body>
</html>"""

HTML = HTML.replace("%API_KEY%", API_KEY).replace("%REST_KEY%", REST_KEY).replace("%REST_URL%", REST_URL)

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self.send_response(200)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML.encode("utf-8"))
        else:
            super().do_GET()

    def log_message(self, format, *args):
        pass  # 静默日志

print(f"✅ DeepSeek 笔记生成器已启动")
print(f"📍 访问地址: http://localhost:{PORT}")
print(f"💾 生成内容自动保存到 Obsidian")
print(f"按 Ctrl+C 停止服务")
print()

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.allow_reuse_address = True
    httpd.serve_forever()
