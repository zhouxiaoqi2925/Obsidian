"""
DeepSeek AI 笔记生成器
访问 http://localhost:3847 使用
"""
import http.server
import socketserver
import json
import urllib.request
import urllib.error
from datetime import datetime

PORT = 3847
API_KEY = "sk-e6a62d4c92224761abb59a339f1896ca"
REST_KEY = "8b64de8e96add01b70a97a197c20622f5021300653878eb145e2d3db72f0eb74"
REST_URL = "https://127.0.0.1:27124"

HTML = """<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>DeepSeek 笔记生成器</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#1a1a2e;color:#eee;min-height:100vh;padding:20px}
.container{max-width:700px;margin:0 auto}
h1{text-align:center;color:#4a9eff;font-size:26px;margin:20px 0}
h1 span{font-size:30px}
.card{background:#0f3460;border-radius:14px;padding:24px;margin-bottom:16px;box-shadow:0 8px 32px rgba(0,0,0,0.3)}
.card h2{font-size:14px;color:#4a9eff;margin-bottom:10px}
textarea{width:100%;background:#1a1a2e;border:1px solid #333;border-radius:10px;padding:14px;color:#ddd;font-size:14px;line-height:1.6;resize:vertical;min-height:130px;outline:none;transition:border 0.2s}
textarea:focus{border-color:#4a9eff;box-shadow:0 0 0 3px rgba(74,158,255,0.15)}
textarea::placeholder{color:#555}
.btn{display:inline-flex;align-items:center;gap:6px;padding:11px 24px;border-radius:10px;border:none;font-size:14px;cursor:pointer;font-weight:600}
.btn-primary{background:#4a9eff;color:#fff}
.btn-primary:hover{background:#3a8eef}
.btn-primary:disabled{opacity:0.5;cursor:not-allowed}
.btn-ghost{background:#222;color:#aaa;border:1px solid #333;margin-left:8px}
.btn-ghost:hover{background:#333}
.actions{display:flex;gap:8px;margin-top:12px}
.tips{font-size:12px;color:#555;margin-top:8px}
.result{background:#1a1a2e;border-radius:10px;padding:16px;margin-top:12px;font-size:14px;line-height:1.8;white-space:pre-wrap;word-break:break-word;max-height:450px;overflow-y:auto;border:1px solid #333;color:#ddd}
.result:empty{color:#555;font-style:italic;text-align:center;padding:30px}
.status{margin-top:8px;font-size:13px;text-align:center;min-height:18px;color:#4a9eff}
.status.err{color:#ff6b6b}
.status.ok{color:#51cf66}
.loading{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.quick{flex-wrap:wrap;gap:6px;margin-bottom:10px;display:flex}
.quick-btn{padding:5px 12px;background:#1a1a2e;border:1px solid #333;border-radius:20px;color:#777;font-size:12px;cursor:pointer}
.quick-btn:hover{border-color:#4a9eff;color:#4a9eff}
</style>
</head>
<body>
<div class="container">
<h1><span>&#128640;</span> DeepSeek 笔记生成器</h1>

<div class="card">
<h2>&#128221; 提示词</h2>
<div class="quick">
<button class="quick-btn" onclick="setP('整理一份 [主题] 完整学习笔记，包含核心概念、实战案例、常见问题')">&#128218; 学习笔记</button>
<button class="quick-btn" onclick="setP('写一份 [主题] 项目总结，包含背景、进展、问题、下一步')">&#128203; 项目总结</button>
<button class="quick-btn" onclick="setP('制定 [主题] 周报，包含本周完成、下周计划、风险评估')">&#128197; 周报</button>
<button class="quick-btn" onclick="setP('整理 [主题] 竞品分析，包含功能对比、优劣势、定价')">&#128269; 竞品分析</button>
</div>
<textarea id="prompt" placeholder="输入你想生成的内容，例如：&#10;整理一份 Python 完整学习路线图..."></textarea>
<div class="tips">Ctrl+Enter 快速生成 | 自动保存到 Obsidian</div>
<div class="actions">
<button class="btn btn-primary" id="genBtn" onclick="gen()">&#128640; 开始生成</button>
<button class="btn btn-ghost" onclick="clearAll()">清空</button>
</div>
<div id="status" class="status"></div>
</div>

<div class="card" id="resultCard" style="display:none">
<h2>&#128196; 生成结果</h2>
<div class="result" id="result"></div>
<div class="actions">
<button class="btn btn-primary" onclick="save()">&#128190; 保存到 Obsidian</button>
<button class="btn btn-ghost" onclick="copy()">&#128203; 复制</button>
</div>
</div>
</div>
<script>
const API_KEY = "sk-e6a62d4c92224761abb59a339f1896ca";
const REST_KEY = "8b64de8e96add01b70a97a197c20622f5021300653878eb145e2d3db72f0eb74";
const REST = "https://127.0.0.1:27124";
let genText = "";
function S(msg,cls=""){document.getElementById("status").textContent=msg;document.getElementById("status").className="status "+cls}
function setP(t){document.getElementById("prompt").value=t}
function clearAll(){document.getElementById("prompt").value="";document.getElementById("resultCard").style.display="none";genText="";S("")}
async function gen(){
  const p=document.getElementById("prompt").value.trim();
  if(!p){S("请输入提示词","err");return}
  const b=document.getElementById("genBtn");
  b.disabled=true;b.innerHTML='<span class="loading"></span> 生成中...';S("DeepSeek思考中...");
  try{
    const r=await fetch("https://api.deepseek.com/chat/completions",{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+API_KEY},
      body:JSON.stringify({model:"deepseek-chat",messages:[{role:"user",content:p}],stream:false,max_tokens:3000,temperature:0.7})
    });
    if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e?.error?.message||"HTTP "+r.status)}
    const d=await r.json();
    const t=d?.choices?.[0]?.message?.content;
    if(!t)throw new Error("生成结果为空");
    genText=t;
    document.getElementById("result").textContent=t;
    document.getElementById("resultCard").style.display="block";
    S("生成完成，已自动保存","ok");
    await save(true);
  }catch(e){S("错误: "+e.message,"err")}
  finally{b.disabled=false;b.innerHTML="&#128640; 开始生成"}
}
async function save(silent){
  if(!genText)return;
  const now=new Date().toLocaleString("zh-CN");
  const p=document.getElementById("prompt").value.trim();
  const content="# DeepSeek 生成记录\n\n**时间**: "+now+"\n\n## 提示词\n"+p+"\n\n## 生成内容\n"+genText;
  const fname="DS_"+now.replace(/[\/\\s:]/g,"-").replace(",","")+".md";
  try{
    if(!silent)S("保存中...");
    const r=await fetch(REST+"/vault/"+encodeURIComponent(fname),{
      method:"PUT",
      headers:{"Authorization":"Bearer "+REST_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({content:content})
    });
    if(!r.ok)throw new Error("HTTP "+r.status);
    if(!silent)S("已保存: "+fname,"ok");
  }catch(e){if(!silent)S("保存失败: "+e.message,"err")}
}
function copy(){
  if(!genText)return;
  navigator.clipboard.writeText(genText).then(()=>S("已复制!","ok")).catch(()=>S("复制失败","err"));
}
document.getElementById("prompt").addEventListener("keydown",e=>{if(e.key==="Enter"&&e.ctrlKey)gen()});
</script>
</body>
</html>"""

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self.send_response(200)
            self.send_header("Content-type","text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML.encode("utf-8"))
        else:
            super().do_GET()
    def log_message(self, fmt, *args): pass

print("="*40)
print("  DeepSeek 笔记生成器")
print("="*40)
print(f"  访问地址: http://localhost:{PORT}")
print(f"  Obsidian: G:\\Obsidian Vault")
print("="*40)

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.allow_reuse_address = True
    print("\n  服务已启动，按 Ctrl+C 停止\n")
    httpd.serve_forever()
