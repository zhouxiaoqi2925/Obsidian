---
title: MongoDB
tags: [NoSQL, 文档数据库, BSON, 分布式, 灵活schema]
---

# MongoDB

## 前言

**定位**：最流行的文档数据库，2007 年由 Dwight Merriman、Eliot Horowitz、Kevin Ryan 创立至今是 NoSQL 的代表，DB-Engines 长期占据 Top 5，被 eBay、Adobe、LinkedIn、Bosch 等大厂采用，Atlas 云服务高速增长。

**核心价值**：
- 灵活 Schema：JSON-like BSON 文档，字段可变
- 水平扩展：原生分片（Sharding）支持 PB 级数据
- 强大查询：聚合管道、地理空间、全文搜索、图查询
- 多模型：时序集合、Atlas Vector Search 一库多用

**五大特性**：
1. **文档模型**：BSON（Binary JSON）支持嵌套、数组、二进制
2. **聚合管道**：Aggregation Pipeline 13+ 阶段算子
3. **副本集（Replica Set）**：自动故障转移的 PSS 架构
4. **分片集群**：水平扩展到 PB 级，16MB 文档限制
5. **Change Streams**：实时数据变更流（类似 CDC）

**对比表**：

| 维度 | MongoDB | PostgreSQL | MySQL | CouchDB | DynamoDB |
|---|---|---|---|---|---|
| 模型 | 文档 | 关系 | 关系 | 文档 | 文档/KV |
| Schema | 灵活 | 严格 | 严格 | 灵活 | 灵活 |
| 扩展 | 分片 | 扩展 | 扩展 | ❌ | 内置 |
| 事务 | 多文档 ACID | 完整 | 完整 | ❌ | 有限 |
| 查询 | 丰富 | SQL | SQL | MapReduce | 弱 |
| 适合 | 灵活数据 | 关系数据 | 关系数据 | 离线同步 | 云原生 |

## 思维导图

```mermaid
mindmap
  root((MongoDB))
    数据模型
      Database
      Collection
      Document
        BSON
        16MB 限制
      Field
      _id
    操作
      CRUD
        insert
        find
        update
        delete
      聚合
        pipeline
        map reduce
      索引
        单字段
        复合
        多键
        文本
        地理
        TTL
    架构
      单机
      副本集
        Primary
        Secondary
        Arbiter
      分片集群
        mongos
        config server
        shard
    副本集
      PSS
        Primary 2 Secondary
      PSA
        Primary Secondary Arbiter
      Oplog
        复制
      选举
        Raft-like
    分片
      范围
        Ranged
      哈希
        Hashed
      Zone
        区域
    事务
      单文档
        原子
      多文档
        ACID
        4.0+
    Change Streams
      实时
      监听
      触发
    工具
      mongosh
      Compass
      Atlas
        云服务
      BI Connector
      Charts
    安全
      认证
        SCRAM
        LDAP
        x.509
      授权
        RBAC
      加密
        TLS
        静态
    应用场景
      内容管理
      物联网
      实时分析
      移动后端
      缓存
      向量搜索
```

## 关键代码

### 一、连接与基础

```bash
# 启动
mongod --dbpath /var/lib/mongodb --logpath /var/log/mongodb/mongod.log
mongod --replSet rs0 --bind_ip_all
mongod --config /etc/mongod.conf

# 连接
mongosh
mongosh "mongodb://localhost:27017/mydb"
mongosh "mongodb://user:pass@host1:27017,host2:27017/mydb?replicaSet=rs0"

# 数据库
show dbs
use mydb
db.dropDatabase()

# 集合
show collections
db.createCollection("users")
db.users.drop()
```

```yaml
# /etc/mongod.conf
storage:
  dbPath: /var/lib/mongodb
  journal:
    enabled: true

systemLog:
  destination: file
  path: /var/log/mongodb/mongod.log
  logAppend: true

net:
  port: 27017
  bindIp: 127.0.0.1

processManagement:
  fork: true
  pidFilePath: /var/run/mongodb/mongod.pid

replication:
  replSetName: rs0

security:
  authorization: enabled
```

### 二、CRUD

```javascript
// 插入
db.users.insertOne({
  email: "alice@example.com",
  username: "alice",
  profile: { theme: "dark", language: "zh" },
  tags: ["admin", "vip"],
  createdAt: new Date()
})

db.users.insertMany([
  { email: "bob@example.com", username: "bob" },
  { email: "charlie@example.com", username: "charlie" }
])

// 查询
db.users.find()                                      // 全部
db.users.findOne({ email: "alice@example.com" })

db.users.find(
  { age: { $gte: 18, $lte: 65 } },                   // 范围
  { email: 1, username: 1, _id: 0 }                  // 投影
).sort({ createdAt: -1 }).limit(20).skip(0)

// 运算符
// $eq $ne $gt $gte $lt $lte
// $in $nin
// $and $or $not $nor
// $exists $type
// $regex
// $where

db.users.find({ tags: { $in: ["vip", "admin"] } })
db.users.find({ "profile.theme": "dark" })           // 嵌套
db.users.find({ tags: { $size: 3 } })                // 数组长度
db.users.find({ email: { $regex: /@example\.com$/ } })

// 更新
db.users.updateOne(
  { email: "alice@example.com" },
  { $set: { "profile.theme": "light" }, $inc: { loginCount: 1 } }
)

db.users.updateMany(
  { status: "inactive" },
  { $set: { status: "deleted", deletedAt: new Date() } }
)

// 数组操作
db.users.updateOne(
  { _id: 1 },
  { $push: { tags: "new-tag" } }                     // 追加
)
db.users.updateOne(
  { _id: 1 },
  { $pull: { tags: "old-tag" } }                     // 移除
)
db.users.updateOne(
  { _id: 1 },
  { $addToSet: { tags: "unique" } }                  // 去重

// 删除
db.users.deleteOne({ email: "alice@example.com" })
db.users.deleteMany({ status: "deleted" })
```

### 三、聚合管道

```javascript
// 基础
db.orders.aggregate([
  { $match: { status: "paid" } },
  { $group: {
      _id: "$userId",
      total: { $sum: "$amount" },
      count: { $sum: 1 }
    }
  },
  { $sort: { total: -1 } },
  { $limit: 10 }
])

// 多阶段
db.users.aggregate([
  // 1. 过滤
  { $match: { createdAt: { $gte: ISODate("2026-01-01") } } },

  // 2. 展开数组
  { $unwind: "$tags" },

  // 3. 分组
  { $group: {
      _id: "$tags",
      count: { $sum: 1 },
      users: { $push: "$username" }
    }
  },

  // 4. 排序
  { $sort: { count: -1 } },

  // 5. 限制
  { $limit: 20 },

  // 6. 投影
  { $project: {
      tag: "$_id",
      count: 1,
      _id: 0
    }
  }
])

// $lookup 关联（类似 SQL JOIN）
db.orders.aggregate([
  { $match: { userId: 1 } },
  { $lookup: {
      from: "users",
      localField: "userId",
      foreignField: "_id",
      as: "user"
    }
  },
  { $unwind: "$user" }
])

// $facet 多面聚合
db.products.aggregate([
  { $facet: {
      "byCategory": [
        { $group: { _id: "$category", count: { $sum: 1 } } }
      ],
      "byPrice": [
        { $bucket: { groupBy: "$price", boundaries: [0, 50, 100, 500, 1000] } }
      ],
      "stats": [
        { $group: { _id: null, avg: { $avg: "$price" }, max: { $max: "$price" } } }
      ]
    }
  }
])
```

### 四、索引

```javascript
// 单字段
db.users.createIndex({ email: 1 })                   // 1 升序, -1 降序

// 唯一
db.users.createIndex({ email: 1 }, { unique: true })

// 复合
db.users.createIndex({ status: 1, createdAt: -1 })

// 多键（数组）
db.users.createIndex({ tags: 1 })

// 文本索引
db.articles.createIndex(
  { title: "text", body: "text" },
  { weights: { title: 10, body: 1 } }
)
db.articles.find({ $text: { $search: "mongodb" } })

// 地理空间
db.places.createIndex({ location: "2dsphere" })
db.places.find({
  location: {
    $near: {
      $geometry: { type: "Point", coordinates: [121.47, 31.23] },
      $maxDistance: 1000
    }
  }
})

// TTL（自动过期）
db.sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 })

// 部分索引
db.users.createIndex(
  { email: 1 },
  { partialFilterExpression: { status: "active" } }
)

// 查看
db.users.getIndexes()
db.users.totalIndexSize()

// 分析
db.users.find({ email: "a@b.com" }).explain("executionStats")
```

### 五、事务（4.0+）

```javascript
// 启动会话
const session = db.getMongo().startSession()

session.startTransaction()
try {
  // 操作
  session.getDatabase("mydb").users.updateOne(
    { _id: 1 },
    { $inc: { balance: -100 } },
    { session }
  )

  session.getDatabase("mydb").users.updateOne(
    { _id: 2 },
    { $inc: { balance: 100 } },
    { session }
  )

  // 提交
  session.commitTransaction()
} catch (error) {
  session.abortTransaction()
  throw error
} finally {
  session.endSession()
}

// 简化写法（CAUSAL CONSISTENCY）
const session = db.getMongo().startSession({ causalConsistency: true })
// ... session 内的操作
```

### 六、副本集

```javascript
// 初始化（在一台主节点执行）
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "mongo1:27017", priority: 2 },  // 优先主
    { _id: 1, host: "mongo2:27017" },
    { _id: 2, host: "mongo3:27017", arbiterOnly: true }
  ]
})

// 查看状态
rs.status()
rs.isMaster()
rs.config()

// 强制主从切换
rs.stepDown(60)                                       // 主退位 60s

// 副本集命令
rs.add("mongo4:27017")
rs.remove("mongo4:27017")
rs.reconfig(config)
```

### 七、分片

```javascript
// 1. 启动 config server（3 节点副本集）
mongod --configsvr --replSet configRS --port 27019

// 2. 启动 mongos
mongos --configdb configRS/cfg1:27019,cfg2:27019,cfg3:27019 --port 27017

// 3. 添加分片
sh.addShard("rs0/mongo1:27017,mongo2:27017,mongo3:27017")
sh.addShard("rs1/mongo4:27017,mongo5:27017,mongo6:27017")

// 4. 启用分片
sh.enableSharding("mydb")

// 5. 分片集合
sh.shardCollection("mydb.orders", { userId: 1 })    // 范围分片
sh.shardCollection("mydb.events", { _id: "hashed" }) // 哈希分片

// 6. Zone（区域分片）
sh.addShardToZone("rs0", "us-east")
sh.addShardToZone("rs1", "us-west")
sh.updateZoneKeyRange(
  "mydb.users",
  { region: "us-east" },
  { region: "us-east-zzz" },
  "us-east"
)

// 查看
sh.status()
db.orders.getShardDistribution()
```

### 八、Change Streams

```javascript
// 监听集合变更
const pipeline = [
  { $match: { operationType: { $in: ["insert", "update", "delete"] } } }
]

const changeStream = db.users.watch(pipeline)

changeStream.on("change", (change) => {
  console.log("Detected change:", change)

  switch (change.operationType) {
    case "insert":
      // 处理新用户
      break
    case "update":
      // 同步到其他系统
      break
    case "delete":
      // 清理关联数据
      break
  }
})

// 关闭
changeStream.close()

// 恢复点（resumability）
const resumeToken = changeStream.getResumeToken()
const newStream = db.users.watch(pipeline, { resumeAfter: resumeToken })
```

### 九、用户与安全

```javascript
// 创建用户
use admin
db.createUser({
  user: "alice",
  pwd: "secret",
  roles: [
    { role: "readWrite", db: "mydb" },
    { role: "dbAdmin", db: "mydb" }
  ]
})

// 内置角色
// read readWrite dbAdmin userAdmin
// clusterAdmin dbOwner root

// 角色
db.createRole({
  role: "appUser",
  privileges: [
    { resource: { db: "mydb", collection: "users" }, actions: ["find", "insert", "update"] }
  ],
  roles: []
})

// 启用认证
// mongod.conf
// security:
//   authorization: enabled
//   keyFile: /etc/mongodb.key

// TLS
net:
  tls:
    mode: requireTLS
    certificateKeyFile: /etc/ssl/mongodb.pem
    CAFile: /etc/ssl/ca.pem
```

## 核心洞察

- **MongoDB 的"文档"模型是 NoSQL 的代表**：vs 关系数据库的"行列"
- **MongoDB 的"灵活 Schema"是双刃剑**：开发爽但数据治理难
- **MongoDB 4.0 引入多文档 ACID 事务**：补足"无事务"的短板
- **MongoDB 5.0 引入时序集合（Time Series）**：IoT/监控场景专用
- **MongoDB Atlas Vector Search（2023）**：内置向量索引，挑战 Pinecone
- **MongoDB 的副本集 Raft-like 算法**：自动选主、故障转移
- **MongoDB 的分片是水平扩展的标准方案**：相比关系库手动分库分表
- **MongoDB 的 16MB 文档限制**：防止滥用，BSON 本身就是设计取舍
- **MongoDB 的聚合管道是数据处理利器**：13+ 阶段算子
- **MongoDB 的 Change Streams 替代轮询**：实时数据同步
- **MongoDB 的 Oplog 是复制基础**：所有写操作的有序日志
- **MongoDB 与 PostgreSQL 的战争**：PG 14+ JSONB 增强侵蚀 Mongo 领地

## 跨项目引用

- **[[linux]]**：MongoDB 跑在 Linux 上
- **[[docker]]**：MongoDB 官方 Docker 镜像
- **[[kubernetes]]**：MongoDB Operator（MongoDB/Percona）部署
- **[[postgresql]]**：PostgreSQL 是 MongoDB 的最大竞品（JSONB）
- **[[redis]]**：Redis 是 MongoDB 的缓存层
- **[[kafka]]** + **[[debezium]]**：MongoDB CDC 同步到 Kafka
- **[[prometheus]]** + **[[mongodb_exporter]]**：MongoDB 监控
- **[[mongoose]]**：Node.js 流行 ODM
- **[[prisma]]**：Prisma 6+ 支持 MongoDB
- **[[atlas]]**：MongoDB Atlas 云服务
- **[[realm]]** / **[[realm-sdk]]**：MongoDB 移动端
- **[[arangodb]]**：ArangoDB 是多模型数据库
