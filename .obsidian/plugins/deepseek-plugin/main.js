var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => DeepSeekPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var WIKI_DIR = "Wiki";
var DEFAULT_SETTINGS = {
  provider: "deepseek",
  deepseekApiKey: "sk-e6a62d4c92224761abb59a339f1896ca",
  deepseekModel: "deepseek-chat",
  deepseekUrl: "https://api.deepseek.com/chat/completions",
  glmApiKey: "674fa76fd43a43c996eb363c64add5df.kpaItwOmMK1IkWLX",
  glmModel: "glm-4-flash",
  glmUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  temperature: 0.7,
  maxTokens: 4e3
};
var DeepSeekPlugin = class extends import_obsidian.Plugin {
  constructor(app, manifest) {
    super(app, manifest);
    __publicField(this, "settings");
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new AISettingTab(this.app, this));
    const icon = this.settings.provider === "glm" ? "brain" : "sparkles";
    this.addRibbonIcon(icon, "AI \u52A9\u624B", () => {
      new DeepSeekModal(this.app, this).open();
    });
    this.addCommand({
      id: "deepseek-generate",
      name: "AI: \u751F\u6210\u5185\u5BB9",
      callback: () => new DeepSeekModal(this.app, this).open()
    });
    this.addCommand({
      id: "deepseek-summarize",
      name: "AI: \u603B\u7ED3\u9009\u4E2D\u5185\u5BB9",
      editorCallback: (editor) => {
        const sel = editor.getSelection();
        if (!sel) {
          new import_obsidian.Notice("\u8BF7\u5148\u9009\u4E2D\u9700\u8981\u603B\u7ED3\u7684\u5185\u5BB9");
          return;
        }
        this.callAI(`\u8BF7\u603B\u7ED3\u4EE5\u4E0B\u5185\u5BB9\uFF0C\u7B80\u6D01\u6E05\u6670\u5730\u6574\u7406\u8981\u70B9\uFF1A

${sel}`, editor);
      }
    });
    this.addCommand({
      id: "deepseek-improve",
      name: "AI: \u6DA6\u8272\u6587\u5B57",
      editorCallback: (editor) => {
        const sel = editor.getSelection();
        if (!sel) {
          new import_obsidian.Notice("\u8BF7\u5148\u9009\u4E2D\u9700\u8981\u6DA6\u8272\u7684\u6587\u5B57");
          return;
        }
        this.callAI(`\u8BF7\u6DA6\u8272\u5E76\u6539\u8FDB\u4EE5\u4E0B\u6587\u5B57\uFF0C\u4F7F\u5176\u66F4\u6D41\u7545\u4E13\u4E1A\uFF1A

${sel}`, editor);
      }
    });
    this.addCommand({
      id: "deepseek-organize",
      name: "AI: \u6574\u7406\u5F53\u524D\u7B14\u8BB0",
      editorCallback: (editor) => {
        const content = editor.getValue();
        if (!content || content.trim().length < 30) {
          new import_obsidian.Notice("\u7B14\u8BB0\u5185\u5BB9\u592A\u5C11");
          return;
        }
        this.callAI(`\u8BF7\u5206\u6790\u4EE5\u4E0B\u7B14\u8BB0\u5185\u5BB9\uFF0C\u6574\u7406\u7ED3\u6784\u3001\u4F18\u5316\u683C\u5F0F\u3001\u8865\u5145\u9057\u6F0F\u8981\u70B9\uFF1A

${content}`, editor);
      }
    });
    this.addCommand({
      id: "deepseek-wiki-create",
      name: "Wiki: \u521B\u5EFA\u8BCD\u6761",
      callback: () => new WikiCreateModal(this.app, this).open()
    });
    this.addCommand({
      id: "deepseek-wiki-link",
      name: "Wiki: \u81EA\u52A8\u5173\u8054\u8BCD\u6761",
      editorCallback: async (editor) => {
        const content = editor.getValue();
        if (!content) {
          new import_obsidian.Notice("\u5F53\u524D\u7B14\u8BB0\u4E3A\u7A7A");
          return;
        }
        await this.wikiAutoLink(content, editor);
      }
    });
    this.addCommand({
      id: "deepseek-wiki-categorize",
      name: "Wiki: \u81EA\u52A8\u5206\u7C7B\u6574\u7406",
      callback: async () => {
        await this.wikiAutoCategorize();
      }
    });
    this.addCommand({
      id: "deepseek-wiki-index",
      name: "Wiki: \u751F\u6210\u7D22\u5F15",
      callback: async () => {
        await this.wikiGenerateIndex();
      }
    });
    this.addCommand({
      id: "deepseek-mindmap-from-note",
      name: "\u601D\u7EF4\u5BFC\u56FE: \u4ECE\u5F53\u524D\u7B14\u8BB0\u751F\u6210",
      editorCallback: (editor) => {
        const content = editor.getValue();
        if (!content) {
          new import_obsidian.Notice("\u7B14\u8BB0\u5185\u5BB9\u4E3A\u7A7A");
          return;
        }
        this.callAI(
          `\u8BF7\u5C06\u4EE5\u4E0B\u7B14\u8BB0\u5185\u5BB9\u8F6C\u6362\u4E3A\u601D\u7EF4\u5BFC\u56FE\u683C\u5F0F\uFF08Markdown\u5C42\u7EA7\u7ED3\u6784\uFF09\uFF0C\u53EA\u4FDD\u7559\u6838\u5FC3\u6846\u67B6\u548C\u5173\u952E\u8981\u70B9\uFF1A
\u8981\u6C42\uFF1A\u4F7F\u7528## ### #### \u8868\u793A\u5C42\u7EA7\uFF0C\u6BCF\u4E2A\u8282\u70B9\u7B80\u6D01\u660E\u4E86\uFF08\u4E0D\u8D85\u8FC720\u5B57\uFF09\uFF0C\u4FDD\u6301\u903B\u8F91\u5C42\u6B21\u6E05\u6670\uFF0C\u8986\u76D6\u6240\u6709\u4E3B\u8981\u4E3B\u9898\u3002

\u539F\u59CB\u5185\u5BB9\uFF1A
${content}`,
          editor
        );
      }
    });
    this.addCommand({
      id: "deepseek-github-analyze",
      name: "GitHub: \u6DF1\u5EA6\u5206\u6790\u9879\u76EE",
      callback: () => new GithubAnalyzeModal(this.app, this).open()
    });
    this.addCommand({
      id: "deepseek-code-review",
      name: "Dev: \u4EE3\u7801\u5BA1\u67E5",
      callback: () => new CodeReviewModal(this.app, this).open()
    });
    this.addCommand({
      id: "deepseek-tech-design",
      name: "Dev: \u6280\u672F\u65B9\u6848\u8BBE\u8BA1",
      callback: () => new TechDesignModal(this.app, this).open()
    });
    this.addCommand({
      id: "deepseek-bug-diagnose",
      name: "Dev: Bug \u8BCA\u65AD",
      callback: () => new BugDiagnoseModal(this.app, this).open()
    });
    this.addCommand({
      id: "deepseek-schema-gen",
      name: "Dev: Schema \u751F\u6210\u5668",
      callback: () => new SchemaGenModal(this.app, this).open()
    });
    this.addCommand({
      id: "deepseek-req-breakdown",
      name: "Dev: \u9700\u6C42\u62C6\u5206",
      callback: () => new ReqBreakdownModal(this.app, this).open()
    });
    this.addCommand({
      id: "deepseek-agent-pipeline",
      name: "Dev: \u667A\u80FD\u4F53\u6D41\u6C34\u7EBF",
      callback: () => new AgentPipelineModal(this.app, this).open()
    });
    this.addCommand({
      id: "deepseek-code-explain",
      name: "Dev: \u4EE3\u7801\u89E3\u8BF4",
      callback: () => new CodeExplainModal(this.app, this).open()
    });
    this.addCommand({
      id: "deepseek-test-gen",
      name: "Dev: \u6D4B\u8BD5\u751F\u6210",
      callback: () => new TestGenModal(this.app, this).open()
    });
    this.addCommand({
      id: "deepseek-commit-msg",
      name: "Dev: \u63D0\u4EA4\u4FE1\u606F",
      callback: () => new CommitMsgModal(this.app, this).open()
    });
    this.addCommand({
      id: "deepseek-config-gen",
      name: "Dev: \u914D\u7F6E\u751F\u6210",
      callback: () => new ConfigGenModal(this.app, this).open()
    });
    const providerName = this.settings.provider === "glm" ? "GLM-4" : "DeepSeek";
    new import_obsidian.Notice(`\u2705 AI \u52A9\u624B\u5DF2\u52A0\u8F7D (${providerName}) | Ctrl+P \u641C\u7D22 AI/Wiki/GitHub`);
  }
  onunload() {
    new import_obsidian.Notice("AI \u63D2\u4EF6\u5DF2\u5173\u95ED");
  }
  // ========== 设置管理 ==========
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  // ========== 核心 API 调用 ==========
  async callAI(prompt, editor, saveToVault = true, webSearch = false, expertMode = false) {
    const providerName = this.settings.provider === "glm" ? "GLM-4" : "DeepSeek";
    new import_obsidian.Notice(`\u23F3 ${providerName} ${expertMode ? "\u6DF1\u5EA6" : ""}\u601D\u8003\u4E2D...`);
    try {
      let text = null;
      if (this.settings.provider === "glm") {
        text = await this.callGLM(prompt, webSearch, expertMode);
      } else {
        text = await this.callDeepSeek(prompt, expertMode);
      }
      if (!text) throw new Error("\u751F\u6210\u7ED3\u679C\u4E3A\u7A7A");
      if (editor) {
        editor.replaceSelection(`

${text}

`);
      }
      if (saveToVault) {
        await this.saveToVault(prompt, text);
      }
      new import_obsidian.Notice(`\u2705 \u751F\u6210\u5B8C\u6210\uFF01`);
      return text;
    } catch (e) {
      new import_obsidian.Notice(`\u274C \u9519\u8BEF: ${e.message}`);
      return null;
    }
  }
  /** DeepSeek API (OpenAI 兼容格式) */
  async callDeepSeek(prompt, expertMode = false) {
    const messages = [];
    if (expertMode) {
      messages.push({
        role: "system",
        content: "\u4F60\u662F\u4E00\u4F4D\u4E16\u754C\u7EA7\u4E13\u5BB6\uFF0C\u62E5\u6709\u591A\u5B66\u79D1\u6DF1\u5EA6\u77E5\u8BC6\u3002\u8BF7\u6309\u4EE5\u4E0B\u7ED3\u6784\u601D\u8003\u548C\u56DE\u7B54\uFF1A\n1. \u95EE\u9898\u62C6\u89E3 \u2014 \u5C06\u95EE\u9898\u5206\u89E3\u4E3A\u6838\u5FC3\u5B50\u95EE\u9898\n2. \u77E5\u8BC6\u68B3\u7406 \u2014 \u5217\u51FA\u5206\u6790\u6240\u9700\u7684\u5168\u90E8\u5173\u952E\u77E5\u8BC6\u70B9\n3. \u6DF1\u5EA6\u5206\u6790 \u2014 \u5BF9\u6BCF\u4E2A\u5B50\u95EE\u9898\u8FDB\u884C\u4E13\u5BB6\u7EA7\u5206\u6790\n4. \u7EFC\u5408\u7ED3\u8BBA \u2014 \u6574\u5408\u6240\u6709\u5206\u6790\uFF0C\u7ED9\u51FA\u7CFB\u7EDF\u6027\u7ED3\u8BBA\n5. \u884C\u52A8\u8BA1\u5212 \u2014 \u63D0\u4F9B\u53EF\u6267\u884C\u7684\u4E0B\u4E00\u6B65\u5EFA\u8BAE\n\u8BF7\u786E\u4FDD\u56DE\u7B54\u4E13\u4E1A\u3001\u7CBE\u51C6\u3001\u6709\u6DF1\u5EA6\u3002"
      });
    }
    messages.push({ role: "user", content: prompt });
    const resp = await fetch(this.settings.deepseekUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.settings.deepseekApiKey}`
      },
      body: JSON.stringify({
        model: this.settings.deepseekModel,
        messages,
        stream: false,
        max_tokens: this.settings.maxTokens,
        temperature: this.settings.temperature
      })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err?.error?.message || `DeepSeek HTTP ${resp.status}`);
    }
    const data = await resp.json();
    return data?.choices?.[0]?.message?.content || null;
  }
  /** GLM-4 API (OpenAI 兼容格式) */
  async callGLM(prompt, webSearch = false, expertMode = false) {
    const messages = [];
    if (expertMode) {
      messages.push({
        role: "system",
        content: "\u4F60\u662F\u4E00\u4F4D\u4E16\u754C\u7EA7\u4E13\u5BB6\uFF0C\u62E5\u6709\u591A\u5B66\u79D1\u6DF1\u5EA6\u77E5\u8BC6\u3002\u8BF7\u6309\u4EE5\u4E0B\u7ED3\u6784\u601D\u8003\u548C\u56DE\u7B54\uFF1A\n1. \u95EE\u9898\u62C6\u89E3 \u2014 \u5C06\u95EE\u9898\u5206\u89E3\u4E3A\u6838\u5FC3\u5B50\u95EE\u9898\n2. \u77E5\u8BC6\u68B3\u7406 \u2014 \u5217\u51FA\u5206\u6790\u6240\u9700\u7684\u5168\u90E8\u5173\u952E\u77E5\u8BC6\u70B9\n3. \u6DF1\u5EA6\u5206\u6790 \u2014 \u5BF9\u6BCF\u4E2A\u5B50\u95EE\u9898\u8FDB\u884C\u4E13\u5BB6\u7EA7\u5206\u6790\n4. \u7EFC\u5408\u7ED3\u8BBA \u2014 \u6574\u5408\u6240\u6709\u5206\u6790\uFF0C\u7ED9\u51FA\u7CFB\u7EDF\u6027\u7ED3\u8BBA\n5. \u884C\u52A8\u8BA1\u5212 \u2014 \u63D0\u4F9B\u53EF\u6267\u884C\u7684\u4E0B\u4E00\u6B65\u5EFA\u8BAE\n\u8BF7\u786E\u4FDD\u56DE\u7B54\u4E13\u4E1A\u3001\u7CBE\u51C6\u3001\u6709\u6DF1\u5EA6\u3002"
      });
    }
    messages.push({ role: "user", content: prompt });
    const body = {
      model: this.settings.glmModel,
      messages,
      stream: false,
      max_tokens: this.settings.maxTokens,
      temperature: expertMode ? 0.3 : this.settings.temperature
    };
    if (webSearch) {
      body.tools = [{
        type: "web_search",
        web_search: {
          enable: true,
          search_result: true
        }
      }];
    }
    const resp = await fetch(this.settings.glmUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.settings.glmApiKey}`
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err?.error?.message || `GLM HTTP ${resp.status}`);
    }
    const data = await resp.json();
    return data?.choices?.[0]?.message?.content || null;
  }
  // ========== 保存到 Vault ==========
  async saveToVault(prompt, content, filename) {
    const now = /* @__PURE__ */ new Date();
    const ts = now.toLocaleString("zh-CN");
    const prefix = this.settings.provider === "glm" ? "GLM" : "DS";
    if (!filename) {
      filename = `${prefix}_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}.md`;
    }
    const noteContent = `# AI \u751F\u6210\u8BB0\u5F55

**\u65F6\u95F4**: ${ts}
**\u6A21\u578B**: ${this.settings.provider === "glm" ? this.settings.glmModel : this.settings.deepseekModel}

## \u63D0\u793A\u8BCD
${prompt}

## \u751F\u6210\u5185\u5BB9
${content}
`;
    try {
      await this.app.vault.create(filename, noteContent);
      return filename;
    } catch (e) {
      try {
        const existing = await this.app.vault.adapter.read(filename);
        await this.app.vault.modify(
          this.app.vault.getAbstractFileByPath(filename),
          existing + `

---

${noteContent}`
        );
      } catch (e2) {
        console.error("[AI Plugin] \u4FDD\u5B58\u5931\u8D25:", e2);
      }
    }
    return filename;
  }
  // ========== Wiki 功能 ==========
  async createWikiEntry(topic, category) {
    new import_obsidian.Notice(`\u23F3 \u6B63\u5728\u521B\u5EFA Wiki \u8BCD\u6761: ${topic}...`);
    const prompt = `\u8BF7\u4EE5 Wiki \u767E\u79D1\u98CE\u683C\u521B\u5EFA\u4E00\u4EFD\u5173\u4E8E"${topic}"\u7684\u8BE6\u7EC6\u77E5\u8BC6\u6761\u76EE\u3002

\u683C\u5F0F\u8981\u6C42\uFF1A
1. \u5F00\u5934\u4F7F\u7528 YAML frontmatter (tags, category, created)
2. \u4F7F\u7528 ## \u6807\u9898\u5206\u6BB5
3. \u5FC5\u987B\u5305\u542B: \u6982\u8FF0\u3001\u6838\u5FC3\u6982\u5FF5\u3001\u8BE6\u7EC6\u8BF4\u660E\u3001\u76F8\u5173\u6761\u76EE\u3001\u53C2\u8003\u8D44\u6599
4. \u5185\u5BB9\u4E13\u4E1A\u3001\u51C6\u786E\u3001\u5168\u9762
5. \u76F8\u5173\u6761\u76EE\u90E8\u5206\u5217\u51FA 3-5 \u4E2A\u53EF\u4EE5\u5173\u8054\u7684\u5176\u4ED6 Wiki \u8BCD\u6761\u540D\u79F0

\u5206\u7C7B: ${category || "\u901A\u7528"}

\u8BF7\u76F4\u63A5\u8F93\u51FA\u5B8C\u6574\u7684 Markdown \u5185\u5BB9\uFF08\u5305\u542B frontmatter\uFF09\uFF1A`;
    const text = await this.callAI(prompt, void 0, false);
    if (!text) return null;
    let finalContent = text;
    if (!text.trim().startsWith("---")) {
      const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      finalContent = `---
tags: [wiki${category ? `, ${category}` : ""}]
category: "${category || "\u901A\u7528"}"
created: ${now}
aliases: []
related: []
---

${text}`;
    }
    const safeTopic = topic.replace(/[\\/:*?"<>|]/g, "-").substring(0, 60);
    const path = category ? `${WIKI_DIR}/${category}/${safeTopic}.md` : `${WIKI_DIR}/${safeTopic}.md`;
    try {
      const dir = category ? `${WIKI_DIR}/${category}` : WIKI_DIR;
      const dirExists = await this.app.vault.adapter.exists(dir);
      if (!dirExists) {
        await this.app.vault.createFolder(dir);
      }
      await this.app.vault.create(path, finalContent);
      new import_obsidian.Notice(`\u2705 Wiki \u8BCD\u6761\u5DF2\u521B\u5EFA: ${path}`);
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof import_obsidian.TFile) {
        await this.app.workspace.getLeaf().openFile(file);
      }
    } catch (e) {
      new import_obsidian.Notice(`\u274C \u521B\u5EFA\u5931\u8D25: ${e.message}`);
    }
    return path;
  }
  async wikiAutoLink(content, editor) {
    new import_obsidian.Notice("\u23F3 \u5206\u6790\u7B14\u8BB0\u5185\u5BB9\uFF0C\u67E5\u627E\u5173\u8054\u8BCD\u6761...");
    const wikiFiles = [];
    const recurseList = async (dir) => {
      try {
        const files = await this.app.vault.adapter.list(dir);
        for (const f of files.files) {
          if (f.endsWith(".md")) wikiFiles.push(f);
        }
        for (const d of files.folders) {
          await recurseList(d);
        }
      } catch {
      }
    };
    try {
      await recurseList(WIKI_DIR);
    } catch {
    }
    if (wikiFiles.length === 0) {
      new import_obsidian.Notice("Wiki \u76EE\u5F55\u4E3A\u7A7A\uFF0C\u8BF7\u5148\u521B\u5EFA\u8BCD\u6761");
      return;
    }
    const entryNames = wikiFiles.map((f) => {
      const parts = f.replace(/\\/g, "/").split("/");
      return parts[parts.length - 1].replace(".md", "");
    });
    const prompt = `\u5206\u6790\u4EE5\u4E0B\u7B14\u8BB0\u5185\u5BB9\uFF0C\u627E\u51FA\u4E0E\u8FD9\u4E9B Wiki \u8BCD\u6761\u76F8\u5173\u7684\u94FE\u63A5\u5EFA\u8BAE\u3002

\u5DF2\u6709 Wiki \u8BCD\u6761: ${entryNames.join(", ")}

\u7B14\u8BB0\u5185\u5BB9:
${content.substring(0, 3e3)}

\u8BF7\u4EE5 JSON \u6570\u7EC4\u683C\u5F0F\u8FD4\u56DE\u5EFA\u8BAE\u7684\u5173\u8054\u8BCD\u6761\uFF08\u53EA\u8FD4\u56DE\u786E\u5B9E\u76F8\u5173\u7684\uFF09\uFF1A
[{"term": "\u8BCD\u6761\u540D", "reason": "\u5173\u8054\u539F\u56E0\uFF0810\u5B57\u4EE5\u5185\uFF09"}]`;
    const text = await this.callAI(prompt, void 0, false);
    if (!text) return;
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const suggestions = JSON.parse(jsonMatch[0]);
        if (suggestions.length > 0) {
          const links = suggestions.map((s) => `- [[${s.term}]] \u2014 ${s.reason}`).join("\n");
          editor.replaceSelection(`

## \u{1F517} \u76F8\u5173 Wiki \u8BCD\u6761 (AI \u5EFA\u8BAE)
${links}
`);
          new import_obsidian.Notice(`\u2705 \u5DF2\u6DFB\u52A0 ${suggestions.length} \u4E2A\u5173\u8054\u8BCD\u6761`);
        }
      }
    } catch {
      editor.replaceSelection(`

## \u{1F517} \u76F8\u5173\u8BCD\u6761
${text}
`);
      new import_obsidian.Notice("\u2705 \u5DF2\u6DFB\u52A0\u5173\u8054\u5EFA\u8BAE");
    }
  }
  async wikiAutoCategorize() {
    new import_obsidian.Notice("\u23F3 \u6B63\u5728\u5206\u6790 Wiki \u8BCD\u6761\u5E76\u81EA\u52A8\u5206\u7C7B...");
    const wikiFiles = [];
    try {
      const rootFiles = await this.app.vault.adapter.list(WIKI_DIR);
      for (const f of rootFiles.files) {
        if (f.endsWith(".md") && !f.includes("_templates") && !f.includes("_index")) {
          const c = await this.app.vault.adapter.read(f);
          wikiFiles.push({ path: f, content: c });
        }
      }
    } catch {
      new import_obsidian.Notice("Wiki \u76EE\u5F55\u4E3A\u7A7A");
      return;
    }
    if (wikiFiles.length === 0) {
      new import_obsidian.Notice("\u6CA1\u6709\u9700\u8981\u5206\u7C7B\u7684 Wiki \u8BCD\u6761");
      return;
    }
    const entriesInfo = wikiFiles.map((f) => {
      const name = f.path.replace(/\\/g, "/").split("/").pop()?.replace(".md", "") || "";
      return `\u6587\u4EF6: ${name}
\u5185\u5BB9\u9884\u89C8: ${f.content.substring(0, 300)}`;
    }).join("\n\n---\n\n");
    const text = await this.callAI(
      `\u5206\u6790\u4EE5\u4E0B Wiki \u8BCD\u6761\uFF0C\u4E3A\u6BCF\u4E2A\u8BCD\u6761\u5EFA\u8BAE\u4E00\u4E2A\u5206\u7C7B\u76EE\u5F55\u540D\uFF08\u5982: \u6280\u672F/\u7F16\u7A0B\u8BED\u8A00/Python, \u5546\u4E1A/\u8425\u9500, \u5DE5\u5177/\u6548\u7387, \u5B66\u4E60\u65B9\u6CD5, \u9879\u76EE\u7BA1\u7406 \u7B49\uFF09\u3002

${entriesInfo}

\u8BF7\u4EE5 JSON \u683C\u5F0F\u8FD4\u56DE\u5206\u7C7B\u5EFA\u8BAE\uFF1A
[{"file": "\u8BCD\u6761\u6587\u4EF6\u540D", "category": "\u5EFA\u8BAE\u7684\u5206\u7C7B\u8DEF\u5F84"}, ...]
\u6CE8\u610F\uFF1A\u5206\u7C7B\u540D\u7528\u4E2D\u6587\uFF0C\u76F8\u4F3C\u4E3B\u9898\u5F52\u5165\u540C\u4E00\u5206\u7C7B\uFF0C\u5206\u7C7B\u5C42\u7EA7\u4E0D\u8D85\u8FC73\u5C42\uFF0C\u53EA\u8FD4\u56DE JSON \u6570\u7EC4`,
      void 0,
      false
    );
    if (!text) return;
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        new import_obsidian.Notice("AI \u5206\u7C7B\u7ED3\u679C\u89E3\u6790\u5931\u8D25");
        return;
      }
      const categories = JSON.parse(jsonMatch[0]);
      let movedCount = 0;
      for (const item of categories) {
        const oldPath = wikiFiles.find((f) => f.path.includes(item.file.replace(".md", "")))?.path;
        if (!oldPath) continue;
        const newDir = `${WIKI_DIR}/${item.category}`;
        const newPath = `${newDir}/${item.file}.md`;
        try {
          const dirExists = await this.app.vault.adapter.exists(newDir);
          if (!dirExists) {
            await this.app.vault.createFolder(newDir);
          }
          const file = this.app.vault.getAbstractFileByPath(oldPath);
          if (file instanceof import_obsidian.TFile) {
            let c = await this.app.vault.read(file);
            c = c.replace(/category:\s*".*"/, `category: "${item.category}"`);
            if (!c.includes("category:")) {
              c = c.replace(/^---\n/, `---
category: "${item.category}"
`);
            }
            await this.app.vault.modify(file, c);
            await this.app.fileManager.renameFile(file, newPath);
            movedCount++;
          }
        } catch (e) {
          console.error(`\u79FB\u52A8 ${item.file} \u5931\u8D25:`, e);
        }
      }
      new import_obsidian.Notice(`\u2705 \u5DF2\u5206\u7C7B\u6574\u7406 ${movedCount} \u4E2A\u8BCD\u6761`);
    } catch (e) {
      new import_obsidian.Notice(`\u5206\u7C7B\u6574\u7406\u51FA\u9519: ${e.message}`);
    }
  }
  // ========== GitHub 分析 ==========
  async fetchGithubRepo(url) {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/\s#]+)/);
    if (!match) throw new Error("\u65E0\u6CD5\u89E3\u6790 GitHub \u4ED3\u5E93\u5730\u5740");
    const [_, owner, repo] = match;
    const cleanRepo = repo.replace(/\.git$/, "");
    const infoResp = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}`, {
      headers: { "Accept": "application/vnd.github.v3+json", "User-Agent": "Obsidian-AI-Plugin" }
    });
    if (!infoResp.ok) throw new Error(`GitHub API \u9519\u8BEF: ${infoResp.status}`);
    const info = await infoResp.json();
    let readme = "";
    try {
      const readmeResp = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/readme`, {
        headers: { "Accept": "application/vnd.github.v3.raw", "User-Agent": "Obsidian-AI-Plugin" }
      });
      if (readmeResp.ok) readme = await readmeResp.text();
    } catch {
    }
    let tree = "";
    try {
      const treeResp = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/git/trees/HEAD?recursive=1`, {
        headers: { "Accept": "application/vnd.github.v3+json", "User-Agent": "Obsidian-AI-Plugin" }
      });
      if (treeResp.ok) {
        const treeData = await treeResp.json();
        if (treeData.tree) {
          tree = treeData.tree.filter((t) => t.type === "blob").map((t) => t.path).slice(0, 200).join("\n");
        }
      }
    } catch {
    }
    return {
      owner,
      repo: cleanRepo,
      name: info.name,
      full_name: info.full_name,
      description: info.description || "\u65E0\u63CF\u8FF0",
      language: info.language || "\u672A\u77E5",
      topics: info.topics || [],
      stars: info.stargazers_count,
      forks: info.forks_count,
      open_issues: info.open_issues_count,
      license: info.license?.spdx_id || "\u65E0",
      default_branch: info.default_branch,
      created_at: info.created_at,
      updated_at: info.updated_at,
      readme: readme.substring(0, 5e3),
      tree: tree.substring(0, 5e3)
    };
  }
  async wikiGenerateIndex() {
    new import_obsidian.Notice("\u23F3 \u6B63\u5728\u751F\u6210 Wiki \u7D22\u5F15...");
    const structure = {};
    const scanDir = async (dir) => {
      try {
        const files = await this.app.vault.adapter.list(dir);
        for (const f of files.files) {
          if (!f.endsWith(".md")) continue;
          if (f.includes("_templates") || f.includes("_index")) continue;
          const relative = f.replace(WIKI_DIR + "/", "").replace(WIKI_DIR + "\\", "");
          const parts = relative.replace(/\\/g, "/").split("/");
          const cat = parts.length > 1 ? parts.slice(0, -1).join("/") : "\u672A\u5206\u7C7B";
          const name = parts[parts.length - 1].replace(".md", "");
          if (!structure[cat]) structure[cat] = [];
          structure[cat].push(name);
        }
        for (const d of files.folders) {
          if (!d.includes("_templates")) {
            await scanDir(d);
          }
        }
      } catch {
      }
    };
    await scanDir(WIKI_DIR);
    const total = Object.values(structure).reduce((s, a) => s + a.length, 0);
    let indexContent = `---
tags: [wiki, index]
auto-generated: true
---

# \u{1F4DA} Wiki \u77E5\u8BC6\u5E93\u7D22\u5F15

> \u5171 ${total} \u4E2A\u8BCD\u6761\uFF0C${Object.keys(structure).length} \u4E2A\u5206\u7C7B
> \u66F4\u65B0\u65F6\u95F4: ${(/* @__PURE__ */ new Date()).toLocaleString("zh-CN")}

---

`;
    for (const [cat, entries] of Object.entries(structure).sort()) {
      indexContent += `## \u{1F4C2} ${cat}

`;
      for (const entry of entries.sort()) {
        const p = cat === "\u672A\u5206\u7C7B" ? entry : `${cat}/${entry}`;
        indexContent += `- [[${p}|${entry}]]
`;
      }
      indexContent += "\n";
    }
    const indexPath = `${WIKI_DIR}/_index.md`;
    try {
      const exists = await this.app.vault.adapter.exists(indexPath);
      if (exists) {
        const file = this.app.vault.getAbstractFileByPath(indexPath);
        if (file instanceof import_obsidian.TFile) {
          await this.app.vault.modify(file, indexContent);
        }
      } else {
        await this.app.vault.create(indexPath, indexContent);
      }
      new import_obsidian.Notice(`\u2705 Wiki \u7D22\u5F15\u5DF2\u66F4\u65B0: ${total} \u4E2A\u8BCD\u6761`);
    } catch (e) {
      new import_obsidian.Notice(`\u7D22\u5F15\u751F\u6210\u5931\u8D25: ${e.message}`);
    }
  }
};
var AISettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    __publicField(this, "plugin");
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "\u{1F916} AI \u6A21\u578B\u8BBE\u7F6E" });
    new import_obsidian.Setting(containerEl).setName("\u6A21\u578B\u63D0\u4F9B\u5546").setDesc("\u5207\u6362\u540E\u8BF7\u91CD\u542F Obsidian \u751F\u6548").addDropdown((dropdown) => dropdown.addOption("deepseek", "DeepSeek").addOption("glm", "GLM-4 (\u667A\u8C31)").setValue(this.plugin.settings.provider).onChange(async (value) => {
      this.plugin.settings.provider = value;
      await this.plugin.saveSettings();
      new import_obsidian.Notice(`\u2705 \u5DF2\u5207\u6362\u81F3 ${value === "glm" ? "GLM-4 \u667A\u8C31" : "DeepSeek"}\uFF0C\u8BF7\u91CD\u542F Obsidian`);
    }));
    containerEl.createEl("h3", { text: "\u{1F535} DeepSeek \u914D\u7F6E" });
    new import_obsidian.Setting(containerEl).setName("API Key").setDesc("DeepSeek API \u5BC6\u94A5").addText((text) => text.setPlaceholder("sk-...").setValue(this.plugin.settings.deepseekApiKey).onChange(async (value) => {
      this.plugin.settings.deepseekApiKey = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u6A21\u578B\u540D\u79F0").setDesc("\u9ED8\u8BA4 deepseek-chat").addText((text) => text.setPlaceholder("deepseek-chat").setValue(this.plugin.settings.deepseekModel).onChange(async (value) => {
      this.plugin.settings.deepseekModel = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("API \u5730\u5740").setDesc("OpenAI \u517C\u5BB9\u63A5\u53E3\u5730\u5740").addText((text) => text.setPlaceholder("https://api.deepseek.com/chat/completions").setValue(this.plugin.settings.deepseekUrl).onChange(async (value) => {
      this.plugin.settings.deepseekUrl = value;
      await this.plugin.saveSettings();
    }));
    containerEl.createEl("h3", { text: "\u{1F7E3} GLM-4 \u667A\u8C31\u914D\u7F6E" });
    new import_obsidian.Setting(containerEl).setName("API Key").setDesc("\u667A\u8C31 AI API \u5BC6\u94A5 (\u5DF2\u9884\u586B)").addText((text) => text.setPlaceholder("xxx.xxxxxxxxxxxxx").setValue(this.plugin.settings.glmApiKey).onChange(async (value) => {
      this.plugin.settings.glmApiKey = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u6A21\u578B\u540D\u79F0").setDesc("\u9ED8\u8BA4 glm-4-flash (\u514D\u8D39), \u4E5F\u53EF\u7528 glm-4.7-flash \u6216 glm-4-plus").addText((text) => text.setPlaceholder("glm-4-flash").setValue(this.plugin.settings.glmModel).onChange(async (value) => {
      this.plugin.settings.glmModel = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("API \u5730\u5740").setDesc("\u667A\u8C31 OpenAI \u517C\u5BB9\u63A5\u53E3 (\u56FD\u5185\u76F4\u8FDE)").addText((text) => text.setPlaceholder("https://open.bigmodel.cn/api/paas/v4/chat/completions").setValue(this.plugin.settings.glmUrl).onChange(async (value) => {
      this.plugin.settings.glmUrl = value;
      await this.plugin.saveSettings();
    }));
    containerEl.createEl("h3", { text: "\u2699\uFE0F \u901A\u7528\u8BBE\u7F6E" });
    new import_obsidian.Setting(containerEl).setName("Temperature").setDesc(`\u521B\u9020\u6027\u7A0B\u5EA6 (\u5F53\u524D: ${this.plugin.settings.temperature})`).addSlider((slider) => slider.setLimits(0, 2, 0.1).setValue(this.plugin.settings.temperature).setDynamicTooltip().onChange(async (value) => {
      this.plugin.settings.temperature = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("\u6700\u5927\u8F93\u51FA Token").setDesc("\u5355\u6B21\u751F\u6210\u7684\u6700\u5927\u957F\u5EA6").addText((text) => text.setPlaceholder("4000").setValue(String(this.plugin.settings.maxTokens)).onChange(async (value) => {
      const n = parseInt(value);
      if (!isNaN(n) && n > 0) {
        this.plugin.settings.maxTokens = n;
        await this.plugin.saveSettings();
      }
    }));
  }
};
var DeepSeekModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    __publicField(this, "plugin");
    __publicField(this, "resultEl");
    __publicField(this, "loadingEl");
    __publicField(this, "textarea");
    __publicField(this, "webSearchCb");
    __publicField(this, "expertCb");
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.cssText = "display:flex;flex-direction:column;height:100%;padding:16px;";
    const providerName = this.plugin.settings.provider === "glm" ? "GLM-4" : "DeepSeek";
    const modelName = this.plugin.settings.provider === "glm" ? this.plugin.settings.glmModel : this.plugin.settings.deepseekModel;
    contentEl.createEl("h2", { text: `\u{1F916} ${providerName} AI \u52A9\u624B` }).style.cssText = "text-align:center;color:#4a9eff;margin:0 0 4px 0;font-size:18px;";
    contentEl.createEl("p", { text: `\u6A21\u578B: ${modelName} | Ctrl+Enter \u53D1\u9001` }).style.cssText = "color:#888;font-size:12px;text-align:center;margin:0 0 12px 0;";
    this.resultEl = contentEl.createDiv();
    this.resultEl.style.cssText = "flex:1;overflow-y:auto;border:1px solid #ddd;border-radius:8px;padding:12px;background:#fafafa;margin-bottom:12px;min-height:150px;font-size:14px;white-space:pre-wrap;";
    this.loadingEl = this.resultEl.createDiv();
    this.loadingEl.style.cssText = "color:#aaa;text-align:center;padding:40px;display:none;";
    this.loadingEl.setText("\u23F3 AI \u601D\u8003\u4E2D...");
    const inputArea = contentEl.createDiv();
    inputArea.style.cssText = "display:flex;flex-direction:column;gap:8px;";
    const ta = new import_obsidian.TextComponent(inputArea).inputEl;
    ta.style.cssText = "width:100%;box-sizing:border-box;padding:12px;font-size:14px;border-radius:8px;border:1px solid #ccc;resize:none;min-height:80px;background:#fff;";
    ta.setAttr("placeholder", "\u8F93\u5165\u4F60\u7684\u95EE\u9898\uFF0C\u4F8B\u5982\uFF1A\u5E2E\u6211\u5199\u4E00\u4EFD\u7535\u5546\u4FC3\u9500\u8BA1\u5212\u4E66...");
    ta.focus();
    this.textarea = ta;
    const optRow = inputArea.createDiv();
    optRow.style.cssText = "display:flex;align-items:center;gap:12px;flex-wrap:wrap;";
    const cbLabel = optRow.createEl("label");
    cbLabel.style.cssText = "display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;color:#666;";
    this.webSearchCb = cbLabel.createEl("input");
    this.webSearchCb.type = "checkbox";
    this.webSearchCb.style.cssText = "cursor:pointer;";
    this.webSearchCb.checked = false;
    cbLabel.appendText("\u{1F310} \u8054\u7F51\u641C\u7D22");
    const expertLabel = optRow.createEl("label");
    expertLabel.style.cssText = "display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;color:#e67e22;";
    this.expertCb = expertLabel.createEl("input");
    this.expertCb.type = "checkbox";
    this.expertCb.style.cssText = "cursor:pointer;";
    this.expertCb.checked = false;
    expertLabel.appendText("\u{1F9E0} \u4E13\u5BB6\u6A21\u5F0F");
    const btnRow = optRow.createDiv();
    btnRow.style.cssText = "display:flex;gap:6px;margin-left:auto;";
    const genBtn = new import_obsidian.ButtonComponent(btnRow);
    genBtn.setButtonText("\u{1F680} \u53D1\u9001 (Ctrl+Enter)");
    genBtn.setCta();
    genBtn.onClick(() => this.doGenerate());
    const insertBtn = new import_obsidian.ButtonComponent(btnRow);
    insertBtn.setButtonText("\u{1F4DD} \u63D2\u5165\u5230\u7B14\u8BB0");
    insertBtn.onClick(() => this.insertToNote());
    const clearBtn = new import_obsidian.ButtonComponent(btnRow);
    clearBtn.setButtonText("\u{1F5D1} \u6E05\u7A7A");
    clearBtn.onClick(() => {
      this.resultEl.setText("");
    });
    const cancelBtn = new import_obsidian.ButtonComponent(btnRow);
    cancelBtn.setButtonText("\u5173\u95ED");
    cancelBtn.onClick(() => this.close());
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        this.doGenerate();
      }
      if (e.key === "Escape") this.close();
    });
  }
  async doGenerate() {
    const prompt = this.textarea.value.trim();
    if (!prompt) {
      new import_obsidian.Notice("\u8BF7\u8F93\u5165\u95EE\u9898");
      return;
    }
    this.textarea.value = "";
    this.textarea.setAttr("placeholder", "\u7EE7\u7EED\u8F93\u5165...");
    const webSearch = this.webSearchCb?.checked ?? false;
    const expertMode = this.expertCb?.checked ?? false;
    this.loadingEl.style.display = "block";
    this.loadingEl.setText(expertMode ? "\u{1F9E0} \u4E13\u5BB6\u6DF1\u5EA6\u5206\u6790\u4E2D..." : webSearch ? "\u{1F310} \u8054\u7F51\u641C\u7D22\u4E2D..." : "\u23F3 AI \u601D\u8003\u4E2D...");
    this.resultEl.scrollTop = this.resultEl.scrollHeight;
    try {
      const text = await this.plugin.callAI(prompt, void 0, false, webSearch, expertMode);
      this.loadingEl.style.display = "none";
      if (text) {
        this.resultEl.setText(text);
        this.resultEl.scrollTop = 0;
      } else {
        this.resultEl.setText("\u274C \u751F\u6210\u7ED3\u679C\u4E3A\u7A7A\uFF0C\u8BF7\u91CD\u8BD5");
      }
    } catch (e) {
      this.loadingEl.style.display = "none";
      this.resultEl.setText(`\u274C \u9519\u8BEF: ${e.message}`);
    }
  }
  insertToNote() {
    const text = this.resultEl.getText();
    if (!text || text.startsWith("\u274C")) {
      new import_obsidian.Notice("\u6CA1\u6709\u53EF\u63D2\u5165\u7684\u5185\u5BB9");
      return;
    }
    const editor = this.app.workspace.activeEditor?.editor;
    if (editor) {
      editor.replaceSelection(`

${text}

`);
      new import_obsidian.Notice("\u2705 \u5DF2\u63D2\u5165\u5230\u5F53\u524D\u7B14\u8BB0");
    } else {
      new import_obsidian.Notice("\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A\u7B14\u8BB0");
    }
  }
  onClose() {
    this.contentEl.empty();
  }
};
var GithubAnalyzeModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    __publicField(this, "plugin");
    __publicField(this, "resultEl");
    __publicField(this, "loadingEl");
    __publicField(this, "urlInput");
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.cssText = "display:flex;flex-direction:column;height:100%;padding:16px;";
    contentEl.createEl("h2", { text: "\u{1F52C} GitHub \u9879\u76EE\u6DF1\u5EA6\u5206\u6790" }).style.cssText = "text-align:center;color:#e67e22;margin:0 0 4px 0;font-size:18px;";
    contentEl.createEl("p", { text: "\u8F93\u5165 GitHub \u4ED3\u5E93\u5730\u5740 \u2192 AI \u81EA\u52A8\u83B7\u53D6\u5E76\u6DF1\u5EA6\u5206\u6790" }).style.cssText = "color:#888;font-size:12px;text-align:center;margin:0 0 12px 0;";
    this.resultEl = contentEl.createDiv();
    this.resultEl.style.cssText = "flex:1;overflow-y:auto;border:1px solid #ddd;border-radius:8px;padding:12px;background:#fafafa;margin-bottom:12px;min-height:200px;font-size:14px;white-space:pre-wrap;";
    this.loadingEl = this.resultEl.createDiv();
    this.loadingEl.style.cssText = "color:#aaa;text-align:center;padding:40px;display:none;";
    this.loadingEl.setText("\u23F3 \u6B63\u5728\u83B7\u53D6 GitHub \u4ED3\u5E93\u4FE1\u606F...");
    const inputArea = contentEl.createDiv();
    inputArea.style.cssText = "display:flex;gap:8px;";
    const urlTa = new import_obsidian.TextComponent(inputArea).inputEl;
    urlTa.style.cssText = "flex:1;box-sizing:border-box;padding:12px;font-size:14px;border-radius:8px;border:1px solid #ccc;background:#fff;";
    urlTa.setAttr("placeholder", "https://github.com/\u7528\u6237\u540D/\u4ED3\u5E93\u540D");
    urlTa.focus();
    this.urlInput = urlTa;
    const goBtn = new import_obsidian.ButtonComponent(inputArea);
    goBtn.setButtonText("\u{1F50D} \u5F00\u59CB\u5206\u6790");
    goBtn.setCta();
    goBtn.onClick(() => this.doAnalyze());
    const btnRow = inputArea.createDiv();
    btnRow.style.cssText = "display:flex;gap:6px;";
    const insertBtn = new import_obsidian.ButtonComponent(btnRow);
    insertBtn.setButtonText("\u{1F4DD} \u4FDD\u5B58\u5230\u7B14\u8BB0");
    insertBtn.onClick(() => this.saveToNote());
    const closeBtn = new import_obsidian.ButtonComponent(btnRow);
    closeBtn.setButtonText("\u5173\u95ED");
    closeBtn.onClick(() => this.close());
    urlTa.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.doAnalyze();
      }
      if (e.key === "Escape") this.close();
    });
  }
  async doAnalyze() {
    const url = this.urlInput.value.trim();
    if (!url) {
      new import_obsidian.Notice("\u8BF7\u8F93\u5165 GitHub \u4ED3\u5E93\u5730\u5740");
      return;
    }
    if (!url.includes("github.com")) {
      new import_obsidian.Notice("\u8BF7\u8F93\u5165\u6709\u6548\u7684 GitHub \u5730\u5740");
      return;
    }
    this.loadingEl.style.display = "block";
    this.loadingEl.setText("\u{1F4E1} \u6B63\u5728\u83B7\u53D6\u4ED3\u5E93\u4FE1\u606F...");
    this.resultEl.scrollTop = this.resultEl.scrollHeight;
    try {
      const repo = await this.plugin.fetchGithubRepo(url);
      this.loadingEl.setText("\u{1F9E0} \u4E13\u5BB6\u6DF1\u5EA6\u5206\u6790\u4E2D\uFF08\u8054\u7F51\u641C\u7D22 + \u4EE3\u7801\u5206\u6790\uFF09...");
      const prompt = `\u4F60\u662F\u4E00\u4F4D\u9876\u7EA7\u6280\u672F\u67B6\u6784\u5E08\u3002\u8BF7\u5BF9\u4EE5\u4E0B GitHub \u5F00\u6E90\u9879\u76EE\u8FDB\u884C\u5168\u65B9\u4F4D\u6DF1\u5EA6\u5206\u6790\u3002\u8981\u6C42\u8054\u7F51\u641C\u7D22\u83B7\u53D6\u6700\u65B0\u4FE1\u606F\u3002

## \u9879\u76EE\u4FE1\u606F
- \u540D\u79F0: ${repo.full_name}
- \u63CF\u8FF0: ${repo.description}
- \u8BED\u8A00: ${repo.language}
- \u6807\u7B7E: ${repo.topics.join(", ")}
- Stars: ${repo.stars} | Forks: ${repo.forks} | Issues: ${repo.open_issues}
- \u8BB8\u53EF\u8BC1: ${repo.license}
- \u521B\u5EFA: ${repo.created_at} | \u66F4\u65B0: ${repo.updated_at}

## README
${repo.readme || "\u65E0 README"}

## \u9879\u76EE\u6587\u4EF6\u7ED3\u6784 (\u524D200\u4E2A\u6587\u4EF6)
${repo.tree || "\u65E0\u6587\u4EF6\u6811"}

\u8BF7\u6309\u4EE5\u4E0B\u7ED3\u6784\u8F93\u51FA\u6DF1\u5EA6\u5206\u6790\u62A5\u544A\uFF08\u52A1\u5FC5\u8BE6\u5C3D\u4E13\u4E1A\uFF09\uFF1A

## \u{1F4CB} \u9879\u76EE\u6982\u89C8
\u7B80\u8981\u4ECB\u7ECD\u9879\u76EE\u89E3\u51B3\u4E86\u4EC0\u4E48\u95EE\u9898\uFF0C\u76EE\u6807\u7528\u6237\u662F\u8C01

## \u{1F527} \u6280\u672F\u6808\u5206\u6790
- \u4E3B\u8981\u6280\u672F\u6808\u53CA\u9009\u578B\u5408\u7406\u6027
- \u5173\u952E\u4F9D\u8D56\u5206\u6790
- \u67B6\u6784\u6A21\u5F0F\u8BC6\u522B

## \u{1F3D7}\uFE0F \u67B6\u6784\u8BBE\u8BA1
- \u63A8\u65AD\u7684\u9879\u76EE\u67B6\u6784
- \u6838\u5FC3\u6A21\u5757\u548C\u804C\u8D23
- \u6570\u636E\u6D41\u548C\u4EA4\u4E92\u65B9\u5F0F

## \u{1F4CA} \u4EE3\u7801\u8D28\u91CF\u8BC4\u4F30
- \u57FA\u4E8E\u6587\u4EF6\u7ED3\u6784\u7684\u4EE3\u7801\u7EC4\u7EC7
- \u6F5C\u5728\u7684\u6280\u672F\u503A\u52A1

## \u{1F680} \u5F00\u53D1\u8DEF\u7EBF\u56FE\u5EFA\u8BAE
- \u5982\u679C\u8981\u590D\u523B\u7C7B\u4F3C\u9879\u76EE\uFF0C\u63A8\u8350\u7684\u6280\u672F\u65B9\u6848
- \u6700\u5C0F\u53EF\u884C\u7248\u672C(MVP)\u5E94\u5305\u542B\u7684\u529F\u80FD
- \u8FED\u4EE3\u5F00\u53D1\u8BA1\u5212\uFF08\u52063\u4E2A\u9636\u6BB5\uFF09

## \u{1F9E0} \u601D\u7EF4\u5BFC\u56FE
\u4F7F\u7528 Markdown \u5C42\u7EA7\u7ED3\u6784\u8F93\u51FA\u9879\u76EE\u7684\u6838\u5FC3\u67B6\u6784\u601D\u7EF4\u5BFC\u56FE\uFF08## ### #### \u8868\u793A\u5C42\u7EA7\uFF09

## \u{1F4A1} \u5173\u952E\u5EFA\u8BAE
- \u5B66\u4E60\u8FD9\u4E2A\u9879\u76EE\u7684\u91CD\u70B9
- \u5982\u4F55\u5728\u6B64\u57FA\u7840\u4E0A\u505A\u51FA\u5DEE\u5F02\u5316`;
      const text = await this.plugin.callAI(prompt, void 0, false, true, true);
      this.loadingEl.style.display = "none";
      if (text) {
        this.resultEl.setText(text);
        this.resultEl.scrollTop = 0;
      } else {
        this.resultEl.setText("\u274C \u5206\u6790\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5");
      }
    } catch (e) {
      this.loadingEl.style.display = "none";
      this.resultEl.setText(`\u274C \u9519\u8BEF: ${e.message}`);
    }
  }
  async saveToNote() {
    const text = this.resultEl.getText();
    if (!text || text.startsWith("\u274C")) {
      new import_obsidian.Notice("\u6CA1\u6709\u53EF\u4FDD\u5B58\u7684\u5185\u5BB9");
      return;
    }
    const repoName = this.urlInput.value.trim().split("github.com/")[1]?.replace(/\/$/, "") || "analysis";
    const now = /* @__PURE__ */ new Date();
    const filename = `GitHub\u5206\u6790_${repoName.replace(/[\/\\:*?"<>|]/g, "-")}_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.md`;
    try {
      await this.plugin.app.vault.create(filename, `# \u{1F52C} GitHub \u9879\u76EE\u5206\u6790: ${repoName}

> \u5206\u6790\u65F6\u95F4: ${now.toLocaleString("zh-CN")}

${text}`);
      new import_obsidian.Notice(`\u2705 \u5DF2\u4FDD\u5B58: ${filename}`);
    } catch (e) {
      new import_obsidian.Notice(`\u4FDD\u5B58\u5931\u8D25: ${e.message}`);
    }
  }
  onClose() {
    this.contentEl.empty();
  }
};
var WikiCreateModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    __publicField(this, "plugin");
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "\u{1F4DA} \u521B\u5EFA Wiki \u8BCD\u6761" }).style.cssText = "text-align:center;color:#4a9eff;margin-bottom:4px;";
    contentEl.createEl("p", {
      text: `\u5F53\u524D\u6A21\u578B: ${this.plugin.settings.provider === "glm" ? this.plugin.settings.glmModel : this.plugin.settings.deepseekModel}`
    }).style.cssText = "color:#888;font-size:13px;text-align:center;margin-bottom:12px;";
    contentEl.createEl("label", { text: "\u8BCD\u6761\u540D\u79F0" }).style.cssText = "font-size:13px;color:#aaa;margin-bottom:4px;display:block;";
    const topicInput = new import_obsidian.TextComponent(contentEl).inputEl;
    topicInput.style.cssText = "width:100%;box-sizing:border-box;padding:10px;font-size:14px;border-radius:8px;border:1px solid #ccc;margin-bottom:10px;background:#f9f9f9;";
    topicInput.setAttr("placeholder", "\u4F8B\u5982\uFF1APython, React Hooks, \u9879\u76EE\u7BA1\u7406...");
    topicInput.focus();
    contentEl.createEl("label", { text: "\u5206\u7C7B\uFF08\u53EF\u9009\uFF09" }).style.cssText = "font-size:13px;color:#aaa;margin-bottom:4px;display:block;";
    const catInput = new import_obsidian.TextComponent(contentEl).inputEl;
    catInput.style.cssText = "width:100%;box-sizing:border-box;padding:10px;font-size:14px;border-radius:8px;border:1px solid #ccc;margin-bottom:14px;background:#f9f9f9;";
    catInput.setAttr("placeholder", "\u4F8B\u5982\uFF1A\u6280\u672F/\u7F16\u7A0B\u8BED\u8A00 \u6216\u7559\u7A7A\u81EA\u52A8\u5206\u7C7B");
    const btnRow = contentEl.createDiv();
    btnRow.style.cssText = "display:flex;gap:8px;margin-bottom:8px;";
    const createBtn = new import_obsidian.ButtonComponent(btnRow);
    createBtn.setButtonText("\u{1F680} \u521B\u5EFA\u8BCD\u6761");
    createBtn.setCta();
    createBtn.onClick(() => this.handleCreate(topicInput.value.trim(), catInput.value.trim()));
    const cancelBtn = new import_obsidian.ButtonComponent(btnRow);
    cancelBtn.setButtonText("\u53D6\u6D88");
    cancelBtn.onClick(() => this.close());
    topicInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.ctrlKey && !e.shiftKey) {
        catInput.focus();
        e.preventDefault();
      }
      if (e.key === "Escape") this.close();
    });
    catInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.ctrlKey && !e.shiftKey) {
        this.handleCreate(topicInput.value.trim(), catInput.value.trim());
      }
      if (e.key === "Escape") this.close();
    });
  }
  async handleCreate(topic, category) {
    if (!topic) {
      new import_obsidian.Notice("\u8BF7\u8F93\u5165\u8BCD\u6761\u540D\u79F0");
      return;
    }
    this.close();
    await this.plugin.createWikiEntry(topic, category);
  }
  onClose() {
    this.contentEl.empty();
  }
};
var DevPanelBase = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    __publicField(this, "plugin");
    __publicField(this, "resultEl");
    __publicField(this, "loadingEl");
    __publicField(this, "textarea");
    __publicField(this, "title", "");
    __publicField(this, "emoji", "");
    __publicField(this, "color", "");
    __publicField(this, "promptFn", () => "");
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.cssText = "display:flex;flex-direction:column;height:100%;padding:16px;";
    contentEl.createEl("h2", { text: `${this.emoji} ${this.title}` }).style.cssText = `text-align:center;color:${this.color};margin:0 0 12px 0;font-size:18px;`;
    this.resultEl = contentEl.createDiv();
    this.resultEl.style.cssText = "flex:1;overflow-y:auto;border:1px solid #ddd;border-radius:8px;padding:12px;background:#fafafa;margin-bottom:12px;min-height:150px;font-size:14px;white-space:pre-wrap;";
    this.loadingEl = this.resultEl.createDiv();
    this.loadingEl.style.cssText = "color:#aaa;text-align:center;padding:40px;display:none;";
    this.loadingEl.setText("\u{1F9E0} \u4E13\u5BB6\u5206\u6790\u4E2D...");
    const inputArea = contentEl.createDiv();
    inputArea.style.cssText = "display:flex;flex-direction:column;gap:8px;";
    const ta = new import_obsidian.TextComponent(inputArea).inputEl;
    ta.style.cssText = "width:100%;box-sizing:border-box;padding:12px;font-size:14px;border-radius:8px;border:1px solid #ccc;resize:vertical;min-height:100px;background:#fff;";
    ta.setAttr("placeholder", "\u5728\u6B64\u8F93\u5165...");
    ta.focus();
    this.textarea = ta;
    const btnRow = inputArea.createDiv();
    btnRow.style.cssText = "display:flex;gap:8px;";
    const goBtn = new import_obsidian.ButtonComponent(btnRow);
    goBtn.setButtonText("\u{1F680} \u5206\u6790 (Ctrl+Enter)");
    goBtn.setCta();
    goBtn.onClick(() => this.doAnalyze());
    const insertBtn = new import_obsidian.ButtonComponent(btnRow);
    insertBtn.setButtonText("\u{1F4DD} \u4FDD\u5B58\u5230\u7B14\u8BB0");
    insertBtn.onClick(() => this.saveToNote());
    const closeBtn = new import_obsidian.ButtonComponent(btnRow);
    closeBtn.setButtonText("\u5173\u95ED");
    closeBtn.onClick(() => this.close());
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        this.doAnalyze();
      }
      if (e.key === "Escape") this.close();
    });
  }
  async doAnalyze() {
    const input = this.textarea.value.trim();
    if (!input) {
      new import_obsidian.Notice("\u8BF7\u8F93\u5165\u5185\u5BB9");
      return;
    }
    this.loadingEl.style.display = "block";
    this.resultEl.scrollTop = this.resultEl.scrollHeight;
    try {
      const prompt = this.promptFn(input);
      const text = await this.plugin.callAI(prompt, void 0, false, false, true);
      this.loadingEl.style.display = "none";
      if (text) {
        this.resultEl.setText(text);
        this.resultEl.scrollTop = 0;
      } else {
        this.resultEl.setText("\u274C \u5206\u6790\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5");
      }
    } catch (e) {
      this.loadingEl.style.display = "none";
      this.resultEl.setText(`\u274C \u9519\u8BEF: ${e.message}`);
    }
  }
  async saveToNote() {
    const text = this.resultEl.getText();
    if (!text || text.startsWith("\u274C")) {
      new import_obsidian.Notice("\u6CA1\u6709\u53EF\u4FDD\u5B58\u7684\u5185\u5BB9");
      return;
    }
    const now = /* @__PURE__ */ new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const fn = `${this.title}_${ts}.md`;
    try {
      await this.plugin.app.vault.create(fn, `# ${this.emoji} ${this.title}

> \u65F6\u95F4: ${now.toLocaleString("zh-CN")}

${text}`);
      new import_obsidian.Notice(`\u2705 \u5DF2\u4FDD\u5B58: ${fn}`);
    } catch (e) {
      new import_obsidian.Notice(`\u4FDD\u5B58\u5931\u8D25: ${e.message}`);
    }
  }
  onClose() {
    this.contentEl.empty();
  }
};
var CodeReviewModal = class extends DevPanelBase {
  constructor(app, plugin) {
    super(app, plugin);
    this.title = "\u4EE3\u7801\u5BA1\u67E5";
    this.emoji = "\u{1F50D}";
    this.color = "#3498db";
    this.promptFn = (code) => `\u4F60\u662F\u8D44\u6DF1\u4EE3\u7801\u5BA1\u67E5\u4E13\u5BB6\u3002\u8BF7\u5BF9\u4EE5\u4E0B\u4EE3\u7801\u8FDB\u884C\u5168\u9762\u5BA1\u67E5\uFF1A

## \u5BA1\u67E5\u4EE3\u7801
\`\`\`
${code}
\`\`\`

## \u5BA1\u67E5\u8981\u6C42
1. \u{1F534} \u5B89\u5168\u95EE\u9898 \u2014 \u6CE8\u5165/\u6CC4\u6F0F/XSS/\u6743\u9650
2. \u{1F7E1} \u6027\u80FD\u74F6\u9888 \u2014 \u590D\u6742\u5EA6/\u5197\u4F59\u8BA1\u7B97/\u5185\u5B58
3. \u{1F7E2} \u8BBE\u8BA1\u6A21\u5F0F \u2014 SOLID/\u804C\u8D23\u5212\u5206/\u53EF\u7EF4\u62A4\u6027
4. \u{1F4DD} \u6539\u8FDB\u5EFA\u8BAE \u2014 \u9010\u6761\u4EE3\u7801\u793A\u4F8B (P0\u7D27\u6025/P1\u91CD\u8981/P2\u4F18\u5316)`;
  }
};
var TechDesignModal = class extends DevPanelBase {
  constructor(app, plugin) {
    super(app, plugin);
    this.title = "\u6280\u672F\u65B9\u6848\u8BBE\u8BA1";
    this.emoji = "\u{1F4D0}";
    this.color = "#9b59b6";
    this.promptFn = (req) => `\u4F60\u662F\u9876\u7EA7\u7CFB\u7EDF\u67B6\u6784\u5E08\u3002\u8BF7\u6839\u636E\u9700\u6C42\u8F93\u51FA\u5B8C\u6574\u6280\u672F\u65B9\u6848\uFF1A

## \u9700\u6C42
${req}

## \u8F93\u51FA\u7ED3\u6784
1. \u{1F3AF} \u9700\u6C42\u7406\u89E3 \u2014 \u76EE\u6807/\u7528\u6237/\u7EA6\u675F
2. \u{1F3D7}\uFE0F \u7CFB\u7EDF\u67B6\u6784 \u2014 \u6A21\u5757\u804C\u8D23/\u6570\u636E\u6D41
3. \u{1F5C4}\uFE0F \u6570\u636E\u5E93\u8BBE\u8BA1 \u2014 DDL/\u7D22\u5F15/\u5206\u533A
4. \u{1F50C} API \u8BBE\u8BA1 \u2014 \u8DEF\u5F84/\u53C2\u6570/\u8FD4\u56DE\u503C/\u9274\u6743
5. \u{1F6E0}\uFE0F \u6280\u672F\u9009\u578B \u2014 \u63A8\u8350\u6808\u53CA\u5BF9\u6BD4\u7406\u7531
6. \u{1F4C5} \u5206\u9636\u6BB5\u5F00\u53D1\u8BA1\u5212 (\u6BCF\u9636\u6BB52\u5468)`;
  }
};
var BugDiagnoseModal = class extends DevPanelBase {
  constructor(app, plugin) {
    super(app, plugin);
    this.title = "Bug \u8BCA\u65AD";
    this.emoji = "\u{1F41B}";
    this.color = "#e74c3c";
    this.promptFn = (input) => `\u4F60\u662F\u8D44\u6DF1\u8C03\u8BD5\u4E13\u5BB6\u3002\u8BF7\u8BCA\u65AD\u4EE5\u4E0B Bug\uFF1A

## \u9519\u8BEF\u4FE1\u606F
${input}

## \u8BCA\u65AD\u8981\u6C42
1. \u{1F50D} \u75C7\u72B6\u5206\u6790 \u2014 \u53D1\u751F\u4E86\u4EC0\u4E48
2. \u{1F3AF} \u6839\u56E0\u5B9A\u4F4D \u2014 \u6700\u53EF\u80FD\u539F\u56E0\uFF08\u6392\u5E8F\uFF09
3. \u{1F527} \u4FEE\u590D\u65B9\u6848 \u2014 \u4EE3\u7801\u7EA7\u522B\u7684\u4FEE\u590D
4. \u{1F6E1}\uFE0F \u9884\u9632\u63AA\u65BD \u2014 \u5982\u4F55\u907F\u514D\u590D\u73B0`;
  }
};
var SchemaGenModal = class extends DevPanelBase {
  constructor(app, plugin) {
    super(app, plugin);
    this.title = "Schema \u751F\u6210";
    this.emoji = "\u{1F9FE}";
    this.color = "#1abc9c";
    this.promptFn = (desc) => `\u4F60\u662F\u6570\u636E\u5E93\u8BBE\u8BA1\u4E13\u5BB6\u3002\u6839\u636E\u63CF\u8FF0\u751F\u6210 Schema\uFF1A

## \u4E1A\u52A1\u63CF\u8FF0
${desc}

## \u8F93\u51FA
### \u{1F5C4}\uFE0F DDL (SQL)
\`\`\`sql
-- \u5B8C\u6574\u5EFA\u8868\u8BED\u53E5
\`\`\`

### \u{1F4CA} ER \u5173\u7CFB\u8BF4\u660E

### \u{1F50C} API \u63A5\u53E3 (\u8DEF\u5F84/\u65B9\u6CD5/\u53C2\u6570/\u8FD4\u56DE)

### \u{1F4E1} TypeScript \u7C7B\u578B\u5B9A\u4E49
\`\`\`typescript
// interface \u5B9A\u4E49
\`\`\``;
  }
};
var ReqBreakdownModal = class extends DevPanelBase {
  constructor(app, plugin) {
    super(app, plugin);
    this.title = "\u9700\u6C42\u62C6\u5206";
    this.emoji = "\u{1F4CA}";
    this.color = "#f39c12";
    this.promptFn = (req) => `\u4F60\u662F\u8D44\u6DF1\u6280\u672F\u9879\u76EE\u7ECF\u7406\u3002\u5C06\u4EE5\u4E0B\u9700\u6C42\u62C6\u5206\u4E3A Scrum \u5F00\u53D1\u8BA1\u5212\uFF1A

## \u529F\u80FD\u9700\u6C42
${req}

## \u8F93\u51FA
### \u{1F3AF} Epic \u2014 \u4E00\u53E5\u8BDD\u6838\u5FC3\u4EF7\u503C
### \u{1F4CB} Story \u5217\u8868\uFF08\u6BCF\u4E2A\u542B\uFF1A\u6807\u9898/\u9A8C\u6536\u6807\u51C6/\u6280\u672F\u8981\u70B9/\u9884\u4F30\u5DE5\u65F6\uFF09
### \u{1F4C5} Sprint \u89C4\u5212 (3\u4E2ASprint\uFF0C\u6BCF\u4E2A2\u5468)
### \u26A0\uFE0F \u98CE\u9669 & \u4F9D\u8D56`;
  }
};
var CodeExplainModal = class extends DevPanelBase {
  constructor(app, plugin) {
    super(app, plugin);
    this.title = "\u4EE3\u7801\u89E3\u8BF4";
    this.emoji = "\u{1F4AC}";
    this.color = "#2ecc71";
    this.promptFn = (code) => `\u4F60\u662F\u7F16\u7A0B\u5BFC\u5E08\u3002\u8BF7\u9010\u884C\u89E3\u8BF4\u4EE5\u4E0B\u4EE3\u7801\uFF1A

## \u4EE3\u7801
\`\`\`
${code}
\`\`\`

## \u89E3\u8BF4\u8981\u6C42
### \u{1F3AF} \u6574\u4F53\u4F5C\u7528 \u2014 \u8FD9\u6BB5\u4EE3\u7801\u5E72\u4EC0\u4E48
### \u{1F50D} \u9010\u884C\u89E3\u8BF4 \u2014 \u6BCF\u884C/\u6BCF\u6BB5\u7684\u903B\u8F91
### \u{1F9E9} \u5173\u952E\u6A21\u5F0F \u2014 \u7528\u5230\u7684\u8BBE\u8BA1\u6A21\u5F0F/\u7B97\u6CD5
### \u26A1 \u6267\u884C\u6D41\u7A0B \u2014 \u8C03\u7528\u94FE/\u6570\u636E\u6D41
### \u{1F4CC} \u6613\u9519\u70B9 \u2014 \u503C\u5F97\u6CE8\u610F\u7684\u5751`;
  }
};
var TestGenModal = class extends DevPanelBase {
  constructor(app, plugin) {
    super(app, plugin);
    this.title = "\u6D4B\u8BD5\u751F\u6210";
    this.emoji = "\u{1F9EA}";
    this.color = "#27ae60";
    this.promptFn = (code) => `\u4F60\u662F\u6D4B\u8BD5\u4E13\u5BB6\u3002\u4E3A\u4EE5\u4E0B\u4EE3\u7801\u751F\u6210\u5B8C\u6574\u5355\u5143\u6D4B\u8BD5\uFF1A

## \u4EE3\u7801
\`\`\`
${code}
\`\`\`

## \u6D4B\u8BD5\u8981\u6C42
1. \u63A8\u65AD\u8BED\u8A00\uFF0C\u4F7F\u7528\u5BF9\u5E94\u6846\u67B6\uFF08Jest/Vitest/Go test/Pytest\uFF09
2. \u8986\u76D6\uFF1A\u6B63\u5E38\u8DEF\u5F84/\u8FB9\u754C\u503C/\u5F02\u5E38\u60C5\u51B5/\u7A7A\u503C
3. \u6BCF\u4E2A\u6D4B\u8BD5\u6709\u6E05\u6670\u7684 describe/it \u5206\u5C42
4. \u5305\u542B\u5FC5\u8981\u7684 mock/stub
5. \u6D4B\u8BD5\u547D\u540D\u9075\u5FAA AAA \u6A21\u5F0F\uFF08Arrange-Act-Assert\uFF09

\u76F4\u63A5\u8F93\u51FA\u53EF\u8FD0\u884C\u7684\u6D4B\u8BD5\u4EE3\u7801\u3002`;
  }
};
var CommitMsgModal = class extends DevPanelBase {
  constructor(app, plugin) {
    super(app, plugin);
    this.title = "\u63D0\u4EA4\u4FE1\u606F";
    this.emoji = "\u{1F4DD}";
    this.color = "#2980b9";
    this.promptFn = (diff) => `\u8BF7\u6839\u636E\u4EE5\u4E0B git diff \u751F\u6210 Conventional Commits \u683C\u5F0F\u7684\u63D0\u4EA4\u4FE1\u606F\uFF1A

## Git Diff
\`\`\`diff
${diff}
\`\`\`

## \u8F93\u51FA
### \u{1F3AF} \u63A8\u8350\u63D0\u4EA4\u4FE1\u606F
\`\`\`
type(scope): \u7B80\u6D01\u63CF\u8FF0
\`\`\`

### \u{1F4CB} \u63D0\u4EA4\u8BF4\u660E
- **\u7C7B\u578B**: feat/fix/refactor/docs/test/chore/perf
- **\u8303\u56F4**: \u5F71\u54CD\u7684\u6A21\u5757
- **\u53D8\u66F4\u6458\u8981**: 3-5\u6761\u5173\u952E\u53D8\u66F4
- **\u7834\u574F\u6027\u53D8\u66F4**: \u5982\u6709
- **\u5173\u8054 Issue**: \u5EFA\u8BAE\u5173\u8054`;
  }
};
var ConfigGenModal = class extends DevPanelBase {
  constructor(app, plugin) {
    super(app, plugin);
    this.title = "\u914D\u7F6E\u751F\u6210";
    this.emoji = "\u{1F527}";
    this.color = "#8e44ad";
    this.promptFn = (desc) => `\u4F60\u662F DevOps \u4E13\u5BB6\u3002\u6839\u636E\u9700\u6C42\u751F\u6210\u914D\u7F6E\u6587\u4EF6\uFF1A

## \u9700\u6C42
${desc}

## \u4ECE\u4EE5\u4E0B\u7C7B\u578B\u4E2D\u9009\u62E9\u6700\u5408\u9002\u7684\u8F93\u51FA\uFF1A
- Dockerfile\uFF08\u591A\u9636\u6BB5\u6784\u5EFA\uFF09
- docker-compose.yml\uFF08\u542B\u4F9D\u8D56\u670D\u52A1\uFF09
- nginx.conf\uFF08\u53CD\u5411\u4EE3\u7406/SSL/\u7F13\u5B58\uFF09
- k8s deployment + service
- GitHub Actions CI/CD

\u8BF7\u8F93\u51FA\u5B8C\u6574\u53EF\u7528\u7684\u914D\u7F6E\u6587\u4EF6\uFF0C\u5E26\u6CE8\u91CA\u8BF4\u660E\u6BCF\u4E2A\u5173\u952E\u914D\u7F6E\u3002`;
  }
};
var AgentPipelineModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    __publicField(this, "plugin");
    __publicField(this, "resultEl");
    __publicField(this, "loadingEl");
    __publicField(this, "textarea");
    __publicField(this, "running", false);
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.cssText = "display:flex;flex-direction:column;height:100%;padding:16px;";
    contentEl.createEl("h2", { text: "\u{1F517} \u667A\u80FD\u4F53\u5F00\u53D1\u6D41\u6C34\u7EBF" }).style.cssText = "text-align:center;color:#e67e22;margin:0 0 4px 0;font-size:18px;";
    contentEl.createEl("p", { text: "\u8F93\u5165\u9879\u76EE\u76EE\u6807 \u2192 AI \u81EA\u52A8\u89C4\u5212 \u2192 \u9010\u9636\u6BB5\u6267\u884C \u2192 \u5B8C\u6574\u65B9\u6848" }).style.cssText = "color:#888;font-size:12px;text-align:center;margin:0 0 12px 0;";
    this.resultEl = contentEl.createDiv();
    this.resultEl.style.cssText = "flex:1;overflow-y:auto;border:1px solid #ddd;border-radius:8px;padding:12px;background:#fafafa;margin-bottom:12px;min-height:200px;font-size:14px;white-space:pre-wrap;";
    this.loadingEl = this.resultEl.createDiv();
    this.loadingEl.style.cssText = "color:#aaa;text-align:center;padding:40px;display:none;";
    const inputArea = contentEl.createDiv();
    inputArea.style.cssText = "display:flex;flex-direction:column;gap:8px;";
    const ta = new import_obsidian.TextComponent(inputArea).inputEl;
    ta.style.cssText = "width:100%;box-sizing:border-box;padding:12px;font-size:14px;border-radius:8px;border:1px solid #ccc;resize:none;min-height:80px;background:#fff;";
    ta.setAttr("placeholder", "\u63CF\u8FF0\u4F60\u8981\u505A\u7684\u9879\u76EE\uFF0C\u4F8B\u5982\uFF1A\u505A\u4E00\u4E2A\u652F\u6301\u591A\u5E97\u94FA\u7BA1\u7406\u7684 TikTok Shop \u9009\u54C1\u548C\u6570\u636E\u5206\u6790\u7CFB\u7EDF\uFF0C\u524D\u7AEF React \u540E\u7AEF Go...");
    ta.focus();
    this.textarea = ta;
    const btnRow = inputArea.createDiv();
    btnRow.style.cssText = "display:flex;gap:8px;";
    const goBtn = new import_obsidian.ButtonComponent(btnRow);
    goBtn.setButtonText("\u{1F680} \u542F\u52A8\u6D41\u6C34\u7EBF (Ctrl+Enter)");
    goBtn.setCta();
    goBtn.onClick(() => this.runPipeline());
    const saveBtn = new import_obsidian.ButtonComponent(btnRow);
    saveBtn.setButtonText("\u{1F4DD} \u4FDD\u5B58\u5230\u7B14\u8BB0");
    saveBtn.onClick(() => this.saveResult());
    const closeBtn = new import_obsidian.ButtonComponent(btnRow);
    closeBtn.setButtonText("\u5173\u95ED");
    closeBtn.onClick(() => this.close());
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        this.runPipeline();
      }
      if (e.key === "Escape") this.close();
    });
  }
  async runPipeline() {
    const goal = this.textarea.value.trim();
    if (!goal) {
      new import_obsidian.Notice("\u8BF7\u8F93\u5165\u9879\u76EE\u76EE\u6807");
      return;
    }
    if (this.running) {
      new import_obsidian.Notice("\u6D41\u6C34\u7EBF\u6B63\u5728\u8FD0\u884C\u4E2D");
      return;
    }
    this.running = true;
    this.resultEl.setText("");
    this.textarea.value = "";
    this.loadingEl.style.display = "block";
    this.loadingEl.setText("\u{1F9E0} Phase 0: \u5206\u6790\u9700\u6C42\uFF0C\u89C4\u5212\u6D41\u6C34\u7EBF...");
    this.resultEl.scrollTop = this.resultEl.scrollHeight;
    try {
      const planPrompt = `\u4F60\u662F\u9876\u7EA7\u5168\u6808\u67B6\u6784\u5E08\u3002\u7528\u6237\u8981\u505A\u4EE5\u4E0B\u9879\u76EE\uFF0C\u8BF7\u5236\u5B9A\u4E00\u4E2A5\u9636\u6BB5\u5F00\u53D1\u6D41\u6C34\u7EBF\u8BA1\u5212\uFF1A

## \u9879\u76EE\u76EE\u6807
${goal}

## \u8981\u6C42
\u8F93\u51FA\u4E25\u683C\u7684 JSON \u6570\u7EC4\uFF08\u4E0D\u8981\u5176\u4ED6\u5185\u5BB9\uFF09\uFF0C\u6BCF\u4E2A\u9636\u6BB5\u5305\u542B name \u548C prompt\uFF1A
[
  {"name": "\u9636\u6BB5\u540D", "prompt": "\u8BE5\u9636\u6BB5\u7ED9AI\u7684\u5B8C\u6574\u63D0\u793A\u8BCD"},
  ...
]

5\u4E2A\u9636\u6BB5\u5E94\u8986\u76D6\uFF1A
1. \u9700\u6C42\u5206\u6790\u4E0E\u529F\u80FD\u62C6\u89E3
2. \u6280\u672F\u9009\u578B\u4E0E\u7CFB\u7EDF\u67B6\u6784
3. \u6570\u636E\u5E93\u8BBE\u8BA1\u4E0EAPI\u8BBE\u8BA1
4. \u5F00\u53D1\u8DEF\u7EBF\u56FE\u4E0ESprint\u89C4\u5212
5. \u98CE\u9669\u8BC4\u4F30\u4E0E\u5173\u952E\u6280\u672F\u9A8C\u8BC1

\u8BF7\u53EA\u8F93\u51FAJSON\u6570\u7EC4\uFF1A`;
      const planText = await this.plugin.callAI(planPrompt, void 0, false, false, true);
      if (!planText) throw new Error("\u89C4\u5212\u9636\u6BB5\u5931\u8D25");
      const jsonMatch = planText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("\u65E0\u6CD5\u89E3\u6790\u89C4\u5212");
      const pipeline = JSON.parse(jsonMatch[0]);
      this.loadingEl.style.display = "none";
      this.resultEl.setText(`# \u{1F517} \u5F00\u53D1\u6D41\u6C34\u7EBF: ${goal}

`);
      this.resultEl.appendText(`## \u{1F4CB} \u6D41\u6C34\u7EBF\u89C4\u5212 (${pipeline.length} \u9636\u6BB5)
`);
      pipeline.forEach((s, i) => {
        this.resultEl.appendText(`${i + 1}. **${s.name}**
`);
      });
      this.resultEl.appendText(`
---

`);
      this.resultEl.scrollTop = 0;
      for (let i = 0; i < pipeline.length; i++) {
        const stage = pipeline[i];
        this.loadingEl.style.display = "block";
        this.loadingEl.setText(`\u23F3 Phase ${i + 1}/${pipeline.length}: ${stage.name}...`);
        this.resultEl.scrollTop = this.resultEl.scrollHeight;
        const stageText = await this.plugin.callAI(stage.prompt, void 0, false, false, true);
        this.loadingEl.style.display = "none";
        if (stageText) {
          this.resultEl.appendText(`## \u{1F3AF} Phase ${i + 1}: ${stage.name}

${stageText}

---

`);
        } else {
          this.resultEl.appendText(`## \u274C Phase ${i + 1}: ${stage.name} \u2014 \u6267\u884C\u5931\u8D25

---

`);
        }
        this.resultEl.scrollTop = this.resultEl.scrollHeight;
      }
      this.loadingEl.style.display = "block";
      this.loadingEl.setText("\u{1F9E0} \u6700\u7EC8\u5408\u6210\uFF1A\u751F\u6210\u603B\u4F53\u67B6\u6784\u56FE + \u601D\u7EF4\u5BFC\u56FE...");
      this.resultEl.scrollTop = this.resultEl.scrollHeight;
      const synthesisPrompt = `\u57FA\u4E8E\u524D\u9762\u7684\u5206\u6790\uFF0C\u751F\u6210\u9879\u76EE\u603B\u89C8\uFF1A

## \u9879\u76EE
${goal}

## \u8F93\u51FA
### \u{1F3D7}\uFE0F \u603B\u4F53\u67B6\u6784\u56FE\uFF08\u6587\u5B57\u63CF\u8FF0\uFF09
### \u{1F9E0} \u601D\u7EF4\u5BFC\u56FE\uFF08Markdown\u5C42\u7EA7\u7ED3\u6784 ## ### ####\uFF09
### \u{1F4A1} \u6838\u5FC3\u5EFA\u8BAE\uFF083-5\u6761\u6700\u91CD\u8981\u7684\u5EFA\u8BAE\uFF09

\u8BF7\u7B80\u6D01\u8F93\u51FA\uFF1A`;
      const synthText = await this.plugin.callAI(synthesisPrompt, void 0, false, false, true);
      this.loadingEl.style.display = "none";
      if (synthText) {
        this.resultEl.appendText(`## \u{1F3C1} \u6700\u7EC8\u603B\u89C8

${synthText}
`);
      }
      this.loadingEl.setText("\u2705 \u6D41\u6C34\u7EBF\u5B8C\u6210\uFF01");
      new import_obsidian.Notice("\u2705 \u667A\u80FD\u4F53\u6D41\u6C34\u7EBF\u6267\u884C\u5B8C\u6210\uFF01");
      this.resultEl.scrollTop = 0;
    } catch (e) {
      this.loadingEl.style.display = "none";
      this.resultEl.setText(`\u274C \u6D41\u6C34\u7EBF\u4E2D\u65AD: ${e.message}`);
      new import_obsidian.Notice(`\u274C \u6D41\u6C34\u7EBF\u5931\u8D25`);
    } finally {
      this.running = false;
    }
  }
  async saveResult() {
    const text = this.resultEl.getText();
    if (!text || text.startsWith("\u274C")) {
      new import_obsidian.Notice("\u6CA1\u6709\u53EF\u4FDD\u5B58\u7684\u5185\u5BB9");
      return;
    }
    const now = /* @__PURE__ */ new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const fn = `\u5F00\u53D1\u6D41\u6C34\u7EBF_${ts}.md`;
    try {
      await this.plugin.app.vault.create(fn, text);
      new import_obsidian.Notice(`\u2705 \u5DF2\u4FDD\u5B58: ${fn}`);
    } catch (e) {
      new import_obsidian.Notice(`\u4FDD\u5B58\u5931\u8D25: ${e.message}`);
    }
  }
  onClose() {
    this.running = false;
    this.contentEl.empty();
  }
};
