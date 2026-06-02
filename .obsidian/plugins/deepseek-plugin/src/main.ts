import {
    App, Modal, Plugin, Notice, PluginManifest, PluginSettingTab, Setting,
    TextComponent, ButtonComponent, Editor, TFile
} from "obsidian";
const WIKI_DIR = "Wiki";

// ========== 配置接口 ==========
interface PluginSettings {
    provider: "deepseek" | "glm";
    deepseekApiKey: string;
    deepseekModel: string;
    deepseekUrl: string;
    glmApiKey: string;
    glmModel: string;
    glmUrl: string;
    temperature: number;
    maxTokens: number;
}

const DEFAULT_SETTINGS: PluginSettings = {
    provider: "deepseek",
    deepseekApiKey: "sk-e6a62d4c92224761abb59a339f1896ca",
    deepseekModel: "deepseek-chat",
    deepseekUrl: "https://api.deepseek.com/chat/completions",
    glmApiKey: "674fa76fd43a43c996eb363c64add5df.kpaItwOmMK1IkWLX",
    glmModel: "glm-4-flash",
    glmUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    temperature: 0.7,
    maxTokens: 4000,
};

// ========== 主插件 ==========
export default class DeepSeekPlugin extends Plugin {
    settings: PluginSettings;

    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest);
    }

    async onload() {
        await this.loadSettings();

        // 设置面板
        this.addSettingTab(new AISettingTab(this.app, this));

        // 侧边栏按钮 — 根据 provider 显示不同图标
        const icon = this.settings.provider === "glm" ? "brain" : "sparkles";
        this.addRibbonIcon(icon, "AI 助手", () => {
            new DeepSeekModal(this.app, this).open();
        });

        // ========== 基础 AI 命令 ==========
        this.addCommand({
            id: "deepseek-generate",
            name: "AI: 生成内容",
            callback: () => new DeepSeekModal(this.app, this).open()
        });

        this.addCommand({
            id: "deepseek-summarize",
            name: "AI: 总结选中内容",
            editorCallback: (editor) => {
                const sel = editor.getSelection();
                if (!sel) { new Notice("请先选中需要总结的内容"); return; }
                this.callAI(`请总结以下内容，简洁清晰地整理要点：\n\n${sel}`, editor);
            }
        });

        this.addCommand({
            id: "deepseek-improve",
            name: "AI: 润色文字",
            editorCallback: (editor) => {
                const sel = editor.getSelection();
                if (!sel) { new Notice("请先选中需要润色的文字"); return; }
                this.callAI(`请润色并改进以下文字，使其更流畅专业：\n\n${sel}`, editor);
            }
        });

        this.addCommand({
            id: "deepseek-organize",
            name: "AI: 整理当前笔记",
            editorCallback: (editor) => {
                const content = editor.getValue();
                if (!content || content.trim().length < 30) {
                    new Notice("笔记内容太少"); return;
                }
                this.callAI(`请分析以下笔记内容，整理结构、优化格式、补充遗漏要点：\n\n${content}`, editor);
            }
        });

        // ========== LLM Wiki 命令 ==========
        this.addCommand({
            id: "deepseek-wiki-create",
            name: "Wiki: 创建词条",
            callback: () => new WikiCreateModal(this.app, this).open()
        });

        this.addCommand({
            id: "deepseek-wiki-link",
            name: "Wiki: 自动关联词条",
            editorCallback: async (editor) => {
                const content = editor.getValue();
                if (!content) { new Notice("当前笔记为空"); return; }
                await this.wikiAutoLink(content, editor);
            }
        });

        this.addCommand({
            id: "deepseek-wiki-categorize",
            name: "Wiki: 自动分类整理",
            callback: async () => { await this.wikiAutoCategorize(); }
        });

        this.addCommand({
            id: "deepseek-wiki-index",
            name: "Wiki: 生成索引",
            callback: async () => { await this.wikiGenerateIndex(); }
        });

        // ========== 思维导图命令 ==========
        this.addCommand({
            id: "deepseek-mindmap-from-note",
            name: "思维导图: 从当前笔记生成",
            editorCallback: (editor) => {
                const content = editor.getValue();
                if (!content) { new Notice("笔记内容为空"); return; }
                this.callAI(
                    `请将以下笔记内容转换为思维导图格式（Markdown层级结构），只保留核心框架和关键要点：\n要求：使用## ### #### 表示层级，每个节点简洁明了（不超过20字），保持逻辑层次清晰，覆盖所有主要主题。\n\n原始内容：\n${content}`,
                    editor
                );
            }
        });

        // ========== GitHub 项目分析 ==========
        this.addCommand({
            id: "deepseek-github-analyze",
            name: "GitHub: 深度分析项目",
            callback: () => new GithubAnalyzeModal(this.app, this).open()
        });

        // ========== 开发者工具 ==========
        this.addCommand({
            id: "deepseek-code-review",
            name: "Dev: 代码审查",
            callback: () => new CodeReviewModal(this.app, this).open()
        });
        this.addCommand({
            id: "deepseek-tech-design",
            name: "Dev: 技术方案设计",
            callback: () => new TechDesignModal(this.app, this).open()
        });
        this.addCommand({
            id: "deepseek-bug-diagnose",
            name: "Dev: Bug 诊断",
            callback: () => new BugDiagnoseModal(this.app, this).open()
        });
        this.addCommand({
            id: "deepseek-schema-gen",
            name: "Dev: Schema 生成器",
            callback: () => new SchemaGenModal(this.app, this).open()
        });
        this.addCommand({
            id: "deepseek-req-breakdown",
            name: "Dev: 需求拆分",
            callback: () => new ReqBreakdownModal(this.app, this).open()
        });
        this.addCommand({
            id: "deepseek-agent-pipeline",
            name: "Dev: 智能体流水线",
            callback: () => new AgentPipelineModal(this.app, this).open()
        });
        this.addCommand({
            id: "deepseek-code-explain",
            name: "Dev: 代码解说",
            callback: () => new CodeExplainModal(this.app, this).open()
        });
        this.addCommand({
            id: "deepseek-test-gen",
            name: "Dev: 测试生成",
            callback: () => new TestGenModal(this.app, this).open()
        });
        this.addCommand({
            id: "deepseek-commit-msg",
            name: "Dev: 提交信息",
            callback: () => new CommitMsgModal(this.app, this).open()
        });
        this.addCommand({
            id: "deepseek-config-gen",
            name: "Dev: 配置生成",
            callback: () => new ConfigGenModal(this.app, this).open()
        });

        const providerName = this.settings.provider === "glm" ? "GLM-4" : "DeepSeek";
        new Notice(`✅ AI 助手已加载 (${providerName}) | Ctrl+P 搜索 AI/Wiki/GitHub`);
    }

    onunload() {
        new Notice("AI 插件已关闭");
    }

    // ========== 设置管理 ==========
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // ========== 核心 API 调用 ==========
    async callAI(prompt: string, editor?: Editor, saveToVault = true, webSearch = false, expertMode = false): Promise<string | null> {
        const providerName = this.settings.provider === "glm" ? "GLM-4" : "DeepSeek";
        new Notice(`⏳ ${providerName} ${expertMode ? "深度" : ""}思考中...`);

        try {
            let text: string | null = null;

            if (this.settings.provider === "glm") {
                text = await this.callGLM(prompt, webSearch, expertMode);
            } else {
                text = await this.callDeepSeek(prompt, expertMode);
            }

            if (!text) throw new Error("生成结果为空");

            if (editor) {
                editor.replaceSelection(`\n\n${text}\n\n`);
            }

            if (saveToVault) {
                await this.saveToVault(prompt, text);
            }

            new Notice(`✅ 生成完成！`);
            return text;
        } catch (e) {
            new Notice(`❌ 错误: ${(e as Error).message}`);
            return null;
        }
    }

    /** DeepSeek API (OpenAI 兼容格式) */
    async callDeepSeek(prompt: string, expertMode = false): Promise<string | null> {
        const messages: any[] = [];
        if (expertMode) {
            messages.push({
                role: "system",
                content: "你是一位世界级专家，拥有多学科深度知识。请按以下结构思考和回答：\n1. 问题拆解 — 将问题分解为核心子问题\n2. 知识梳理 — 列出分析所需的全部关键知识点\n3. 深度分析 — 对每个子问题进行专家级分析\n4. 综合结论 — 整合所有分析，给出系统性结论\n5. 行动计划 — 提供可执行的下一步建议\n请确保回答专业、精准、有深度。"
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
    async callGLM(prompt: string, webSearch = false, expertMode = false): Promise<string | null> {
        const messages: any[] = [];
        if (expertMode) {
            messages.push({
                role: "system",
                content: "你是一位世界级专家，拥有多学科深度知识。请按以下结构思考和回答：\n1. 问题拆解 — 将问题分解为核心子问题\n2. 知识梳理 — 列出分析所需的全部关键知识点\n3. 深度分析 — 对每个子问题进行专家级分析\n4. 综合结论 — 整合所有分析，给出系统性结论\n5. 行动计划 — 提供可执行的下一步建议\n请确保回答专业、精准、有深度。"
            });
        }
        messages.push({ role: "user", content: prompt });

        const body: any = {
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
    async saveToVault(prompt: string, content: string, filename?: string) {
        const now = new Date();
        const ts = now.toLocaleString("zh-CN");
        const prefix = this.settings.provider === "glm" ? "GLM" : "DS";

        if (!filename) {
            filename = `${prefix}_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}.md`;
        }

        const noteContent = `# AI 生成记录\n\n**时间**: ${ts}\n**模型**: ${this.settings.provider === "glm" ? this.settings.glmModel : this.settings.deepseekModel}\n\n## 提示词\n${prompt}\n\n## 生成内容\n${content}\n`;

        try {
            await this.app.vault.create(filename, noteContent);
            return filename;
        } catch (e) {
            try {
                const existing = await this.app.vault.adapter.read(filename);
                await this.app.vault.modify(
                    this.app.vault.getAbstractFileByPath(filename) as TFile,
                    existing + `\n\n---\n\n${noteContent}`
                );
            } catch (e2) {
                console.error("[AI Plugin] 保存失败:", e2);
            }
        }
        return filename;
    }

    // ========== Wiki 功能 ==========
    async createWikiEntry(topic: string, category: string) {
        new Notice(`⏳ 正在创建 Wiki 词条: ${topic}...`);

        const prompt = `请以 Wiki 百科风格创建一份关于"${topic}"的详细知识条目。\n\n格式要求：\n1. 开头使用 YAML frontmatter (tags, category, created)\n2. 使用 ## 标题分段\n3. 必须包含: 概述、核心概念、详细说明、相关条目、参考资料\n4. 内容专业、准确、全面\n5. 相关条目部分列出 3-5 个可以关联的其他 Wiki 词条名称\n\n分类: ${category || "通用"}\n\n请直接输出完整的 Markdown 内容（包含 frontmatter）：`;

        const text = await this.callAI(prompt, undefined, false);
        if (!text) return null;

        let finalContent = text;
        if (!text.trim().startsWith("---")) {
            const now = new Date().toISOString().split("T")[0];
            finalContent = `---\ntags: [wiki${category ? `, ${category}` : ""}]\ncategory: "${category || "通用"}"\ncreated: ${now}\naliases: []\nrelated: []\n---\n\n${text}`;
        }

        const safeTopic = topic.replace(/[\\/:*?"<>|]/g, "-").substring(0, 60);
        const path = category ? `${WIKI_DIR}/${category}/${safeTopic}.md` : `${WIKI_DIR}/${safeTopic}.md`;

        try {
            const dir = category ? `${WIKI_DIR}/${category}` : WIKI_DIR;
            const dirExists = await this.app.vault.adapter.exists(dir);
            if (!dirExists) { await this.app.vault.createFolder(dir); }

            await this.app.vault.create(path, finalContent);
            new Notice(`✅ Wiki 词条已创建: ${path}`);

            const file = this.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                await this.app.workspace.getLeaf().openFile(file);
            }
        } catch (e) {
            new Notice(`❌ 创建失败: ${(e as Error).message}`);
        }
        return path;
    }

    async wikiAutoLink(content: string, editor: Editor) {
        new Notice("⏳ 分析笔记内容，查找关联词条...");

        const wikiFiles: string[] = [];
        const recurseList = async (dir: string) => {
            try {
                const files = await this.app.vault.adapter.list(dir);
                for (const f of files.files) {
                    if (f.endsWith(".md")) wikiFiles.push(f);
                }
                for (const d of files.folders) { await recurseList(d); }
            } catch { /* ignore */ }
        };

        try { await recurseList(WIKI_DIR); } catch { /* Wiki 目录可能不存在 */ }

        if (wikiFiles.length === 0) {
            new Notice("Wiki 目录为空，请先创建词条");
            return;
        }

        const entryNames = wikiFiles.map(f => {
            const parts = f.replace(/\\/g, "/").split("/");
            return parts[parts.length - 1].replace(".md", "");
        });

        const prompt = `分析以下笔记内容，找出与这些 Wiki 词条相关的链接建议。\n\n已有 Wiki 词条: ${entryNames.join(", ")}\n\n笔记内容:\n${content.substring(0, 3000)}\n\n请以 JSON 数组格式返回建议的关联词条（只返回确实相关的）：\n[{"term": "词条名", "reason": "关联原因（10字以内）"}]`;

        const text = await this.callAI(prompt, undefined, false);
        if (!text) return;

        try {
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const suggestions = JSON.parse(jsonMatch[0]) as Array<{ term: string; reason: string }>;
                if (suggestions.length > 0) {
                    const links = suggestions.map(s => `- [[${s.term}]] — ${s.reason}`).join("\n");
                    editor.replaceSelection(`\n\n## 🔗 相关 Wiki 词条 (AI 建议)\n${links}\n`);
                    new Notice(`✅ 已添加 ${suggestions.length} 个关联词条`);
                }
            }
        } catch {
            editor.replaceSelection(`\n\n## 🔗 相关词条\n${text}\n`);
            new Notice("✅ 已添加关联建议");
        }
    }

    async wikiAutoCategorize() {
        new Notice("⏳ 正在分析 Wiki 词条并自动分类...");

        const wikiFiles: Array<{ path: string; content: string }> = [];
        try {
            const rootFiles = await this.app.vault.adapter.list(WIKI_DIR);
            for (const f of rootFiles.files) {
                if (f.endsWith(".md") && !f.includes("_templates") && !f.includes("_index")) {
                    const c = await this.app.vault.adapter.read(f);
                    wikiFiles.push({ path: f, content: c });
                }
            }
        } catch {
            new Notice("Wiki 目录为空"); return;
        }

        if (wikiFiles.length === 0) {
            new Notice("没有需要分类的 Wiki 词条"); return;
        }

        const entriesInfo = wikiFiles.map(f => {
            const name = f.path.replace(/\\/g, "/").split("/").pop()?.replace(".md", "") || "";
            return `文件: ${name}\n内容预览: ${f.content.substring(0, 300)}`;
        }).join("\n\n---\n\n");

        const text = await this.callAI(
            `分析以下 Wiki 词条，为每个词条建议一个分类目录名（如: 技术/编程语言/Python, 商业/营销, 工具/效率, 学习方法, 项目管理 等）。\n\n${entriesInfo}\n\n请以 JSON 格式返回分类建议：\n[{"file": "词条文件名", "category": "建议的分类路径"}, ...]\n注意：分类名用中文，相似主题归入同一分类，分类层级不超过3层，只返回 JSON 数组`,
            undefined, false
        );
        if (!text) return;

        try {
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) { new Notice("AI 分类结果解析失败"); return; }

            const categories = JSON.parse(jsonMatch[0]) as Array<{ file: string; category: string }>;
            let movedCount = 0;

            for (const item of categories) {
                const oldPath = wikiFiles.find(f => f.path.includes(item.file.replace(".md", "")))?.path;
                if (!oldPath) continue;

                const newDir = `${WIKI_DIR}/${item.category}`;
                const newPath = `${newDir}/${item.file}.md`;

                try {
                    const dirExists = await this.app.vault.adapter.exists(newDir);
                    if (!dirExists) { await this.app.vault.createFolder(newDir); }

                    const file = this.app.vault.getAbstractFileByPath(oldPath);
                    if (file instanceof TFile) {
                        let c = await this.app.vault.read(file);
                        c = c.replace(/category:\s*".*"/, `category: "${item.category}"`);
                        if (!c.includes("category:")) {
                            c = c.replace(/^---\n/, `---\ncategory: "${item.category}"\n`);
                        }
                        await this.app.vault.modify(file, c);
                        await this.app.fileManager.renameFile(file, newPath);
                        movedCount++;
                    }
                } catch (e) {
                    console.error(`移动 ${item.file} 失败:`, e);
                }
            }
            new Notice(`✅ 已分类整理 ${movedCount} 个词条`);
        } catch (e) {
            new Notice(`分类整理出错: ${(e as Error).message}`);
        }
    }

    // ========== GitHub 分析 ==========
    async fetchGithubRepo(url: string): Promise<any> {
        const match = url.match(/github\.com\/([^\/]+)\/([^\/\s#]+)/);
        if (!match) throw new Error("无法解析 GitHub 仓库地址");
        const [_, owner, repo] = match;
        const cleanRepo = repo.replace(/\.git$/, "");

        // Fetch repo info
        const infoResp = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}`, {
            headers: { "Accept": "application/vnd.github.v3+json", "User-Agent": "Obsidian-AI-Plugin" }
        });
        if (!infoResp.ok) throw new Error(`GitHub API 错误: ${infoResp.status}`);
        const info = await infoResp.json();

        // Fetch README
        let readme = "";
        try {
            const readmeResp = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/readme`, {
                headers: { "Accept": "application/vnd.github.v3.raw", "User-Agent": "Obsidian-AI-Plugin" }
            });
            if (readmeResp.ok) readme = await readmeResp.text();
        } catch { /* no readme */ }

        // Fetch repo tree
        let tree = "";
        try {
            const treeResp = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/git/trees/HEAD?recursive=1`, {
                headers: { "Accept": "application/vnd.github.v3+json", "User-Agent": "Obsidian-AI-Plugin" }
            });
            if (treeResp.ok) {
                const treeData = await treeResp.json();
                if (treeData.tree) {
                    tree = treeData.tree
                        .filter((t: any) => t.type === "blob")
                        .map((t: any) => t.path)
                        .slice(0, 200)
                        .join("\n");
                }
            }
        } catch { /* no tree */ }

        return {
            owner, repo: cleanRepo,
            name: info.name, full_name: info.full_name,
            description: info.description || "无描述",
            language: info.language || "未知",
            topics: info.topics || [],
            stars: info.stargazers_count,
            forks: info.forks_count,
            open_issues: info.open_issues_count,
            license: info.license?.spdx_id || "无",
            default_branch: info.default_branch,
            created_at: info.created_at,
            updated_at: info.updated_at,
            readme: readme.substring(0, 5000),
            tree: tree.substring(0, 5000)
        };
    }

    async wikiGenerateIndex() {
        new Notice("⏳ 正在生成 Wiki 索引...");
        const structure: Record<string, string[]> = {};

        const scanDir = async (dir: string) => {
            try {
                const files = await this.app.vault.adapter.list(dir);
                for (const f of files.files) {
                    if (!f.endsWith(".md")) continue;
                    if (f.includes("_templates") || f.includes("_index")) continue;
                    const relative = f.replace(WIKI_DIR + "/", "").replace(WIKI_DIR + "\\", "");
                    const parts = relative.replace(/\\/g, "/").split("/");
                    const cat = parts.length > 1 ? parts.slice(0, -1).join("/") : "未分类";
                    const name = parts[parts.length - 1].replace(".md", "");
                    if (!structure[cat]) structure[cat] = [];
                    structure[cat].push(name);
                }
                for (const d of files.folders) {
                    if (!d.includes("_templates")) { await scanDir(d); }
                }
            } catch { /* ignore */ }
        };

        await scanDir(WIKI_DIR);

        const total = Object.values(structure).reduce((s, a) => s + a.length, 0);
        let indexContent = `---\ntags: [wiki, index]\nauto-generated: true\n---\n\n# 📚 Wiki 知识库索引\n\n> 共 ${total} 个词条，${Object.keys(structure).length} 个分类\n> 更新时间: ${new Date().toLocaleString("zh-CN")}\n\n---\n\n`;

        for (const [cat, entries] of Object.entries(structure).sort()) {
            indexContent += `## 📂 ${cat}\n\n`;
            for (const entry of entries.sort()) {
                const p = cat === "未分类" ? entry : `${cat}/${entry}`;
                indexContent += `- [[${p}|${entry}]]\n`;
            }
            indexContent += "\n";
        }

        const indexPath = `${WIKI_DIR}/_index.md`;
        try {
            const exists = await this.app.vault.adapter.exists(indexPath);
            if (exists) {
                const file = this.app.vault.getAbstractFileByPath(indexPath);
                if (file instanceof TFile) { await this.app.vault.modify(file, indexContent); }
            } else {
                await this.app.vault.create(indexPath, indexContent);
            }
            new Notice(`✅ Wiki 索引已更新: ${total} 个词条`);
        } catch (e) {
            new Notice(`索引生成失败: ${(e as Error).message}`);
        }
    }
}

// ========== 设置面板 ==========
class AISettingTab extends PluginSettingTab {
    plugin: DeepSeekPlugin;

    constructor(app: App, plugin: DeepSeekPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "🤖 AI 模型设置" });

        // Provider 选择
        new Setting(containerEl)
            .setName("模型提供商")
            .setDesc("切换后请重启 Obsidian 生效")
            .addDropdown(dropdown => dropdown
                .addOption("deepseek", "DeepSeek")
                .addOption("glm", "GLM-4 (智谱)")
                .setValue(this.plugin.settings.provider)
                .onChange(async (value: "deepseek" | "glm") => {
                    this.plugin.settings.provider = value;
                    await this.plugin.saveSettings();
                    new Notice(`✅ 已切换至 ${value === "glm" ? "GLM-4 智谱" : "DeepSeek"}，请重启 Obsidian`);
                }));

        // === DeepSeek 设置 ===
        containerEl.createEl("h3", { text: "🔵 DeepSeek 配置" });

        new Setting(containerEl)
            .setName("API Key")
            .setDesc("DeepSeek API 密钥")
            .addText(text => text
                .setPlaceholder("sk-...")
                .setValue(this.plugin.settings.deepseekApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.deepseekApiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("模型名称")
            .setDesc("默认 deepseek-chat")
            .addText(text => text
                .setPlaceholder("deepseek-chat")
                .setValue(this.plugin.settings.deepseekModel)
                .onChange(async (value) => {
                    this.plugin.settings.deepseekModel = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("API 地址")
            .setDesc("OpenAI 兼容接口地址")
            .addText(text => text
                .setPlaceholder("https://api.deepseek.com/chat/completions")
                .setValue(this.plugin.settings.deepseekUrl)
                .onChange(async (value) => {
                    this.plugin.settings.deepseekUrl = value;
                    await this.plugin.saveSettings();
                }));

        // === GLM 设置 ===
        containerEl.createEl("h3", { text: "🟣 GLM-4 智谱配置" });

        new Setting(containerEl)
            .setName("API Key")
            .setDesc("智谱 AI API 密钥 (已预填)")
            .addText(text => text
                .setPlaceholder("xxx.xxxxxxxxxxxxx")
                .setValue(this.plugin.settings.glmApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.glmApiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("模型名称")
            .setDesc("默认 glm-4-flash (免费), 也可用 glm-4.7-flash 或 glm-4-plus")
            .addText(text => text
                .setPlaceholder("glm-4-flash")
                .setValue(this.plugin.settings.glmModel)
                .onChange(async (value) => {
                    this.plugin.settings.glmModel = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("API 地址")
            .setDesc("智谱 OpenAI 兼容接口 (国内直连)")
            .addText(text => text
                .setPlaceholder("https://open.bigmodel.cn/api/paas/v4/chat/completions")
                .setValue(this.plugin.settings.glmUrl)
                .onChange(async (value) => {
                    this.plugin.settings.glmUrl = value;
                    await this.plugin.saveSettings();
                }));

        // === 通用设置 ===
        containerEl.createEl("h3", { text: "⚙️ 通用设置" });

        new Setting(containerEl)
            .setName("Temperature")
            .setDesc(`创造性程度 (当前: ${this.plugin.settings.temperature})`)
            .addSlider(slider => slider
                .setLimits(0, 2, 0.1)
                .setValue(this.plugin.settings.temperature)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.temperature = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("最大输出 Token")
            .setDesc("单次生成的最大长度")
            .addText(text => text
                .setPlaceholder("4000")
                .setValue(String(this.plugin.settings.maxTokens))
                .onChange(async (value) => {
                    const n = parseInt(value);
                    if (!isNaN(n) && n > 0) {
                        this.plugin.settings.maxTokens = n;
                        await this.plugin.saveSettings();
                    }
                }));
    }
}

// ========== AI 对话面板 ==========
class DeepSeekModal extends Modal {
    plugin: DeepSeekPlugin;
    resultEl: HTMLElement;
    loadingEl: HTMLElement;
    textarea: HTMLTextAreaElement;
    webSearchCb: HTMLInputElement;
    expertCb: HTMLInputElement;

    constructor(app: App, plugin: DeepSeekPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.style.cssText = "display:flex;flex-direction:column;height:100%;padding:16px;";

        const providerName = this.plugin.settings.provider === "glm" ? "GLM-4" : "DeepSeek";
        const modelName = this.plugin.settings.provider === "glm" ? this.plugin.settings.glmModel : this.plugin.settings.deepseekModel;

        contentEl.createEl("h2", { text: `🤖 ${providerName} AI 助手` }).style.cssText =
            "text-align:center;color:#4a9eff;margin:0 0 4px 0;font-size:18px;";
        contentEl.createEl("p", { text: `模型: ${modelName} | Ctrl+Enter 发送` }).style.cssText =
            "color:#888;font-size:12px;text-align:center;margin:0 0 12px 0;";

        // 结果展示区
        this.resultEl = contentEl.createDiv();
        this.resultEl.style.cssText =
            "flex:1;overflow-y:auto;border:1px solid #ddd;border-radius:8px;padding:12px;background:#fafafa;margin-bottom:12px;min-height:150px;font-size:14px;white-space:pre-wrap;";

        this.loadingEl = this.resultEl.createDiv();
        this.loadingEl.style.cssText = "color:#aaa;text-align:center;padding:40px;display:none;";
        this.loadingEl.setText("⏳ AI 思考中...");

        // 输入区
        const inputArea = contentEl.createDiv();
        inputArea.style.cssText = "display:flex;flex-direction:column;gap:8px;";

        const ta = new TextComponent(inputArea).inputEl;
        ta.style.cssText =
            "width:100%;box-sizing:border-box;padding:12px;font-size:14px;border-radius:8px;border:1px solid #ccc;resize:none;min-height:80px;background:#fff;";
        ta.setAttr("placeholder", "输入你的问题，例如：帮我写一份电商促销计划书...");
        ta.focus();
        this.textarea = ta;

        // 选项行：联网搜索 + 按钮
        const optRow = inputArea.createDiv();
        optRow.style.cssText = "display:flex;align-items:center;gap:12px;flex-wrap:wrap;";

        const cbLabel = optRow.createEl("label");
        cbLabel.style.cssText = "display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;color:#666;";
        this.webSearchCb = cbLabel.createEl("input");
        this.webSearchCb.type = "checkbox";
        this.webSearchCb.style.cssText = "cursor:pointer;";
        this.webSearchCb.checked = false;
        cbLabel.appendText("🌐 联网搜索");

        const expertLabel = optRow.createEl("label");
        expertLabel.style.cssText = "display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;color:#e67e22;";
        this.expertCb = expertLabel.createEl("input");
        this.expertCb.type = "checkbox";
        this.expertCb.style.cssText = "cursor:pointer;";
        this.expertCb.checked = false;
        expertLabel.appendText("🧠 专家模式");

        const btnRow = optRow.createDiv();
        btnRow.style.cssText = "display:flex;gap:6px;margin-left:auto;";

        const genBtn = new ButtonComponent(btnRow);
        genBtn.setButtonText("🚀 发送 (Ctrl+Enter)");
        genBtn.setCta();
        genBtn.onClick(() => this.doGenerate());

        const insertBtn = new ButtonComponent(btnRow);
        insertBtn.setButtonText("📝 插入到笔记");
        insertBtn.onClick(() => this.insertToNote());

        const clearBtn = new ButtonComponent(btnRow);
        clearBtn.setButtonText("🗑 清空");
        clearBtn.onClick(() => { this.resultEl.setText(""); });

        const cancelBtn = new ButtonComponent(btnRow);
        cancelBtn.setButtonText("关闭");
        cancelBtn.onClick(() => this.close());

        ta.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); this.doGenerate(); }
            if (e.key === "Escape") this.close();
        });
    }

    async doGenerate() {
        const prompt = this.textarea.value.trim();
        if (!prompt) { new Notice("请输入问题"); return; }
        this.textarea.value = "";
        this.textarea.setAttr("placeholder", "继续输入...");

        const webSearch = this.webSearchCb?.checked ?? false;
        const expertMode = this.expertCb?.checked ?? false;
        this.loadingEl.style.display = "block";
        this.loadingEl.setText(expertMode ? "🧠 专家深度分析中..." : webSearch ? "🌐 联网搜索中..." : "⏳ AI 思考中...");
        this.resultEl.scrollTop = this.resultEl.scrollHeight;

        try {
            const text = await this.plugin.callAI(prompt, undefined, false, webSearch, expertMode);
            this.loadingEl.style.display = "none";
            if (text) {
                this.resultEl.setText(text);
                this.resultEl.scrollTop = 0;
            } else {
                this.resultEl.setText("❌ 生成结果为空，请重试");
            }
        } catch (e) {
            this.loadingEl.style.display = "none";
            this.resultEl.setText(`❌ 错误: ${(e as Error).message}`);
        }
    }

    insertToNote() {
        const text = this.resultEl.getText();
        if (!text || text.startsWith("❌")) {
            new Notice("没有可插入的内容");
            return;
        }
        const editor = this.app.workspace.activeEditor?.editor;
        if (editor) {
            editor.replaceSelection(`\n\n${text}\n\n`);
            new Notice("✅ 已插入到当前笔记");
        } else {
            new Notice("请先打开一个笔记");
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}

// ========== GitHub 项目分析面板 ==========
class GithubAnalyzeModal extends Modal {
    plugin: DeepSeekPlugin;
    resultEl: HTMLElement;
    loadingEl: HTMLElement;
    urlInput: HTMLInputElement;

    constructor(app: App, plugin: DeepSeekPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.style.cssText = "display:flex;flex-direction:column;height:100%;padding:16px;";

        contentEl.createEl("h2", { text: "🔬 GitHub 项目深度分析" }).style.cssText =
            "text-align:center;color:#e67e22;margin:0 0 4px 0;font-size:18px;";
        contentEl.createEl("p", { text: "输入 GitHub 仓库地址 → AI 自动获取并深度分析" }).style.cssText =
            "color:#888;font-size:12px;text-align:center;margin:0 0 12px 0;";

        // 结果区
        this.resultEl = contentEl.createDiv();
        this.resultEl.style.cssText =
            "flex:1;overflow-y:auto;border:1px solid #ddd;border-radius:8px;padding:12px;background:#fafafa;margin-bottom:12px;min-height:200px;font-size:14px;white-space:pre-wrap;";

        this.loadingEl = this.resultEl.createDiv();
        this.loadingEl.style.cssText = "color:#aaa;text-align:center;padding:40px;display:none;";
        this.loadingEl.setText("⏳ 正在获取 GitHub 仓库信息...");

        // 输入区
        const inputArea = contentEl.createDiv();
        inputArea.style.cssText = "display:flex;gap:8px;";

        const urlTa = new TextComponent(inputArea).inputEl;
        urlTa.style.cssText =
            "flex:1;box-sizing:border-box;padding:12px;font-size:14px;border-radius:8px;border:1px solid #ccc;background:#fff;";
        urlTa.setAttr("placeholder", "https://github.com/用户名/仓库名");
        urlTa.focus();
        this.urlInput = urlTa;

        const goBtn = new ButtonComponent(inputArea);
        goBtn.setButtonText("🔍 开始分析");
        goBtn.setCta();
        goBtn.onClick(() => this.doAnalyze());

        const btnRow = inputArea.createDiv();
        btnRow.style.cssText = "display:flex;gap:6px;";

        const insertBtn = new ButtonComponent(btnRow);
        insertBtn.setButtonText("📝 保存到笔记");
        insertBtn.onClick(() => this.saveToNote());

        const closeBtn = new ButtonComponent(btnRow);
        closeBtn.setButtonText("关闭");
        closeBtn.onClick(() => this.close());

        urlTa.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter") { e.preventDefault(); this.doAnalyze(); }
            if (e.key === "Escape") this.close();
        });
    }

    async doAnalyze() {
        const url = this.urlInput.value.trim();
        if (!url) { new Notice("请输入 GitHub 仓库地址"); return; }
        if (!url.includes("github.com")) { new Notice("请输入有效的 GitHub 地址"); return; }

        this.loadingEl.style.display = "block";
        this.loadingEl.setText("📡 正在获取仓库信息...");
        this.resultEl.scrollTop = this.resultEl.scrollHeight;

        try {
            const repo = await this.plugin.fetchGithubRepo(url);
            this.loadingEl.setText("🧠 专家深度分析中（联网搜索 + 代码分析）...");

            const prompt = `你是一位顶级技术架构师。请对以下 GitHub 开源项目进行全方位深度分析。要求联网搜索获取最新信息。

## 项目信息
- 名称: ${repo.full_name}
- 描述: ${repo.description}
- 语言: ${repo.language}
- 标签: ${repo.topics.join(", ")}
- Stars: ${repo.stars} | Forks: ${repo.forks} | Issues: ${repo.open_issues}
- 许可证: ${repo.license}
- 创建: ${repo.created_at} | 更新: ${repo.updated_at}

## README
${repo.readme || "无 README"}

## 项目文件结构 (前200个文件)
${repo.tree || "无文件树"}

请按以下结构输出深度分析报告（务必详尽专业）：

## 📋 项目概览
简要介绍项目解决了什么问题，目标用户是谁

## 🔧 技术栈分析
- 主要技术栈及选型合理性
- 关键依赖分析
- 架构模式识别

## 🏗️ 架构设计
- 推断的项目架构
- 核心模块和职责
- 数据流和交互方式

## 📊 代码质量评估
- 基于文件结构的代码组织
- 潜在的技术债务

## 🚀 开发路线图建议
- 如果要复刻类似项目，推荐的技术方案
- 最小可行版本(MVP)应包含的功能
- 迭代开发计划（分3个阶段）

## 🧠 思维导图
使用 Markdown 层级结构输出项目的核心架构思维导图（## ### #### 表示层级）

## 💡 关键建议
- 学习这个项目的重点
- 如何在此基础上做出差异化`;

            const text = await this.plugin.callAI(prompt, undefined, false, true, true);
            this.loadingEl.style.display = "none";
            if (text) {
                this.resultEl.setText(text);
                this.resultEl.scrollTop = 0;
            } else {
                this.resultEl.setText("❌ 分析失败，请重试");
            }
        } catch (e) {
            this.loadingEl.style.display = "none";
            this.resultEl.setText(`❌ 错误: ${(e as Error).message}`);
        }
    }

    async saveToNote() {
        const text = this.resultEl.getText();
        if (!text || text.startsWith("❌")) { new Notice("没有可保存的内容"); return; }
        const repoName = this.urlInput.value.trim().split("github.com/")[1]?.replace(/\/$/, "") || "analysis";
        const now = new Date();
        const filename = `GitHub分析_${repoName.replace(/[\/\\:*?"<>|]/g, "-")}_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}.md`;
        try {
            await this.plugin.app.vault.create(filename, `# 🔬 GitHub 项目分析: ${repoName}\n\n> 分析时间: ${now.toLocaleString("zh-CN")}\n\n${text}`);
            new Notice(`✅ 已保存: ${filename}`);
        } catch (e) {
            new Notice(`保存失败: ${(e as Error).message}`);
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}

// ========== Wiki 创建弹窗 ==========
class WikiCreateModal extends Modal {
    plugin: DeepSeekPlugin;

    constructor(app: App, plugin: DeepSeekPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: "📚 创建 Wiki 词条" }).style.cssText =
            "text-align:center;color:#4a9eff;margin-bottom:4px;";

        contentEl.createEl("p", {
            text: `当前模型: ${this.plugin.settings.provider === "glm" ? this.plugin.settings.glmModel : this.plugin.settings.deepseekModel}`
        }).style.cssText = "color:#888;font-size:13px;text-align:center;margin-bottom:12px;";

        contentEl.createEl("label", { text: "词条名称" }).style.cssText =
            "font-size:13px;color:#aaa;margin-bottom:4px;display:block;";
        const topicInput = new TextComponent(contentEl).inputEl;
        topicInput.style.cssText =
            "width:100%;box-sizing:border-box;padding:10px;font-size:14px;border-radius:8px;border:1px solid #ccc;margin-bottom:10px;background:#f9f9f9;";
        topicInput.setAttr("placeholder", "例如：Python, React Hooks, 项目管理...");
        topicInput.focus();

        contentEl.createEl("label", { text: "分类（可选）" }).style.cssText =
            "font-size:13px;color:#aaa;margin-bottom:4px;display:block;";
        const catInput = new TextComponent(contentEl).inputEl;
        catInput.style.cssText =
            "width:100%;box-sizing:border-box;padding:10px;font-size:14px;border-radius:8px;border:1px solid #ccc;margin-bottom:14px;background:#f9f9f9;";
        catInput.setAttr("placeholder", "例如：技术/编程语言 或留空自动分类");

        const btnRow = contentEl.createDiv();
        btnRow.style.cssText = "display:flex;gap:8px;margin-bottom:8px;";

        const createBtn = new ButtonComponent(btnRow);
        createBtn.setButtonText("🚀 创建词条");
        createBtn.setCta();
        createBtn.onClick(() => this.handleCreate(topicInput.value.trim(), catInput.value.trim()));

        const cancelBtn = new ButtonComponent(btnRow);
        cancelBtn.setButtonText("取消");
        cancelBtn.onClick(() => this.close());

        topicInput.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter" && !e.ctrlKey && !e.shiftKey) { catInput.focus(); e.preventDefault(); }
            if (e.key === "Escape") this.close();
        });
        catInput.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter" && !e.ctrlKey && !e.shiftKey) {
                this.handleCreate(topicInput.value.trim(), catInput.value.trim());
            }
            if (e.key === "Escape") this.close();
        });
    }

    async handleCreate(topic: string, category: string) {
        if (!topic) { new Notice("请输入词条名称"); return; }
        this.close();
        await this.plugin.createWikiEntry(topic, category);
    }

    onClose() {
        this.contentEl.empty();
    }
}

// ========== 通用开发者面板基类 ==========
class DevPanelBase extends Modal {
    plugin: DeepSeekPlugin;
    resultEl: HTMLElement;
    loadingEl: HTMLElement;
    textarea: HTMLTextAreaElement;
    title: string = ""; emoji: string = ""; color: string = "";
    promptFn: (input: string) => string = () => "";

    constructor(app: App, plugin: DeepSeekPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.style.cssText = "display:flex;flex-direction:column;height:100%;padding:16px;";
        contentEl.createEl("h2", { text: `${this.emoji} ${this.title}` }).style.cssText =
            `text-align:center;color:${this.color};margin:0 0 12px 0;font-size:18px;`;

        this.resultEl = contentEl.createDiv();
        this.resultEl.style.cssText =
            "flex:1;overflow-y:auto;border:1px solid #ddd;border-radius:8px;padding:12px;background:#fafafa;margin-bottom:12px;min-height:150px;font-size:14px;white-space:pre-wrap;";
        this.loadingEl = this.resultEl.createDiv();
        this.loadingEl.style.cssText = "color:#aaa;text-align:center;padding:40px;display:none;";
        this.loadingEl.setText("🧠 专家分析中...");

        const inputArea = contentEl.createDiv();
        inputArea.style.cssText = "display:flex;flex-direction:column;gap:8px;";

        const ta = new TextComponent(inputArea).inputEl;
        ta.style.cssText =
            "width:100%;box-sizing:border-box;padding:12px;font-size:14px;border-radius:8px;border:1px solid #ccc;resize:vertical;min-height:100px;background:#fff;";
        ta.setAttr("placeholder", "在此输入...");
        ta.focus();
        this.textarea = ta;

        const btnRow = inputArea.createDiv();
        btnRow.style.cssText = "display:flex;gap:8px;";

        const goBtn = new ButtonComponent(btnRow);
        goBtn.setButtonText("🚀 分析 (Ctrl+Enter)");
        goBtn.setCta();
        goBtn.onClick(() => this.doAnalyze());

        const insertBtn = new ButtonComponent(btnRow);
        insertBtn.setButtonText("📝 保存到笔记");
        insertBtn.onClick(() => this.saveToNote());

        const closeBtn = new ButtonComponent(btnRow);
        closeBtn.setButtonText("关闭");
        closeBtn.onClick(() => this.close());

        ta.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); this.doAnalyze(); }
            if (e.key === "Escape") this.close();
        });
    }

    async doAnalyze() {
        const input = this.textarea.value.trim();
        if (!input) { new Notice("请输入内容"); return; }
        this.loadingEl.style.display = "block";
        this.resultEl.scrollTop = this.resultEl.scrollHeight;
        try {
            const prompt = this.promptFn(input);
            const text = await this.plugin.callAI(prompt, undefined, false, false, true);
            this.loadingEl.style.display = "none";
            if (text) {
                this.resultEl.setText(text);
                this.resultEl.scrollTop = 0;
            } else {
                this.resultEl.setText("❌ 分析失败，请重试");
            }
        } catch (e) {
            this.loadingEl.style.display = "none";
            this.resultEl.setText(`❌ 错误: ${(e as Error).message}`);
        }
    }

    async saveToNote() {
        const text = this.resultEl.getText();
        if (!text || text.startsWith("❌")) { new Notice("没有可保存的内容"); return; }
        const now = new Date();
        const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}`;
        const fn = `${this.title}_${ts}.md`;
        try {
            await this.plugin.app.vault.create(fn, `# ${this.emoji} ${this.title}\n\n> 时间: ${now.toLocaleString("zh-CN")}\n\n${text}`);
            new Notice(`✅ 已保存: ${fn}`);
        } catch (e) {
            new Notice(`保存失败: ${(e as Error).message}`);
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}

// ========== 代码审查 ==========
class CodeReviewModal extends DevPanelBase {
    constructor(app: App, plugin: DeepSeekPlugin) {
        super(app, plugin);
        this.title = "代码审查"; this.emoji = "🔍"; this.color = "#3498db";
        this.promptFn = (code: string) => `你是资深代码审查专家。请对以下代码进行全面审查：

## 审查代码
\`\`\`
${code}
\`\`\`

## 审查要求
1. 🔴 安全问题 — 注入/泄漏/XSS/权限
2. 🟡 性能瓶颈 — 复杂度/冗余计算/内存
3. 🟢 设计模式 — SOLID/职责划分/可维护性
4. 📝 改进建议 — 逐条代码示例 (P0紧急/P1重要/P2优化)`;
    }
}

// ========== 技术方案设计 ==========
class TechDesignModal extends DevPanelBase {
    constructor(app: App, plugin: DeepSeekPlugin) {
        super(app, plugin);
        this.title = "技术方案设计"; this.emoji = "📐"; this.color = "#9b59b6";
        this.promptFn = (req: string) => `你是顶级系统架构师。请根据需求输出完整技术方案：

## 需求
${req}

## 输出结构
1. 🎯 需求理解 — 目标/用户/约束
2. 🏗️ 系统架构 — 模块职责/数据流
3. 🗄️ 数据库设计 — DDL/索引/分区
4. 🔌 API 设计 — 路径/参数/返回值/鉴权
5. 🛠️ 技术选型 — 推荐栈及对比理由
6. 📅 分阶段开发计划 (每阶段2周)`;
    }
}

// ========== Bug 诊断 ==========
class BugDiagnoseModal extends DevPanelBase {
    constructor(app: App, plugin: DeepSeekPlugin) {
        super(app, plugin);
        this.title = "Bug 诊断"; this.emoji = "🐛"; this.color = "#e74c3c";
        this.promptFn = (input: string) => `你是资深调试专家。请诊断以下 Bug：

## 错误信息
${input}

## 诊断要求
1. 🔍 症状分析 — 发生了什么
2. 🎯 根因定位 — 最可能原因（排序）
3. 🔧 修复方案 — 代码级别的修复
4. 🛡️ 预防措施 — 如何避免复现`;
    }
}

// ========== Schema 生成器 ==========
class SchemaGenModal extends DevPanelBase {
    constructor(app: App, plugin: DeepSeekPlugin) {
        super(app, plugin);
        this.title = "Schema 生成"; this.emoji = "🧾"; this.color = "#1abc9c";
        this.promptFn = (desc: string) => `你是数据库设计专家。根据描述生成 Schema：

## 业务描述
${desc}

## 输出
### 🗄️ DDL (SQL)
\`\`\`sql
-- 完整建表语句
\`\`\`

### 📊 ER 关系说明

### 🔌 API 接口 (路径/方法/参数/返回)

### 📡 TypeScript 类型定义
\`\`\`typescript
// interface 定义
\`\`\``;
    }
}

// ========== 需求拆分 ==========
class ReqBreakdownModal extends DevPanelBase {
    constructor(app: App, plugin: DeepSeekPlugin) {
        super(app, plugin);
        this.title = "需求拆分"; this.emoji = "📊"; this.color = "#f39c12";
        this.promptFn = (req: string) => `你是资深技术项目经理。将以下需求拆分为 Scrum 开发计划：

## 功能需求
${req}

## 输出
### 🎯 Epic — 一句话核心价值
### 📋 Story 列表（每个含：标题/验收标准/技术要点/预估工时）
### 📅 Sprint 规划 (3个Sprint，每个2周)
### ⚠️ 风险 & 依赖`;
    }
}

// ========== 代码解说 ==========
class CodeExplainModal extends DevPanelBase {
    constructor(app: App, plugin: DeepSeekPlugin) {
        super(app, plugin);
        this.title = "代码解说"; this.emoji = "💬"; this.color = "#2ecc71";
        this.promptFn = (code: string) => `你是编程导师。请逐行解说以下代码：

## 代码
\`\`\`
${code}
\`\`\`

## 解说要求
### 🎯 整体作用 — 这段代码干什么
### 🔍 逐行解说 — 每行/每段的逻辑
### 🧩 关键模式 — 用到的设计模式/算法
### ⚡ 执行流程 — 调用链/数据流
### 📌 易错点 — 值得注意的坑`;
    }
}

// ========== 测试生成 ==========
class TestGenModal extends DevPanelBase {
    constructor(app: App, plugin: DeepSeekPlugin) {
        super(app, plugin);
        this.title = "测试生成"; this.emoji = "🧪"; this.color = "#27ae60";
        this.promptFn = (code: string) => `你是测试专家。为以下代码生成完整单元测试：

## 代码
\`\`\`
${code}
\`\`\`

## 测试要求
1. 推断语言，使用对应框架（Jest/Vitest/Go test/Pytest）
2. 覆盖：正常路径/边界值/异常情况/空值
3. 每个测试有清晰的 describe/it 分层
4. 包含必要的 mock/stub
5. 测试命名遵循 AAA 模式（Arrange-Act-Assert）

直接输出可运行的测试代码。`;
    }
}

// ========== 提交信息 ==========
class CommitMsgModal extends DevPanelBase {
    constructor(app: App, plugin: DeepSeekPlugin) {
        super(app, plugin);
        this.title = "提交信息"; this.emoji = "📝"; this.color = "#2980b9";
        this.promptFn = (diff: string) => `请根据以下 git diff 生成 Conventional Commits 格式的提交信息：

## Git Diff
\`\`\`diff
${diff}
\`\`\`

## 输出
### 🎯 推荐提交信息
\`\`\`
type(scope): 简洁描述
\`\`\`

### 📋 提交说明
- **类型**: feat/fix/refactor/docs/test/chore/perf
- **范围**: 影响的模块
- **变更摘要**: 3-5条关键变更
- **破坏性变更**: 如有
- **关联 Issue**: 建议关联`;
    }
}

// ========== 配置生成 ==========
class ConfigGenModal extends DevPanelBase {
    constructor(app: App, plugin: DeepSeekPlugin) {
        super(app, plugin);
        this.title = "配置生成"; this.emoji = "🔧"; this.color = "#8e44ad";
        this.promptFn = (desc: string) => `你是 DevOps 专家。根据需求生成配置文件：

## 需求
${desc}

## 从以下类型中选择最合适的输出：
- Dockerfile（多阶段构建）
- docker-compose.yml（含依赖服务）
- nginx.conf（反向代理/SSL/缓存）
- k8s deployment + service
- GitHub Actions CI/CD

请输出完整可用的配置文件，带注释说明每个关键配置。`;
    }
}

// ========== 智能体流水线 ==========
class AgentPipelineModal extends Modal {
    plugin: DeepSeekPlugin;
    resultEl: HTMLElement;
    loadingEl: HTMLElement;
    textarea: HTMLTextAreaElement;
    running = false;

    constructor(app: App, plugin: DeepSeekPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.style.cssText = "display:flex;flex-direction:column;height:100%;padding:16px;";
        contentEl.createEl("h2", { text: "🔗 智能体开发流水线" }).style.cssText =
            "text-align:center;color:#e67e22;margin:0 0 4px 0;font-size:18px;";
        contentEl.createEl("p", { text: "输入项目目标 → AI 自动规划 → 逐阶段执行 → 完整方案" }).style.cssText =
            "color:#888;font-size:12px;text-align:center;margin:0 0 12px 0;";

        this.resultEl = contentEl.createDiv();
        this.resultEl.style.cssText =
            "flex:1;overflow-y:auto;border:1px solid #ddd;border-radius:8px;padding:12px;background:#fafafa;margin-bottom:12px;min-height:200px;font-size:14px;white-space:pre-wrap;";
        this.loadingEl = this.resultEl.createDiv();
        this.loadingEl.style.cssText = "color:#aaa;text-align:center;padding:40px;display:none;";

        const inputArea = contentEl.createDiv();
        inputArea.style.cssText = "display:flex;flex-direction:column;gap:8px;";

        const ta = new TextComponent(inputArea).inputEl;
        ta.style.cssText =
            "width:100%;box-sizing:border-box;padding:12px;font-size:14px;border-radius:8px;border:1px solid #ccc;resize:none;min-height:80px;background:#fff;";
        ta.setAttr("placeholder", "描述你要做的项目，例如：做一个支持多店铺管理的 TikTok Shop 选品和数据分析系统，前端 React 后端 Go...");
        ta.focus();
        this.textarea = ta;

        const btnRow = inputArea.createDiv();
        btnRow.style.cssText = "display:flex;gap:8px;";

        const goBtn = new ButtonComponent(btnRow);
        goBtn.setButtonText("🚀 启动流水线 (Ctrl+Enter)");
        goBtn.setCta();
        goBtn.onClick(() => this.runPipeline());

        const saveBtn = new ButtonComponent(btnRow);
        saveBtn.setButtonText("📝 保存到笔记");
        saveBtn.onClick(() => this.saveResult());

        const closeBtn = new ButtonComponent(btnRow);
        closeBtn.setButtonText("关闭");
        closeBtn.onClick(() => this.close());

        ta.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); this.runPipeline(); }
            if (e.key === "Escape") this.close();
        });
    }

    async runPipeline() {
        const goal = this.textarea.value.trim();
        if (!goal) { new Notice("请输入项目目标"); return; }
        if (this.running) { new Notice("流水线正在运行中"); return; }
        this.running = true;
        this.resultEl.setText("");
        this.textarea.value = "";

        // Stage 0: Planning
        this.loadingEl.style.display = "block";
        this.loadingEl.setText("🧠 Phase 0: 分析需求，规划流水线...");
        this.resultEl.scrollTop = this.resultEl.scrollHeight;

        try {
            const planPrompt = `你是顶级全栈架构师。用户要做以下项目，请制定一个5阶段开发流水线计划：

## 项目目标
${goal}

## 要求
输出严格的 JSON 数组（不要其他内容），每个阶段包含 name 和 prompt：
[
  {"name": "阶段名", "prompt": "该阶段给AI的完整提示词"},
  ...
]

5个阶段应覆盖：
1. 需求分析与功能拆解
2. 技术选型与系统架构
3. 数据库设计与API设计
4. 开发路线图与Sprint规划
5. 风险评估与关键技术验证

请只输出JSON数组：`;

            const planText = await this.plugin.callAI(planPrompt, undefined, false, false, true);
            if (!planText) throw new Error("规划阶段失败");

            const jsonMatch = planText.match(/\[[\s\S]*\]/);
            if (!jsonMatch) throw new Error("无法解析规划");
            const pipeline = JSON.parse(jsonMatch[0]) as Array<{ name: string; prompt: string }>;

            this.loadingEl.style.display = "none";
            this.resultEl.setText(`# 🔗 开发流水线: ${goal}\n\n`);
            this.resultEl.appendText(`## 📋 流水线规划 (${pipeline.length} 阶段)\n`);
            pipeline.forEach((s, i) => {
                this.resultEl.appendText(`${i + 1}. **${s.name}**\n`);
            });
            this.resultEl.appendText(`\n---\n\n`);
            this.resultEl.scrollTop = 0;

            // Execute each stage
            for (let i = 0; i < pipeline.length; i++) {
                const stage = pipeline[i];
                this.loadingEl.style.display = "block";
                this.loadingEl.setText(`⏳ Phase ${i + 1}/${pipeline.length}: ${stage.name}...`);
                this.resultEl.scrollTop = this.resultEl.scrollHeight;

                const stageText = await this.plugin.callAI(stage.prompt, undefined, false, false, true);
                this.loadingEl.style.display = "none";

                if (stageText) {
                    this.resultEl.appendText(`## 🎯 Phase ${i + 1}: ${stage.name}\n\n${stageText}\n\n---\n\n`);
                } else {
                    this.resultEl.appendText(`## ❌ Phase ${i + 1}: ${stage.name} — 执行失败\n\n---\n\n`);
                }
                this.resultEl.scrollTop = this.resultEl.scrollHeight;
            }

            // Final synthesis
            this.loadingEl.style.display = "block";
            this.loadingEl.setText("🧠 最终合成：生成总体架构图 + 思维导图...");
            this.resultEl.scrollTop = this.resultEl.scrollHeight;

            const synthesisPrompt = `基于前面的分析，生成项目总览：

## 项目
${goal}

## 输出
### 🏗️ 总体架构图（文字描述）
### 🧠 思维导图（Markdown层级结构 ## ### ####）
### 💡 核心建议（3-5条最重要的建议）

请简洁输出：`;

            const synthText = await this.plugin.callAI(synthesisPrompt, undefined, false, false, true);
            this.loadingEl.style.display = "none";
            if (synthText) {
                this.resultEl.appendText(`## 🏁 最终总览\n\n${synthText}\n`);
            }

            this.loadingEl.setText("✅ 流水线完成！");
            new Notice("✅ 智能体流水线执行完成！");
            this.resultEl.scrollTop = 0;

        } catch (e) {
            this.loadingEl.style.display = "none";
            this.resultEl.setText(`❌ 流水线中断: ${(e as Error).message}`);
            new Notice(`❌ 流水线失败`);
        } finally {
            this.running = false;
        }
    }

    async saveResult() {
        const text = this.resultEl.getText();
        if (!text || text.startsWith("❌")) { new Notice("没有可保存的内容"); return; }
        const now = new Date();
        const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}`;
        const fn = `开发流水线_${ts}.md`;
        try {
            await this.plugin.app.vault.create(fn, text);
            new Notice(`✅ 已保存: ${fn}`);
        } catch (e) {
            new Notice(`保存失败: ${(e as Error).message}`);
        }
    }

    onClose() {
        this.running = false;
        this.contentEl.empty();
    }
}
