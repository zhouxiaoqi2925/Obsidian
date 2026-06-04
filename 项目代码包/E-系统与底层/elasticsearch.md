---
title: Elasticsearch
tags: [搜索引擎, 全文检索, 分布式, ELK, 日志分析]
---

# Elasticsearch

## 前言

**定位**：分布式搜索和分析引擎，2010 年由 Shay Banon 发布至今是全文搜索、日志分析、APM 领域的事实标准，与 Logstash/Kibana 组成 ELK 生态，DB-Engines 搜索引擎类长期第一。

**核心价值**：
- 全文搜索：倒排索引 + BM25 算法，毫秒级返回
- 实时分析：聚合 + 统计，海量数据近实时
- 分布式：天然水平扩展，自动分片
- RESTful API：所有操作通过 HTTP/JSON

**五大特性**：
1. **倒排索引**：Term → Document 映射，搜索速度与数据量无关
2. **REST API**：HTTP 协议 + JSON 格式，无语言限制
3. **分布式**：分片（Shard）+ 副本（Replica）自动管理
4. **近实时（NRT）**：1s 索引延迟，写入即可搜索
5. **多租户**：Index 组织数据，跨索引查询

**对比表**：

| 维度 | Elasticsearch | Solr | OpenSearch | Meilisearch | Typesense |
|---|---|---|---|---|---|
| 性能 | 极高 | 高 | 高 | 中 | 中 |
| 运维 | 简单 | 中 | 简单 | 极简 | 简单 |
| 实时性 | 近实时 | 近实时 | 近实时 | 实时 | 实时 |
| 生态 | ✅✅ ELK | ⚠️ | OpenSearch Dashboards | ⚠️ | ⚠️ |
| 易用性 | 中 | 中 | 中 | 极简 | 简单 |
| 适合 | 日志/搜索 | 传统搜索 | ES 分支 | 小项目 | 现代应用 |

## 思维导图

```mermaid
mindmap
  root((Elasticsearch))
    核心
      倒排索引
        Inverted Index
      分词
        Analyzer
      评分
        BM25
    架构
      Cluster
      Node
        Master Data
        Coordinating
      Index
      Shard
        Primary
        Replica
    数据
      Document
        JSON
      Mapping
        动态
        显式
      Field Types
        text
        keyword
        numeric
        date
        geo
    查询
      Match
      Term
      Bool
      Range
      Fuzzy
      Wildcard
    聚合
      Metrics
        sum avg
      Bucket
        terms date_histogram
      Pipeline
        derivative
    集群
      选举
        Zen/Raft
      分片分配
      故障转移
    写入
      Index API
      Bulk API
      Refresh
      Flush
    搜索
      Query DSL
      URI Search
      SQL
      EQL
    生态
      Kibana
        可视化
      Logstash
        ETL
      Beats
        采集
      APM
    应用场景
      全文搜索
      日志分析
      监控
      推荐
      电商搜索
```

## 关键代码

### 一、基础操作

```bash
# 启动
bin/elasticsearch
bin/elasticsearch -d              # daemon
bin/elasticsearch -E node.name=node-1 -E cluster.name=prod

# 健康检查
curl -X GET 'localhost:9200/_cat/health?v'
curl -X GET 'localhost:9200/_cat/nodes?v'
curl -X GET 'localhost:9200/_cat/indices?v'

# 集群状态
curl -X GET 'localhost:9200/_cluster/stats?pretty'
```

```yaml
# elasticsearch.yml
cluster.name: production-cluster
node.name: node-1
path.data: /var/lib/elasticsearch
path.logs: /var/log/elasticsearch
network.host: 0.0.0.0
http.port: 9200

# 集群
discovery.seed_hosts: ["node1", "node2", "node3"]
cluster.initial_master_nodes: ["node-1", "node-2", "node-3"]

# 内存（重要）
bootstrap.memory_lock: true

# 安全
xpack.security.enabled: true
xpack.security.enrollment.enabled: true
xpack.security.http.ssl:
  enabled: true
  keystore.path: certs/http.p12

# 设置密码
bin/elasticsearch-setup-passwords interactive
```

### 二、索引管理

```bash
# 创建索引
curl -X PUT 'localhost:9200/articles' -H 'Content-Type: application/json' -d '{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "analysis": {
      "analyzer": {
        "my_analyzer": {
          "type": "custom",
          "tokenizer": "ik_max_word"
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "title": {
        "type": "text",
        "analyzer": "ik_max_word",
        "search_analyzer": "ik_smart",
        "fields": { "keyword": { "type": "keyword" } }
      },
      "content": { "type": "text", "analyzer": "ik_max_word" },
      "author": { "type": "keyword" },
      "views": { "type": "long" },
      "tags": { "type": "keyword" },
      "publishDate": { "type": "date" },
      "location": { "type": "geo_point" }
    }
  }
}'

# 查看索引
curl -X GET 'localhost:9200/articles?pretty'

# 删除索引
curl -X DELETE 'localhost:9200/articles'

# 索引别名
curl -X POST 'localhost:9200/_aliases' -H 'Content-Type: application/json' -d '{
  "actions": [
    { "add": { "index": "articles_v1", "alias": "articles" } },
    { "remove": { "index": "articles_v0", "alias": "articles" } }
  ]
}'

# 索引模板
curl -X PUT 'localhost:9200/_index_template/my-template' -d '{
  "index_patterns": ["logs-*"],
  "template": {
    "settings": { "number_of_shards": 1 },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "level": { "type": "keyword" },
        "message": { "type": "text" }
      }
    }
  }
}'
```

### 三、CRUD 文档

```bash
# 索引（创建/全量替换）
curl -X PUT 'localhost:9200/articles/_doc/1' -H 'Content-Type: application/json' -d '{
  "title": "Elasticsearch 入门",
  "content": "Elasticsearch 是一个分布式搜索和分析引擎...",
  "author": "alice",
  "views": 100,
  "tags": ["搜索", "ES"],
  "publishDate": "2026-06-04"
}'

# 获取
curl -X GET 'localhost:9200/articles/_doc/1?pretty'

# 更新（部分）
curl -X POST 'localhost:9200/articles/_update/1' -H 'Content-Type: application/json' -d '{
  "doc": { "views": 101 }
}'

# 脚本更新
curl -X POST 'localhost:9200/articles/_update/1' -d '{
  "script": {
    "source": "ctx._source.views += params.delta",
    "params": { "delta": 1 }
  }
}'

# 批量操作
curl -X POST 'localhost:9200/_bulk' -H 'Content-Type: application/json' -d '
{ "index": { "_index": "articles", "_id": "2" } }
{ "title": "文章2", "content": "...", "author": "bob" }
{ "index": { "_index": "articles", "_id": "3" } }
{ "title": "文章3", "content": "...", "author": "charlie" }
'

# 删除
curl -X DELETE 'localhost:9200/articles/_doc/1'
```

### 四、查询

```bash
# Match Query（分词后匹配）
curl -X GET 'localhost:9200/articles/_search' -H 'Content-Type: application/json' -d '{
  "query": {
    "match": {
      "title": "elasticsearch 入门"
    }
  }
}'

# Bool Query（组合）
curl -X GET 'localhost:9200/articles/_search' -d '{
  "query": {
    "bool": {
      "must": [
        { "match": { "content": "搜索引擎" } }
      ],
      "filter": [
        { "term": { "author": "alice" } },
        { "range": { "publishDate": { "gte": "2026-01-01" } } }
      ],
      "should": [
        { "term": { "tags": "搜索" } }
      ],
      "must_not": [
        { "term": { "tags": "过时" } }
      ]
    }
  }
}'

# Multi-match（多字段）
{
  "query": {
    "multi_match": {
      "query": "elasticsearch",
      "fields": ["title^3", "content"]
    }
  }
}

# Phrase Query（短语）
{
  "query": { "match_phrase": { "content": "搜索引擎" } }
}

# Highlight（高亮）
{
  "query": { "match": { "content": "elasticsearch" } },
  "highlight": {
    "fields": {
      "content": {
        "pre_tags": ["<em>"],
        "post_tags": ["</em>"]
      }
    }
  }
}

# Pagination
{
  "from": 0,
  "size": 20,
  "query": { "match_all": {} }
}

# Sort
{
  "query": { "match_all": {} },
  "sort": [
    { "_score": "desc" },
    { "publishDate": "desc" }
  ]
}
```

### 五、聚合

```bash
# Metrics 聚合
curl -X GET 'localhost:9200/articles/_search' -d '{
  "size": 0,
  "aggs": {
    "avg_views": { "avg": { "field": "views" } },
    "max_views": { "max": { "field": "views" } },
    "stats_views": { "stats": { "field": "views" } }
  }
}'

# Bucket 聚合
curl -X GET 'localhost:9200/articles/_search' -d '{
  "size": 0,
  "aggs": {
    "by_author": {
      "terms": { "field": "author", "size": 10 }
    },
    "by_date": {
      "date_histogram": {
        "field": "publishDate",
        "calendar_interval": "month"
      }
    },
    "by_views": {
      "range": {
        "field": "views",
        "ranges": [
          { "to": 100 },
          { "from": 100, "to": 1000 },
          { "from": 1000 }
        ]
      }
    }
  }
}'

# 嵌套聚合（top 标签 + 月份）
{
  "aggs": {
    "by_month": {
      "date_histogram": { "field": "publishDate", "calendar_interval": "month" },
      "aggs": {
        "top_tags": {
          "terms": { "field": "tags", "size": 5 }
        }
      }
    }
  }
}
```

### 六、中文分词（IK）

```bash
# 安装 IK 插件
bin/elasticsearch-plugin install https://github.com/medcl/elasticsearch-analysis-ik/releases/download/v8.13.0/elasticsearch-analysis-ik-8.13.0.zip

# 使用
{
  "mappings": {
    "properties": {
      "content": {
        "type": "text",
        "analyzer": "ik_max_word",     // 索引时细粒度
        "search_analyzer": "ik_smart"  // 搜索时粗粒度
      }
    }
  }
}

# 自定义词典
# config/analysis-ik/extra_stopword.dic
```

### 七、集群操作

```bash
# 查看分片
curl -X GET 'localhost:9200/_cat/shards?v'
curl -X GET 'localhost:9200/_cat/shards/articles?v&h=index,shard,prirep,state,docs,store,ip,node'

# 节点
curl -X GET 'localhost:9200/_cat/nodes?v&h=ip,name,heap.percent,ram.percent,cpu,load_1m,node.role,master'

# 分配解释
curl -X GET 'localhost:9200/_cluster/allocation/explain'

# 索引设置
curl -X PUT 'localhost:9200/articles/_settings' -d '{
  "number_of_replicas": 2
}'

# 关闭/开启分片分配
curl -X PUT 'localhost:9200/_cluster/settings' -d '{
  "transient": {
    "cluster.routing.allocation.enable": "none"
  }
}'

# 强制合并段
curl -X POST 'localhost:9200/articles/_forcemerge?max_num_segments=1'
```

## 核心洞察

- **Elasticsearch 的"倒排索引"是核心**：搜索速度与数据量无关
- **Elasticsearch 的近实时是 1s 延迟**：通过 refresh_interval 控制
- **Elasticsearch 的"分片"是水平扩展基础**：每个分片是 Lucene 索引
- **Elasticsearch 的 BM25 算法取代 TF-IDF**：更符合现代搜索
- **Elasticsearch 的"REST 一切"是双刃剑**：易用但 HTTP 开销大
- **Elasticsearch 的 ELK 生态是护城河**：Logstash + Beats + Kibana 形成闭环
- **Elasticsearch 8.x 默认开启 Security**：以前是收费功能
- **Elasticsearch 的 fork OpenSearch**：AWS 因许可证变化 fork 出去
- **Elasticsearch 的 JVM Heap 不要超过 32GB**：Compressed OOP 失效
- **Elasticsearch 的"Mapping 爆炸"问题**：dynamic mapping 要控制
- **Elasticsearch 在 Kubernetes 上的挑战**：有状态、ZooKeeper-like 协调
- **Elasticsearch 的向量搜索（8.0+）**：dense_vector 字段，挑战 Pinecone/Weaviate

## 跨项目引用

- **[[linux]]**：ES 跑在 Linux 上（需要调优）
- **[[docker]]**：ES 官方 Docker 镜像流行
- **[[kubernetes]]**：ECK（Elastic Cloud on K8s）Operator
- **[[kibana]]**：Kibana 是 ES 的可视化伴侣
- **[[logstash]]**：Logstash 是 ES 的 ETL
- **[[filebeat]]** / **[[fluentd]]**：轻量日志采集
- **[[prometheus]]**：ES metrics 监控
- **[[kafka]]**：Kafka 作为 Logstash 输入源
- **[[postgresql]]**：用 Logstash 把 PG 同步到 ES
- **[[mongodb]]**：MongoDB Connector 同步到 ES
- **[[meilisearch]]**：Meilisearch 是轻量替代
- **[[opensearch]]**：OpenSearch 是 ES 的 AWS fork
