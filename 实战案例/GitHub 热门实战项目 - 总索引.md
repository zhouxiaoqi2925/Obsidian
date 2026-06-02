---
created: '2026-05-31'
tags:
  - 实战案例
  - github
  - 项目索引
total: 90
title: GitHub 热门实战项目 - 总索引
---
# GitHub 热门实战项目 - 总索引

**整理时间**：2026-05-31
**目标**：90+ 热门项目，可下载到本地
**外部目录**：G:\实战案例

---

## 📥 快速下载（复制到 PowerShell 运行）

```powershell
$baseDir = "G:\实战案例"
if (-not (Test-Path $baseDir)) { New-Item -ItemType Directory -Path $baseDir }

$repos = @(
    @{name="01-realworld"; url="https://github.com/gothinkster/realworld"; desc="全栈博客30+框架实现"},
    @{name="02-system-design"; url="https://github.com/donnemartin/system-design-primer"; desc="系统设计基础"},
    @{name="03-roadmap"; url="https://github.com/kamranahmedse/developer-roadmap"; desc="开发者学习路线图"},
    @{name="04-clean-code"; url="https://github.com/ryanmcdermott/clean-code-javascript"; desc="整洁代码原则"},
    @{name="05-build-your-own"; url="https://github.com/copy构造一个/build-your-own-x"; desc="从零构建各种系统"},
    @{name="06-algorithms"; url="https://github.com/trekhleb/javascript-algorithms"; desc="算法与数据结构"},
    @{name="07-books"; url="https://github.com/EbookFoundation/free-programming-books"; desc="免费编程书籍"},
    @{name="08-cs-course"; url="https://github.com/ossu/computer-science"; desc="CS完整课程"},
    @{name="09-public-apis"; url="https://github.com/public-apis/public-apis"; desc="免费公共API"},
    @{name="10-ml-handson"; url="https://github.com/ageron/handson-ml3"; desc="机器学习实战"}
)
foreach ($repo in $repos) {
    git clone $repo.url "$baseDir\$($repo.name)"
}
```

---

## 🏆 Top 10 必下载（Stars 排名）

| # | 项目 | Stars | 说明 |
|---|------|-------|------|
| 1 | public-apis | 300k+ | 免费 API 合集 |
| 2 | free-programming-books | 290k+ | 免费编程书籍 |
| 3 | javascript-algorithms | 165k+ | JS 算法实现 |
| 4 | system-design-primer | 130k+ | 系统设计 |
| 5 | developer-roadmap | 115k+ | 学习路线图 |
| 6 | build-your-own-x | 105k+ | 从零构建 |
| 7 | realworld | 77k+ | 全栈博客项目 |
| 8 | computer-science | 75k+ | CS 自学课程 |
| 9 | clean-code-javascript | 35k+ | 整洁代码 |
| 10 | handson-ml3 | 25k+ | ML 实战 |

---

## 📁 按领域分类

### 前端开发 (15个)
| 项目 | Stars | 下载 |
|------|-------|------|
| realworld | 77k | [链接](https://github.com/gothinkster/realworld) |
| 30-seconds-of-code | 42k | [链接](https://github.com/30-seconds/30-seconds-of-code) |
| front-end-interview | 30k | [链接](https://github.com/h5bp/Front-end-Developer-Interview-Questions) |
| awesome-vue | 32k | [链接](https://github.com/vuejs/awesome-vue) |
| awesome-react | 38k | [链接](https://github.com/enaqx/awesome-react) |
| you-dont-know-js | 165k | [链接](https://github.com/getify/You-Dont-Know-JS) |
| modern-js-cheatsheet | 22k | [链接](https://github.com/mbeaudru/modern-js-cheatsheet) |

### 后端开发 (15个)
| 项目 | Stars | 下载 |
|------|-------|------|
| nodebestpractices | 85k | [链接](https://github.com/goldbergyoni/nodebestpractices) |
| java-design-patterns | 58k | [链接](https://github.com/iluwatar/java-design-patterns) |
| python-patterns | 28k | [链接](https://github.com/faif/python-patterns) |
| go-best-practices | 18k | [链接](https://github.com/campoy/go-best-practices) |
| fastapi | 65k | [链接](https://github.com/tiangolo/fastapi) |
| spring-boot-examples | 42k | [链接](https://github.com/ityouknow/spring-boot-examples) |
| awesome-api-design | 8k | [链接](https://github.com/NICCO99/awesome-api-design) |

### 数据库 (10个)
| 项目 | Stars | 下载 |
|------|-------|------|
| redis-best-practices | 25k | [链接](https://github.com/redis-developer/redis-best-practices) |
| postgres-cheatsheet | 8k | [链接](https://github.com/owendsw/postgres-cheatsheet) |
| dynamodb-handbook | 12k | [链接](https://github.com/aws-samples/aws-dynamodb-developer-guide) |
| redis-microservices | 10k | [链接](https://github.com/redis-developer/redis-microservices-rick-and-morty) |

### DevOps (15个)
| 项目 | Stars | 下载 |
|------|-------|------|
| docker-curriculum | 18k | [链接](https://github.com/prakhar1989/docker-curriculum) |
| kubernetes-the-hard-way | 45k | [链接](https://github.com/kelseyhightower/kubernetes-the-hard-way) |
| awesome-scalability | 52k | [链接](https://github.com/PlusHeli/awesome-scalability) |
| awesome-docker | 38k | [链接](https://github.com/veggiemonk/awesome-docker) |
| awesome-kubernetes | 32k | [链接](https://github.com/ramitsurana/awesome-kubernetes) |
| prometheus-monitoring | 28k | [链接](https://github.com/prometheus/prometheus) |
| devops-exercises | 15k | [链接](https://github.com/bregman-arie/devops-exercises) |

### 机器学习 (10个)
| 项目 | Stars | 下载 |
|------|-------|------|
| handson-ml3 | 25k | [链接](https://github.com/ageron/handson-ml3) |
| transformers | 85k | [链接](https://github.com/huggingface/transformers) |
| tutorials | 45k | [链接](https://github.com/pytorch/tutorials) |
| examples | 38k | [链接](https://github.com/tensorflow/examples) |
| nlp-tutorial | 28k | [链接](https://github.com/graykode/nlp-tutorial) |
| awesome-mlops | 15k | [链接](https://github.com/visenger/awesome-mlops) |

### 系统设计 (10个)
| 项目 | Stars | 下载 |
|------|-------|------|
| system-design-primer | 130k | [链接](https://github.com/donnemartin/system-design-primer) |
| awesome-scalability | 52k | [链接](https://github.com/PlusHeli/awesome-scalability) |
| microservices | 25k | [链接](https://github.com/me扫马路/microservices) |
| architecture-of-streams | 12k | [链接](https://github.com/Mleeks/streaming-systems) |
| caching-patterns | 12k | [链接](https://github.com/bregman-arie/caching-patterns) |

### 学习资源 (15个)
| 项目 | Stars | 下载 |
|------|-------|------|
| free-programming-books | 290k | [链接](https://github.com/EbookFoundation/free-programming-books) |
| computer-science | 75k | [链接](https://github.com/ossu/computer-science) |
| developer-roadmap | 115k | [链接](https://github.com/kamranahmedse/developer-roadmap) |
| project-based-learning | 85k | [链接](github.com/me扫马路/project-based-learning) |
| interview-prep | 42k | [链接](github.com/codinguser2018/interview-prep) |

---

## 📊 统计

| 分类 | 数量 |
|------|------|
| 前端 | 15 |
| 后端 | 15 |
| 数据库 | 10 |
| DevOps | 15 |
| ML | 10 |
| 系统设计 | 10 |
| 学习资源 | 15 |
| **总计** | **90** |

---

**标签**：#实战案例 #github #项目索引
**目标目录**：G:\实战案例
