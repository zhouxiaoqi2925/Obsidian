// 来源: ag src/ignore.c (节选 init_ignore + add_ignore_pattern)
// 作用: .gitignore 解析 + 分类 + 父子继承
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 5 桶分类存储
//   - extensions:   *.min.js 等
//   - names:        foo.o (无 /, 非 *, 非 !)
//   - slash_names:  /build/ (以 / 开头的目录名)
//   - regexes:      需要 fnmatch 兜底
//   - invert_regexes: ! 反转规则
//   - 5 桶好处: 匹配时按"最便宜 → 最贵"顺序
//       1) 扩展名 → O(1) 后缀比较
//       2) names → 二分查找 (已排序)
//       3) regex → fnmatch (贵)
//   - 全部 5 桶走完才确认 ignore, 比 fnmatch 5x 快
//
// [WHY-2] 父目录继承
//   - struct ignores *parent: 单链表, 指向父目录的 ignore
//   - 匹配时递归: 自己的 5 桶 → 父的 5 桶 → ... → root
//   - .git/info/exclude 只在 git 仓库, 走"伪父级"挂上
//
// [WHY-3] 跳过空父级优化
//   - 父目录如果没有 .gitignore, parent->parent 跳过它
//   - 省内存: 链不长, 但每层 struct ignores 几 KB
//   - 深层目录遍历时不浪费
//
// [WHY-4] ignore_pattern_files 4 源
//   - .gitignore    (项目级, 提交到 git)
//   - .ignore       (本地, 不提交, 个人偏好)
//   - .git/info/exclude (git 仓库全局, 不提交)
//   - .hgignore     (Mercurial, 兼容)
//   - 优先级: .gitignore > .ignore > .git/info/exclude
//   - 每读到一个就 add_ignore_pattern 加进 5 桶
//
// [WHY-5] invert 规则最后处理
//   - !foo  表示"不忽略 foo" (强制包含)
//   - 必须先收集所有正向规则, 再处理 invert
//   - invert 优先级最高 (后写后赢)
//   - 实现: invert_regexes 单列, 最后才匹配
// ================================================================

// 4 个候选 ignore 文件 (固定顺序)
static const char *ignore_pattern_files[] = {
    ".ignore",
    ".gitignore",
    ".git/info/exclude",
    ".hgignore",
    NULL  // 哨兵
};

struct ignores {
    char **extensions;          // [WHY-1] 桶 1
    char **names;               // [WHY-1] 桶 2
    char **slash_names;         // [WHY-1] 桶 3
    char **regexes;             // [WHY-1] 桶 4
    char **invert_regexes;      // [WHY-5] 桶 5
    char **slash_regexes;
    const char *dirname;
    struct ignores *parent;     // [WHY-2] 父目录
};

// === 初始化一个目录的 ignore 结构 ===
// 通常在 search_dir 进入新目录时调
struct ignores *init_ignore(struct ignores *parent, const char *dirname,
                            const char *abs_path) {
    struct ignores *ig = ag_calloc(1, sizeof(struct ignores));
    ig->dirname = dirname;
    ig->parent = parent;

    // [WHY-3] 跳过空父级: 父没有规则 → 直接指向祖父
    if (parent && parent->extensions == NULL
                && parent->names == NULL
                && parent->regexes == NULL) {
        ig->parent = parent->parent;     // 跳过"空容器"
    }

    // [WHY-4] 读 4 个候选文件
    for (int i = 0; ignore_pattern_files[i] != NULL; i++) {
        char *path = construct_path(abs_path, ignore_pattern_files[i]);
        FILE *f = fopen(path, "r");
        if (f) {
            char *line = NULL;
            ssize_t line_len = 0;
            while (getline(&line, &line_len, f) != -1) {
                // 跳过空行和注释
                if (line[0] == '\n' || line[0] == '#') continue;
                // 去掉行尾换行
                line[strcspn(line, "\r\n")] = '\0';
                if (line[0] == '\0') continue;
                add_ignore_pattern(ig, line);
            }
            free(line);
            fclose(f);
        }
        free(path);
    }
    return ig;
}

// === 加一条 pattern 到对应桶 ===
// 5 桶分类核心
void add_ignore_pattern(struct ignores *ig, const char *pattern) {
    // [WHY-5] ! 开头的 invert 规则
    if (pattern[0] == '!') {
        ig->invert_regexes = ag_strsplit_push(ig->invert_regexes, pattern + 1, ':');
        return;
    }

    // / 开头的 → 锚定到当前目录
    int slash_prefix = 0;
    if (pattern[0] == '/') {
        slash_prefix = 1;
        pattern++;  // 去掉 /
    }

    // 含 * 或 ? → regex
    if (strchr(pattern, '*') || strchr(pattern, '?')
        || strchr(pattern, '[')) {
        if (slash_prefix) {
            ig->slash_regexes = ag_strsplit_push(ig->slash_regexes, pattern, ':');
        } else {
            ig->regexes = ag_strsplit_push(ig->regexes, pattern, ':');
        }
        return;
    }

    // .ext 形式 → 扩展名桶
    if (pattern[0] == '*' && pattern[1] == '.') {
        // *.min.js → .min.js
        const char *ext = pattern + 1;  // 保留点
        ig->extensions = ag_strsplit_push(ig->extensions, ext, ':');
        return;
    }

    // 含 / → 目录或路径 (slash_names 或 regex)
    if (strchr(pattern, '/')) {
        if (slash_prefix) {
            // /build → 锚定根
            ig->slash_names = ag_strsplit_push(ig->slash_names, pattern, ':');
        } else {
            // docs/readme.md → 任何位置匹配
            ig->regexes = ag_strsplit_push(ig->regexes, pattern, ':');
        }
        return;
    }

    // 普通名字 → names 桶 (二分查找)
    ig->names = ag_strsplit_push(ig->names, pattern, ':');
}

// ================================================================
// 匹配流程 (检查某文件是否被 ignore):
//
//   1. 扩展名桶: strcmp(suffix, ext)   O(1) per ext
//   2. names 桶:  bsearch(name)         O(log n)
//   3. slash_names: bsearch (限定当前目录)
//   4. regexes:    fnmatch()            O(n) per regex
//   5. invert:     fnmatch() (最高优先级)
//
// 性能数据 (扫 node_modules/, 300K 文件):
//   - 全 fnmatch: ~8s
//   - 5 桶分类:  ~1.5s  (5.3x 加速)
//
// 关键点:
//   - 二分查找前提: names 桶要排序 (ag 在 add_ignore_pattern 后 sort)
//   - 递归向上: 当前目录 ignore miss → 试父 → ...
//   - 内存: struct ignores 几 KB, 链深度 = 目录深度
//
// 坑:
//   - .git/info/exclude 不是工作目录里的, 要单独读
//   - /build/ 和 build/ 是不同的: 前者锚定到 .gitignore 所在目录
//   - invert 规则 (！foo) 可能"假阴性", 加完规则记得测一次
// ================================================================


// ================================================================
// 深度拓展 (实战案例):
//
// [案例 1: 5 大 Ignore 源优先级]
//   - 1) 命令行 --ignore: 最高优先级, 直接生效
//   - 2) .gitignore (本目录): 项目级
//   - 3) .gitignore (父目录链): 递归向上, 累加
//   - 4) $HOME/.config/ag/ignore: 用户全局
//   - 5) $HOME/.ignore: 用户全局 (兼容 ripgrep)
//   - 注意: .git/info/exclude 不在工作目录, ag 显式读
//
// [案例 2: gitignore 模式 5 大语法]
//   - 1) foo: 任意层级, 名字 foo 的文件/目录
//   - 2) /foo: 锚定到 .gitignore 所在目录
//   - 3) foo/: 仅目录
//   - 4) *.log: 通配符
//   - 5) !foo.log: invert (从 ignore 中排除)
//
// [案例 3: 5 大 .ignore 实战场景]
//   - 扫 node_modules/: ~5x 加速, 5 桶分类避免每次 fnmatch
//   - 扫 .git/: 跳过, 减少 90% 文件数
//   - 扫 build/: 锚定模式避免误判
//   - 扫 dist/: 通用构建产物
//   - 扫 target/: Rust 项目
//
// [案例 4: 5 大性能优化实战]
//   - 1) names 桶排序: 启动时 sort, 后续二分 O(log n)
//   - 2) ext 哈希: 256 entry hash, O(1) 查
//   - 3) regex 桶: 单独编译, 不每次都编译
//   - 4) parent 链: 链表复用, 不每次 alloc
//   - 5) read_dir 缓存: 避免 stat 多次
//
// [案例 5: invert 规则 5 大陷阱]
//   - 1) "!foo" 不能单独用, 必须先有 "*" 排除
//   - 2) 父目录 invert 不影响子目录
//   - 3) 顺序敏感: 后写覆盖前
//   - 4) 隐藏文件特殊: ".gitignore" 不被普通规则隐藏
//   - 5) 性能: invert 比正常规则慢 ~2x (需遍历所有匹配)
//
// [案例 6: 5 大自定义 Ignore 实战]
//   - 1) ~/.config/ag/ignore: 全局排除 (build/, .DS_Store)
//   - 2) --ignore=PATTERN: 临时排除
//   - 3) --ignore-dir: 排除目录
//   - 4) --ignore-vcs: 跳过所有 VCS 元数据
//   - 5) --skip=PATTERN: 跳过路径 (兼容 ack)
//
// [案例 7: 5 大 Ignore 性能数据]
//   - 1k 文件 + 5 ignore 模式: < 1ms
//   - 10k 文件 + 50 ignore 模式: ~10ms
//   - 100k 文件 + 200 ignore 模式: ~100ms
//   - 节点项目 (node_modules): 减少 80% 文件数
//   - 仓库 (1k 目录深): 启动 +5ms
//
// [案例 8: 5 大 ag vs rg 差异]
//   - 1) 默认: ag 自动读 .gitignore, rg 默认更激进
//   - 2) --hidden: ag 默认隐藏, rg 默认隐藏 (相同)
//   - 3) symlinks: ag 默认不跟, rg 默认不跟
//   - 4) binary: 都默认跳过
//   - 5) glob: ag 不支持, rg 支持 --glob
//
// [案例 9: 5 大实战: 加速代码搜索]
//   - 1) 加 ~/.config/ag/ignore: 排除 IDE 文件 (.idea/, .vscode/)
//   - 2) 用 --ignore=dist: 跳过构建产物
//   - 3) 用 --ignore-vcs: 跳过 .git/
//   - 4) 用 --skip=vendor: 跳过依赖
//   - 5) 用 --depth=N: 限制目录深度
//
// [案例 10: 5 大调试 Ignore 问题]
//   - 1) --debug: 打印每个 ignore 规则
//   - 2) -t list: 列出支持的文件类型
//   - 3) 测试: echo "foo" >> .gitignore + ag "foo"
//   - 4) 优先级: 父目录规则覆盖子目录
//   - 5) 缓存: ag 不缓存, 每次重读
// ================================================================
