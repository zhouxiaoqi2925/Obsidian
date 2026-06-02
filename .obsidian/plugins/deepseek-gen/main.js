var main_exports = {};
main_exports.default = function(app, manifest) {
    return new DeepSeekPlugin(app, manifest);
};
module.exports = main_exports;
module.exports.default = main_exports.default;

var API_KEY = "sk-e6a62d4c92224761abb59a339f1896ca";
var API_URL = "https://api.deepseek.com/chat/completions";
var MODEL = "deepseek-chat";

function DeepSeekPlugin(app, manifest) {
    this.app = app;
    this.manifest = manifest;
}

DeepSeekPlugin.prototype.onload = function() {
    var self = this;

    this.addCommand({
        id: "deepseek-generate",
        name: "DeepSeek: 生成内容",
        callback: function() {
            new GenModal(self.app, self).open();
        }
    });

    this.addCommand({
        id: "deepseek-summarize",
        name: "DeepSeek: 总结选中",
        editorCallback: function(editor) {
            var sel = editor.getSelection();
            if (!sel) { new self.app.Notice("请先选中内容"); return; }
            self.callAPI("请总结以下内容，简洁整理要点：\n\n" + sel, editor);
        }
    });

    this.addCommand({
        id: "deepseek-improve",
        name: "DeepSeek: 润色文字",
        editorCallback: function(editor) {
            var sel = editor.getSelection();
            if (!sel) { new self.app.Notice("请先选中内容"); return; }
            self.callAPI("请润色并改进以下文字，使其更流畅专业：\n\n" + sel, editor);
        }
    });

    this.addCommand({
        id: "deepseek-organize",
        name: "DeepSeek: 整理笔记",
        editorCallback: function(editor) {
            var content = editor.getValue();
            if (!content || content.trim().length < 30) {
                new self.app.Notice("笔记内容太少");
                return;
            }
            self.callAPI("请分析以下笔记内容，整理结构、优化格式、补充遗漏的要点：\n\n" + content, editor);
        }
    });

    this.addRibbonIcon("sparkles", "DeepSeek AI", function() {
        new GenModal(self.app, self).open();
    });

    new self.app.Notice("DeepSeek 插件已加载 | Ctrl+P 搜索 DeepSeek");
};

DeepSeekPlugin.prototype.onunload = function() {};

DeepSeekPlugin.prototype.callAPI = function(prompt, editor) {
    var self = this;
    new self.app.Notice("DeepSeek 思考中...");

    fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + API_KEY
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [{ role: "user", content: prompt }],
            stream: false,
            max_tokens: 3000,
            temperature: 0.7
        })
    }).then(function(resp) {
        if (!resp.ok) {
            return resp.json().then(function(d) {
                throw new Error(d && d.error && d.error.message ? d.error.message : "HTTP " + resp.status);
            }).catch(function(e) {
                throw new Error("HTTP " + resp.status);
            });
        }
        return resp.json();
    }).then(function(data) {
        var text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!text) throw new Error("生成结果为空");
        if (editor) {
            editor.replaceSelection("\n\n" + text + "\n\n");
        }
        new self.app.Notice("生成完成！");
    }).catch(function(e) {
        new self.app.Notice("错误: " + e.message);
    });
};

function GenModal(app, plugin) {
    this.app = app;
    this.plugin = plugin;
}

GenModal.prototype.onOpen = function() {
    var self = this;
    var c = this.contentEl;
    c.empty();

    var title = c.createEl("h2", { text: "DeepSeek AI" });
    title.style.cssText = "text-align:center;color:#4a9eff;margin-bottom:4px;";

    var sub = c.createEl("p", { text: "输入提示词，AI 生成内容插入当前笔记（Ctrl+Enter 提交）" });
    sub.style.cssText = "color:#888;font-size:13px;text-align:center;margin-bottom:12px;";

    var ta = c.createEl("textarea", {
        attr: { placeholder: "例如：整理一份 Git 使用规范，包含常用命令和最佳实践...", rows: "8" }
    });
    ta.style.cssText = "width:100%;box-sizing:border-box;padding:12px;font-size:14px;border-radius:8px;border:1px solid #ccc;resize:vertical;background:#fafafa;margin-bottom:10px;";

    var btnRow = c.createDiv();
    btnRow.style.cssText = "display:flex;gap:8px;";

    var genBtn = btnRow.createEl("button", { text: "开始生成" });
    genBtn.style.cssText = "flex:1;padding:10px;font-size:15px;border-radius:8px;border:none;background:#4a9eff;color:#fff;cursor:pointer;";

    var cancelBtn = btnRow.createEl("button", { text: "取消" });
    cancelBtn.style.cssText = "padding:10px 20px;font-size:14px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;";

    function doGenerate() {
        var prompt = ta.value.trim();
        if (!prompt) { new self.app.Notice("请输入提示词"); return; }
        genBtn.disabled = true;
        genBtn.textContent = "生成中...";
        genBtn.style.opacity = "0.6";
        var ed = self.app.workspace.activeEditor && self.app.workspace.activeEditor.editor;
        self.plugin.callAPI(prompt, ed);
        self.close();
    }

    genBtn.addEventListener("click", doGenerate);
    cancelBtn.addEventListener("click", function() { self.close(); });
    ta.addEventListener("keydown", function(e) {
        if (e.key === "Enter" && e.ctrlKey) doGenerate();
        if (e.key === "Escape") self.close();
    });
    ta.focus();
};

GenModal.prototype.onClose = function() {
    this.contentEl.empty();
};
