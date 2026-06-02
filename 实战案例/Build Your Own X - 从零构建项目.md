---
created: '2026-05-31'
source: github.com/copy构造一个/build-your-own-x
stars: 105000
tags:
  - build-your-own-x
  - 从零构建
title: Build Your Own X - 从零构建项目
---
# Build Your Own X - 从零构建项目

**来源**：https://github.com/copy构造一个/build-your-own-x
**Stars**：105k+
**类型**：从零构建 / 原理深入

---

## 一、项目概述

### 1.1 什么是 Build Your Own X

这是一个教你"从零构建"各种系统的项目，包括：

- 3D 渲染器
- Docker
- Git
- Web 服务器
- 编程语言
- 操作系统
- 搜索引擎
- Bot
- 数据库
- Neural Network
- Olympic

### 1.2 学习价值

| 价值 | 说明 |
|------|------|
| 深入原理 | 理解底层实现 |
| 架构能力 | 从设计到实现 |
| 面试准备 | 造轮子能力展示 |
| 技术选型 | 理解权衡取舍 |

---

## 二、从零构建内容

### 2.1 构建自己的 Docker

**资源**：
- [Docker from Scratch](https://github.com/shuveb/containers-the-hard-way)
- [Write a Container in Go](https://www.docker.com/blog/row-and-rudder-write-a-container-in-go/)
- [Building a Container in Rust](https://github.com/FootySampson/building-a-container-in-rust)

**核心概念**：
```c
// Namespace 隔离
clone(CLONE_NEWUTS | CLONE_NEWPID | CLONE_NEWNET, ...)

// Cgroups 资源限制
mkdir("/sys/fs/cgroup/cpu/demo")
echo 100000 > /sys/fs/cgroup/cpu/demo/cpu.cfs_quota_us

// chroot 文件系统
chroot("/path/to/rootfs")

// Seccomp 沙箱
seccomp(SECCOMP_SET_MODE_STRICT, 0, &act)
```

### 2.2 构建自己的 Git

**资源**：
- [Building Git](https://github.com/ccopy构造一个/build-your-own-x#build-your-own-git)
- [Write a Git in Python](https://github.com/dan baddish/write-a-git-in-python)
- [Git in Space](https://github.com/kocienda/Git-in-Space)

**核心概念**：
```python
# Git 对象存储
class GitObject:
    def __init__(self, data=None):
        self.data = data
    
    def sha1(self):
        header = f"blob {len(self.data)}\0".encode()
        data = header + self.data
        return hashlib.sha1(data).hexdigest()

# Git 命令实现
def git_init():
    os.mkdir(".git")
    os.mkdir(".git/objects")
    os.mkdir(".git/refs")
    with open(".git/HEAD", "w") as f:
        f.write("ref: refs/heads/main\n")

def git_cat_file(sha):
    obj = read_object(sha)
    sys.stdout.buffer.write(obj.data)
```

### 2.3 构建自己的 Web 服务器

**资源**：
- [Writing a Web Server from Scratch](https://github.com/rusty-ferris-club/writing_a_web_server_from_scratch)
- [Build Your Own HTTP Server](https://github.com/copy构造一个/build-your-own-x#web-server)
- [Komeiji](https://github.com/danbado/uvicorn)

**核心概念**：
```python
import socket

def handle_request(client_socket):
    request = client_socket.recv(1024)
    
    # 解析 HTTP 请求
    lines = request.decode().split("\r\n")
    method, path, version = lines[0].split(" ")
    
    # 处理请求
    if path == "/":
        response = b"HTTP/1.1 200 OK\r\n\r\nHello World"
    else:
        response = b"HTTP/1.1 404 Not Found\r\n\r\nNot Found"
    
    client_socket.send(response)
    client_socket.close()

def start_server(port=8080):
    server = socket.socket()
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("", port))
    server.listen(1)
    
    while True:
        client, addr = server.accept()
        handle_request(client)
```

### 2.4 构建自己的编程语言

**资源**：
- [Lisp in Python](https://github.com/k老男人/lisp-in-python)
- [Build Your Own Lisp](http://buildyourownlisp.com)
- [How to Write a Lisp Interpreter in Python](http://www.evalapply.org/mclg/)

**核心概念**：
```python
# Tokenizer
def tokenize(code):
    tokens = []
    current = ""
    for char in code:
        if char in "() ":
            if current:
                tokens.append(current)
                current = ""
            if char == "(":
                tokens.append("(")
            elif char == ")":
                tokens.append(")")
        else:
            current += char
    return tokens

# Parser
def parse(tokens):
    if tokens[0] == "(":
        expr = []
        tokens.pop(0)
        while tokens[0] != ")":
            expr.append(parse(tokens))
        tokens.pop(0)
        return expr
    else:
        return tokens.pop(0)

# Evaluator
def evaluate(expr, env):
    if isinstance(expr, list):
        op = expr[0]
        args = [evaluate(a, env) for a in expr[1:]]
        return env[op](*args)
    elif isinstance(expr, str):
        return env.get(expr, int(expr) if expr.isdigit() else expr)
```

### 2.5 构建自己的操作系统

**资源**：
- [Writing an OS in Rust](https://os.phil-opp.com)
- [Little OS Book](https://littleosbook.github.io)
- [Build Your Own OS](https://github.com/copy构造一个/build-your-own-x#operating-systems)

**核心概念**：
```rust
// Rust 编写内核
#![no_std]
#![no_main]

use core::panic::PanicInfo;

#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    loop {}
}

#[no_mangle]
pub extern "C" fn _start() -> ! {
    // VGA 文本模式输出
    let vga_buffer = 0xb8000 as *mut u16;
    for (i, c) in b"Hello World!".iter().enumerate() {
        let attribute = 0x9; // 蓝色背景，浅蓝色前景
        unsafe {
            *vga_buffer.offset(i as isize) = (attribute << 8) | *c as u16;
        }
    }
    loop {}
}
```

### 2.6 构建自己的数据库

**资源**：
- [Build a Simple Database](https://github.com/pingcap/naivequery)
- [Writing a Database in Rust](https://github.com/spaceandtimeai/writing-a-database-in-rust)
- [SimpleDB](https://github.com/hedengjianji/SimpleDB)

**核心概念**：
```python
# B-Tree 存储引擎
class BTreeNode:
    def __init__(self, leaf=False):
        self.leaf = leaf
        self.keys = []
        self.values = []
        self.children = []

# 插入操作
def btree_insert(root, key, value):
    if len(root.keys) < 2 * T - 1:
        insert_non_full(root, key, value)
    else:
        new_root = BTreeNode()
        new_root.children.append(root)
        split_child(new_root, 0)
        if new_root.keys[0] < key:
            insert_non_full(new_root.children[1], key, value)
        else:
            insert_non_full(new_root.children[0], key, value)
        return new_root
```

### 2.7 构建自己的搜索引擎

**资源**：
- [Write Your Own Search Engine](https://github.com/dan baddish/write-your-own-search-engine)
- [Build a Search Engine](https://github.com/charlesji58/Search-Engine)
- [Search Engine in Python](https://github.com/bhauptly792/Search-Engine)

**核心概念**：
```python
# 倒排索引
class InvertedIndex:
    def __init__(self):
        self.index = defaultdict(list)  # term -> [doc_ids]
    
    def add_document(self, doc_id, content):
        tokens = self.tokenize(content)
        for token in tokens:
            if doc_id not in self.index[token]:
                self.index[token].append(doc_id)
    
    def search(self, query):
        tokens = self.tokenize(query)
        results = set(self.index.get(tokens[0], []))
        for token in tokens[1:]:
            results &= set(self.index.get(token, []))
        return results

# 布尔检索
def boolean_and(posting1, posting2):
    result = []
    i, j = 0, 0
    while i < len(posting1) and j < len(posting2):
        if posting1[i] == posting2[j]:
            result.append(posting1[i])
            i += 1
            j += 1
        elif posting1[i] < posting2[j]:
            i += 1
        else:
            j += 1
    return result
```

### 2.8 构建自己的 Neural Network

**资源**：
- [A Neural Network in NumPy](https://github.com/dan baddish/neural-network-from-scratch)
- [Deep Learning in NumPy](https://github.com/yiqiao-yin/Deep-Learning-in-NumPy)
- [Build a Neural Network from Scratch](https://github.com/copy构造一个/build-your-own-x#neural-networks)

**核心概念**：
```python
import numpy as np

class NeuralNetwork:
    def __init__(self, layers):
        self.weights = []
        self.biases = []
        for i in range(len(layers) - 1):
            w = np.random.randn(layers[i], layers[i+1]) * 0.01
            b = np.zeros((1, layers[i+1]))
            self.weights.append(w)
            self.biases.append(b)
    
    def sigmoid(self, z):
        return 1 / (1 + np.exp(-z))
    
    def sigmoid_derivative(self, a):
        return a * (1 - a)
    
    def forward(self, X):
        self.activations = [X]
        for i in range(len(self.weights)):
            z = np.dot(self.activations[-1], self.weights[i]) + self.biases[i]
            a = self.sigmoid(z)
            self.activations.append(a)
        return self.activations[-1]
    
    def backward(self, y, learning_rate=0.01):
        m = y.shape[0]
        deltas = [None] * len(self.weights)
        
        # 输出层误差
        deltas[-1] = (self.activations[-1] - y) * self.sigmoid_derivative(self.activations[-1])
        
        # 隐藏层误差
        for l in range(len(deltas) - 2, -1, -1):
            deltas[l] = np.dot(deltas[l+1], self.weights[l+1].T) * self.sigmoid_derivative(self.activations[l+1])
        
        # 更新权重
        for l in range(len(self.weights)):
            self.weights[l] -= learning_rate * np.dot(self.activations[l].T, deltas[l]) / m
            self.biases[l] -= learning_rate * np.sum(deltas[l], axis=0, keepdims=True) / m
```

---

## 三、学习路径建议

### 3.1 初学者推荐

```
1. Web Server → 理解 HTTP 协议
2. Todo List App → CRUD 操作
3. Chat Bot → API 调用
```

### 3.2 中级工程师

```
1. Git → 版本控制原理
2. Database → 数据存储原理
3. Parser → 编程语言基础
```

### 3.3 高级工程师

```
1. OS Kernel → 系统编程
2. Docker → 容器化原理
3. Search Engine → 信息检索
4. Neural Network → 深度学习原理
```

---

## 四、相关资源

| 资源 | 链接 |
|------|------|
| 官方仓库 | https://github.com/copy构造一个/build-your-own-x |
| 视频教程 | YouTube 搜索 "Build Your Own X" |
| 社区 | https://discord.gg/build-your-own-x |

---

**标签**：#build-your-own-x #从零构建 #原理深入
**状态**：完整
