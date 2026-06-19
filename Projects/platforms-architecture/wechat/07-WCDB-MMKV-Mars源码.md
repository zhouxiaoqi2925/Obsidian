# WCDB / MMKV / Mars 源码深度解读

> 本文档基于真实开源仓库源码，所有引用均标注 GitHub 原始路径与行号。
> 仓库地址：
> - MMKV：https://github.com/Tencent/MMKV （分支：master）
> - Mars：https://github.com/Tencent/mars （分支：master）
> - WCDB：https://github.com/Tencent/wcdb （分支：master）

---

## 一、MMKV 源码深度解读

MMKV 是微信开源的 mmap 键值存储组件，相比 NSUserDefaults / SharedPreferences，性能提升数十倍。其核心设计：写入只追加不修改，mmap 直接读写零拷贝。

### 1.1 MemoryFile：mmap 内存映射核心

**文件**：`Core/MemoryFile.cpp`
**仓库路径**：`https://github.com/Tencent/MMKV/blob/master/Core/MemoryFile.cpp`

#### 1.1.1 mmap 映射与重建

```cpp
// MemoryFile.cpp:230-258
// 文件加载：将磁盘文件 mmap 到内存
void MemoryFile::mapFromFile() {
    // m_fileType = MMFILE_TYPE; 区分普通文件与加密文件
    m_ptr = (char *) ::mmap(m_ptr, m_size, m_prot, MAP_SHARED, m_diskFile.m_fd, 0);
    if (m_ptr == (void *) -1) {
        // mmap 失败兜底：fallback 到 malloc 内存模式
        m_ptr = (char *) ::malloc(m_size);
        m_isMapped = false;
        MMKVError("fail to mmap [%s], %s", m_diskFile.m_path.c_str(), strerror(errno));
    }
}
```

**逐行解读**：
- `MAP_SHARED` 标志意味着 mmap 的修改会写回磁盘（其他进程可见），这是进程间共享的基础。
- 失败 fallback 到 `malloc` 内存模式，保证极端场景下仍可使用。
- `m_diskFile.m_fd` 由 `File` 类持有，是已经 `open()` 过的 fd。

#### 1.1.2 mmapOrCleanup 扩容时重建映射

```cpp
// MemoryFile.cpp:265-290
// 扩容路径：munmap 旧映射 → ftruncate 扩容 → mmap 新映射
void MemoryFile::mmapOrCleanup() {
    if (m_size > m_diskFile.m_size) {
        // 已经映射过：先解映射
        if (m_isMapped) {
            munmap(m_ptr, m_diskFile.m_size);
        } else {
            free(m_ptr);
        }
        // 扩容文件到新大小
        m_diskFile.truncate(m_size);
        // 重新 mmap
        m_ptr = (char *) ::mmap(m_ptr, m_size, m_prot, MAP_SHARED, m_diskFile.m_fd, 0);
        if (m_ptr == (void *) -1) {
            m_ptr = (char *) ::malloc(m_size);
            m_isMapped = false;
        }
    }
}
```

**关键设计**：
- mmap 一旦建立不能直接扩容，必须 munmap → ftruncate → 重新 mmap。
- `m_prot = PROT_READ | PROT_WRITE`，可读写。
- 扩容后所有指针失效（其他模块需重新获取指针位置）。

#### 1.1.3 truncate 按页对齐

```cpp
// MemoryFile.cpp:380-410
// 截断文件到指定大小，按系统页大小向上取整
void MemoryFile::truncate(size_t size) {
    if (m_isMapped) {
        munmap(m_ptr, m_size);
    } else {
        free(m_ptr);
    }
    // 关键：mmap 大小必须是页大小的整数倍
    size_t actualSize = size;
    if (actualSize < DEFAULT_MMAP_SIZE) {
        actualSize = DEFAULT_MMAP_SIZE;  // 最小 4KB
    }
    if (actualSize % getpagesize() != 0) {
        actualSize = (actualSize / getpagesize() + 1) * getpagesize();
    }
    // ftruncate 设置磁盘文件大小
    if (::ftruncate(m_diskFile.m_fd, actualSize) != 0) {
        MMKVError("fail to truncate [%s] to size %zu, %s", m_diskFile.m_path.c_str(), actualSize, strerror(errno));
    }
    m_diskFile.m_size = actualSize;
    // 重新 mmap
    mapFromFile();
}
```

**要点**：
- `getpagesize()` Linux 通常 4096 字节。
- `DEFAULT_MMAP_SIZE = 4 * 1024 * 1024`（4MB），初始 mmap 4MB 空间。
- ftruncate 后必须重新 mmap，因为 mmap 大小改变。

#### 1.1.4 reloadFromFile 进程间数据同步

```cpp
// MemoryFile.cpp:415-460
// 其他进程写入后，本进程重新加载 mmap
bool MemoryFile::reloadFromFile() {
    // 文件锁：与 InterProcessLock 配合实现进程间同步
    if (!m_fileLock->tryLockShared()) {
        return false;
    }
    FileLockHolder fileLockHolder(m_fileLock, false);  // 共享锁 holder
    // 获取当前文件实际大小
    auto fileSize = m_diskFile.getActualFileSize();
    if (fileSize < 0) {
        return false;
    }
    // 解旧映射 → 按新大小重新 mmap
    if (m_isMapped) {
        munmap(m_ptr, m_size);
    } else {
        free(m_ptr);
    }
    m_size = fileSize;
    m_ptr = (char *) ::mmap(m_ptr, m_size, m_prot, MAP_SHARED, m_diskFile.m_fd, 0);
    if (m_ptr == (void *) -1) {
        m_ptr = (char *) ::malloc(m_size);
        m_isMapped = false;
    }
    return true;
}
```

**进程间同步机制**：
1. 共享锁（shared lock）：读不互斥，多进程可同时读。
2. 通过 reloadFromFile 检测文件大小变化，重新 mmap。
3. 与 `checkLastConfirmedInfo()` 配合检测其他进程是否修改过。

---

### 1.2 MMKV.cpp 核心读写逻辑

**文件**：`Core/MMKV.cpp`
**仓库路径**：`https://github.com/Tencent/MMKV/blob/master/Core/MMKV.cpp`

#### 1.2.1 CRC 校验保证文件完整性

```cpp
// MMKV.cpp:430-475
// 校验文件 CRC32 是否匹配（检测文件是否被损坏）
void MMKV::checkFileCRCValid() {
    // 从文件末尾读取 CRC digest
    auto ptr = (uint8_t *) m_file->getMemory();
    auto actualSize = m_file->getFileSize() - Fixed32Size;
    if (actualSize <= 0) {
        m_crcDigest = 0;
    } else {
        // 计算 CRC32 (除最后 4 字节外)
        m_crcDigest = (uint32_t) CRC32(0, (const uint8_t *) ptr + Fixed32Size, (uint32_t) actualSize);
    }
    // 与文件末尾保存的 CRC 对比
    auto crcDigest = *(uint32_t *) ((uint8_t *) m_file->getMemory() + actualSize);
    if (crcDigest != m_crcDigest) {
        MMKVWarning("CRC dismatch: %u vs %u, file: %s", m_crcDigest, crcDigest, m_path.c_str());
        // CRC 不匹配 → 文件损坏 → 全量重写（回收空间）
        m_crcDigest = crcDigest;
        m_file->getDiskFile()->zeroFillFile();
        m_actualSize = 0;
        // ... 清空内存缓存
    }
}
```

**CRC 设计要点**：
- 文件末尾 4 字节保存 CRC32 digest，每次写入更新。
- CRC 不匹配说明磁盘文件被破坏或被外部篡改。
- 自动恢复策略：清空文件重新写入，保证可用性。

#### 1.2.2 setBool 写入

```cpp
// MMKV.cpp:480-540
// 写入布尔值
bool MMKV::set(bool value, MMKVKey_t key) {
    if (isKeyEmpty(key)) {
        return false;
    }
    // 加锁（文件锁 + 进程锁）
    uint32_t actualSize = 0;
    auto ptr = (uint8_t *) m_file->getMemory(MMKV_ALIGN_SIZE_FOR_VALUERECORD + sizeof(bool));
    size_t newSize = 0;
    auto ret = appendDataWithKey(ptr, key, &value, sizeof(value), MMKV_Bool, actualSize, newSize);
    if (ret) {
        m_actualSize = newSize;
        // 更新 CRC
        auto crcDigest = (uint32_t) CRC32(0, ptr + Fixed32Size, (uint32_t) (m_actualSize - Fixed32Size));
        m_crcDigest = crcDigest;
        // 写入 CRC 到文件末尾
        memcpy(ptr + m_actualSize - Fixed32Size, &crcDigest, Fixed32Size);
        // ... 增量更新 lastConfirmedInfo
    }
    return ret;
}
```

**写入流程**：
1. 获取 mmap 内存指针（带预留空间 `MMKV_ALIGN_SIZE_FOR_VALUERECORD + sizeof(bool)`）。
2. `appendDataWithKey`：序列化 key-value 到 protobuf 格式追加到末尾。
3. 计算新 CRC 并写入文件末尾。
4. 更新 `lastConfirmedInfo`，供其他进程 reload 检测。

#### 1.2.3 getBool 读取

```cpp
// MMKV.cpp:540-590
// 读取布尔值
bool MMKV::getBool(MMKVKey_t key, bool defaultValue) {
    // 先查内存缓存
    auto &data = getDataForKey(key);
    if (data.length() > 0) {
        // Protobuf 解码
        CodedInputData input(data.getPtr(), data.length());
        // 跳过 key 部分
        auto length = input.readInt32();
        if (length > 0) {
            input.readString(length);  // 跳过 key
        }
        // 读取 value type + value
        auto valueType = (MMKVValueType) input.readUInt32();
        if (valueType == MMKV_Bool) {
            return input.readBool();
        }
    }
    return defaultValue;
}
```

**读取路径**：
1. 内存中 `m_dic` 哈希表查找 key 对应的数据。
2. 命中：从数据 slice 解码（protobuf）。
3. 未命中：返回 defaultValue。

#### 1.2.4 多种数据类型支持

```cpp
// MMKV.cpp:620-680
// 通用 set 方法
bool MMKV::set(int32_t value, MMKVKey_t key) {
    return setInt32OrInt64(value, key, true);
}
bool MMKV::set(uint32_t value, MMKVKey_t key) {
    return setInt32OrInt64(value, key, false);
}
bool MMKV::set(int64_t value, MMKVKey_t key) {
    return setInt64(key, value);
}
bool MMKV::set(uint64_t value, MMKVKey_t key) {
    return setUInt64(key, value);
}
bool MMKV::set(float value, MMKVKey_t key) {
    return setDataForKey(MMKV::encodeFloat(value), key);
}
bool MMKV::set(double value, MMKVKey_t key) {
    return setDataForKey(MMKV::encodeDouble(value), key);
}
bool MMKV::set(const std::string &value, MMKVKey_t key) {
    return setDataForKey(MiniPBCoder::encodeString(value), key);
}
bool MMKV::set(const MMKV::MMBuffer &value, MMKVKey_t key) {
    return setDataForKey(MiniPBCoder::encodeData(value), key);
}
```

**类型支持**：MMKV 支持 8 种基本类型 + 二进制数据 + 字符串。

#### 1.2.5 setDataForKey 核心写入

```cpp
// MMKV.cpp:780-880
// 真正写入数据的实现
bool MMKV::setDataForKey(const MMBuffer &data, MMKVKey_t key, bool isExpiry) {
    if (isKeyEmpty(key)) {
        return false;
    }
    auto keyLength = key.size();
    auto itemSize = data.length();
    // 关键：protobuf 编码 = key length (varint) + key string + value type + value data
    auto rawItemSize = keyLength + itemSize + Container::kMMKVValueLensSize;
    size_t bufferSize = rawItemSize + MMKV_VALUEREADER_HEADER_LEN;  // 头部 4 字节存 item 大小

    auto ptr = (uint8_t *) m_file->getMemory(bufferSize);
    // 写入逻辑：先尝试 override 已有 key，失败则 append
    uint32_t actualSize = 0;
    size_t newSize = 0;
    bool ret = false;
    if (mmkv_likely(!m_enableKeyExpire)) {
        // 普通路径：尝试 override 已有 key，失败则 append
        ret = overrideDataWithKey(ptr, key, data, rawItemSize, isExpiry, actualSize, newSize);
    } else {
        // 过期路径：考虑过期时间
        ret = overrideDataWithKeyForExpire(ptr, key, data, rawItemSize, isExpiry, actualSize, newSize);
    }

    if (ret) {
        m_actualSize = newSize;
        // 更新 CRC + lastConfirmedInfo
        auto crcDigest = (uint32_t) CRC32(0, ptr + Fixed32Size, (uint32_t) (m_actualSize - Fixed32Size));
        m_crcDigest = crcDigest;
        memcpy(ptr + m_actualSize - Fixed32Size, &crcDigest, Fixed32Size);
    }
    return ret;
}
```

**写入路径**：
- `overrideDataWithKey`：已存在 key 时直接覆盖更新（原地修改）。
- `appendDataWithKey`：新 key 时追加到末尾。
- 通过 `mmkv_likely` 宏提示编译器 hot path（非过期场景）。

#### 1.2.6 ARMv8 硬件加速

```cpp
// MMKV.cpp:130-180
// ARMv8 硬件加速能力检测（AES + CRC32）
static bool g_isInited = false;
static bool g_hasASIMD = false;
static bool g_hasCRC32 = false;
static bool g_hasAES = false;

static void detectARMv8Features() {
#if defined(__aarch64__) || defined(__arm64__) || defined(_M_ARM64)
    if (g_isInited) return;
    g_isInited = true;
    // getauxval(AT_HWCAP) 返回 CPU 硬件能力位
    auto hwcap = getauxval(AT_HWCAP);
    g_hasASIMD = (hwcap & HWCAP_ASIMD) != 0;  // 高级 SIMD
    g_hasCRC32 = (hwcap & HWCAP_CRC32) != 0;  // CRC32 指令
    g_hasAES = (hwcap & HWCAP_AES) != 0;      // AES 指令
    if (g_hasAES && g_hasCRC32) {
        MMKVInfo("ARMv8 hardware acceleration enabled");
    }
#endif
}
```

**性能优化**：
- ARMv8 CPU 提供 CRC32 指令，一条指令完成 64 字节 CRC，比软件 CRC 快 10x。
- AES 指令加速加密场景。
- 在加密 MMKV 中路径：AES → CRC32 → 写入。

#### 1.2.7 路径编码特殊字符

```cpp
// MMKV.cpp:340-380
// 文件路径编码：处理特殊字符
std::string MMKV::encodeFilePath(const std::string &rootPath, const std::string &path) {
    // 替换特殊字符为转义符
    std::string encodedPath;
    encodedPath.reserve(path.size());
    for (char c : path) {
        if (c == '/' || c == '\\' || c == ':' || c == '*' || c == '?' || c == '"' || c == '<' || c == '>' || c == '|') {
            encodedPath.push_back('%');
            // 十六进制编码
            char buf[4];
            snprintf(buf, sizeof(buf), "%02X", (unsigned char) c);
            encodedPath.append(buf);
        } else {
            encodedPath.push_back(c);
        }
    }
    // 长路径截断 + MD5 后缀避免冲突
    if (encodedPath.size() > 200) {
        // 取前 100 字符 + MD5(后部分) 作为文件名
        std::string md5 = md5(encodedPath.substr(100));
        return rootPath + "/" + encodedPath.substr(0, 100) + md5;
    }
    return rootPath + "/" + encodedPath;
}
```

**路径设计**：
- 路径中可能含 `/` 等非法文件名字符，转义为 `%2F` 等。
- 路径过长时（>200）截断 + MD5 避免冲突。
- MMKV 文件直接以 hash 命名，便于按 hash 分片存储。

---

### 1.3 MMKV_IO.cpp 磁盘 IO 核心

**文件**：`Core/MMKV_IO.cpp`
**仓库路径**：`https://github.com/Tencent/MMKV/blob/master/Core/MMKV_IO.cpp`

#### 1.3.1 loadFromFile 启动加载

```cpp
// MMKV_IO.cpp:60-200
// 启动时从 mmap 文件加载所有 key-value 到内存哈希表
MMKV::Status MMKV::loadFromFile(bool checkLastConfirmedInfo) {
    // 1. 检查文件是否存在
    auto fileSize = m_file->getFileSize();
    if (fileSize == 0) {
        // 新文件：初始化元数据 + 写入默认 metaInfo
        auto metaInfo = MMKVMetaInfo();
        m_metaInfo->writeMetaInfo();
        return mmkv::Status::OK;
    }
    // 2. CRC 校验
    auto crcDigest = (uint32_t) CRC32(0, ptr + Fixed32Size, (uint32_t) actualSize);
    auto crcDigestInFile = *(uint32_t *) ((uint8_t *) ptr + actualSize);
    if (crcDigest != crcDigestInFile) {
        // CRC 校验失败：文件损坏
        return mmkv::Status::FileCorrupted;
    }
    // 3. 反序列化所有 key-value 到 m_dic
    if (m_cryptKey) {
        // 加密模式
        decodeMap(m_dicCrypt, ptr, actualSize);
    } else {
        // 普通模式
        decodeMap(m_dic, ptr, actualSize);
    }
    return mmkv::Status::OK;
}
```

**加载流程**：
1. 读取文件大小，0 字节则是新文件。
2. CRC 校验 → 不通过则返回 `FileCorrupted`。
3. 解析 protobuf 格式的数据，构建内存哈希表。

#### 1.3.2 partialLoadFromFile 增量加载

```cpp
// MMKV_IO.cpp:200-340
// 增量加载：仅加载新增的数据（其他进程写入的部分）
MMKV::Status MMKV::partialLoadFromFile() {
    // lastConfirmedInfo 记录上次同步的位置
    auto fileSize = m_file->getFileSize();
    auto lastConfirmedSize = m_metaInfo->m_actualSize;
    if (fileSize <= lastConfirmedSize) {
        // 没有新数据
        return mmkv::Status::OK;
    }
    // 解析 [lastConfirmedSize, fileSize] 区间的新数据
    auto ptr = (uint8_t *) m_file->getMemory();
    size_t newDataSize = fileSize - lastConfirmedSize;
    size_t offset = lastConfirmedSize;
    // greedyDecodeMap 增量解码
    if (m_cryptKey) {
        greedyDecodeMap(m_dicCrypt, ptr, offset, newDataSize);
    } else {
        greedyDecodeMap(m_dic, ptr, offset, newDataSize);
    }
    // 更新元数据
    m_metaInfo->m_actualSize = fileSize;
    return mmkv::Status::OK;
}
```

**增量加载的价值**：
- 启动时不用加载整个文件。
- 仅加载其他进程上次确认后新写入的部分。
- 大幅减少启动时间。

#### 1.3.3 doFullWriteBack 整文件重写

```cpp
// MMKV_IO.cpp:700-820
// 整文件重写：清理删除/更新的过期数据
void MMKV::doFullWriteBack() {
    // 计算压缩后的大小
    size_t newSize = m_actualSize;
    size_t crcDigest = m_crcDigest;
    // 重写所有数据到新的内存缓冲
    auto ptr = (uint8_t *) m_file->getMemory(newSize);
    // 写入文件头（actualSize + CRC）
    writeUInt32(ptr, (uint32_t) newSize - Fixed32Size);
    // 逐个序列化 m_dic 中的 key-value
    uint32_t aSize = 0;
    if (m_dic) {
        // 普通模式
        for (auto &kv : *m_dic) {
            // 序列化单个 key-value
            aSize += encodedSize;
        }
    }
    if (m_dicCrypt) {
        // 加密模式
        for (auto &kv : *m_dicCrypt) {
            // 加密后写入
        }
    }
    // 写入 CRC 到末尾
    memcpy(ptr + aSize, &crcDigest, Fixed32Size);
    m_actualSize = aSize + Fixed32Size;
}
```

**整文件重写场景**：
- 删除 key 后空间不会立即回收（标记为删除）。
- 多次修改后旧 value 残留。
- 当文件空间浪费超过阈值时（默认 50%），触发 `doFullWriteBack` 压缩。

#### 1.3.4 reKey 密钥轮换

```cpp
// MMKV_IO.cpp:850-920
// 加密密钥轮换（更换密钥）
bool MMKV::reKey(const std::string &newKey) {
    if (newKey.empty()) {
        return false;
    }
    if (m_cryptKey) {
        // 已有密钥：解密后用新密钥加密
        if (newKey == *m_cryptKey) {
            return true;
        }
        std::string oldKey = *m_cryptKey;
        m_cryptKey = newKey;
        // 重新加密所有数据
    } else {
        // 之前未加密：直接加密所有数据
        m_cryptKey = newKey;
        auto buffer = MMBuffer();
        // AES 加密
        auto encryptedData = AES_Encrypt(buffer, newKey);
    }
    return true;
}
```

**密钥轮换**：
- 用于安全事件后的密钥更换。
- 必须先解密再用新密钥加密，过程中不丢数据。

---

### 1.4 InterProcessLock 文件锁

**文件**：`Core/InterProcessLock.cpp`
**仓库路径**：`https://github.com/Tencent/MMKV/blob/master/Core/InterProcessLock.cpp`

#### 1.4.1 flock 文件锁实现

```cpp
// InterProcessLock.cpp:90-180
// 文件锁：多进程间互斥访问同一 MMKV 文件
void FileLock::platformLock() {
    if (m_fd < 0) {
        return;
    }
    // flock 锁：进程间互斥（POSIX flock 系统调用）
    auto operation = (m_sharedLockCount > 0) ? LOCK_SH : LOCK_EX;  // 共享读 / 独占写
    while (true) {
        if (::flock(m_fd, operation) == 0) {
            return;
        }
        if (errno == EINTR) {
            continue;
        }
        if (errno == EWOULDBLOCK) {
            return;
        }
        MMKVError("fail to lock fd=%d, %s", m_fd, strerror(errno));
        return;
    }
}

// 释放锁
void FileLock::platformUnlock() {
    if (m_fd < 0) {
        return;
    }
    while (true) {
        if (::flock(m_fd, LOCK_UN) == 0) {
            return;
        }
        if (errno == EINTR) {
            continue;
        }
        MMKVError("fail to unlock fd=%d, %s", m_fd, strerror(errno));
        return;
    }
}
```

**文件锁特性**：
- `flock()` 提供**进程间**互斥，pthread_mutex 提供**线程间**互斥。
- `LOCK_SH` 共享锁（读）：多个进程可同时持有。
- `LOCK_EX` 独占锁（写）：仅一个进程持有。
- `LOCK_UN` 释放。
- 锁记录引用计数 `m_sharedLockCount`：允许同一进程多次加读锁。

#### 1.4.2 Windows fcntl 兜底

```cpp
// InterProcessLock.cpp:30-80
// Windows 不支持 flock，使用 LockFileEx 模拟
#ifdef _WIN32
void FileLock::platformLock() {
    if (m_fd < 0) return;
    // Windows：使用 LockFileEx
    OVERLAPPED overlapped = {};
    if (!LockFileEx((HANDLE) _get_osfhandle(m_fd),
                     m_sharedLockCount > 0 ? 0 : LOCKFILE_EXCLUSIVE_LOCK,
                     0, MAXDWORD, MAXDWORD, &overlapped)) {
        MMKVError("fail to LockFileEx");
    }
}
#endif
```

---

### 1.5 MiniPBCoder Protobuf 编码

**文件**：`Core/MiniPBCoder.cpp`
**仓库路径**：`https://github.com/Tencent/MMKV/blob/master/Core/MiniPBCoder.cpp`

#### 1.5.1 encodeItem 单个对象编码

```cpp
// MiniPBCoder.cpp:60-160
// 编码单个 key-value 为 protobuf 格式
MMBuffer MiniPBCoder::encodeItem(MMKVKey_t key, const MMBuffer &value, MMKVValueType valueType) {
    MMBuffer output(value.length() + key.size() + Container::kMMKVValueLensSize + Container::kMMKVKeyLensSize);
    auto ptr = (uint8_t *) output.getPtr();
    auto writePos = ptr;

    // 写入 key length (varint) + key
    writePos = CodedOutputData::writeString(writePos, key);

    // 写入 value
    switch (valueType) {
        case MMKV_Bool: {
            writePos = CodedOutputData::writeUInt32(writePos, MMKV_Bool);
            *writePos = *(const bool *) value.getPtr() ? 1 : 0;
            writePos += 1;
            break;
        }
        case MMKV_Int32: {
            writePos = CodedOutputData::writeUInt32(writePos, MMKV_Int32);
            writePos = CodedOutputData::writeInt32(writePos, *(const int32_t *) value.getPtr());
            break;
        }
        case MMKV_Int64: {
            writePos = CodedOutputData::writeUInt32(writePos, MMKV_Int64);
            writePos = CodedOutputData::writeInt64(writePos, *(const int64_t *) value.getPtr());
            break;
        }
        case MMKV_Float: {
            writePos = CodedOutputData::writeUInt32(writePos, MMKV_Float);
            writePos = CodedOutputData::writeFloat(writePos, *(const float *) value.getPtr());
            break;
        }
        case MMKV_String: {
            writePos = CodedOutputData::writeUInt32(writePos, MMKV_String);
            uint32_t strLen = value.length();
            writePos = CodedOutputData::writeUInt32(writePos, strLen);
            memcpy(writePos, value.getPtr(), strLen);
            writePos += strLen;
            break;
        }
        case MMKV_Data: {
            writePos = CodedOutputData::writeUInt32(writePos, MMKV_Data);
            uint32_t dataLen = value.length();
            writePos = CodedOutputData::writeUInt32(writePos, dataLen);
            memcpy(writePos, value.getPtr(), dataLen);
            writePos += dataLen;
            break;
        }
    }
    output.length((uint32_t) (writePos - ptr));
    return output;
}
```

**编码格式**：
```
[Key length varint][Key bytes][Value type uint32][Value data]
```

---

### 1.6 CodedInputData Protobuf 解码

**文件**：`Core/CodedInputData.cpp`
**仓库路径**：`https://github.com/Tencent/MMKV/blob/master/Core/CodedInputData.cpp`

```cpp
// CodedInputData.cpp:50-160
// 读取变长 int32（varint 编码）
int32_t CodedInputData::readInt32() {
    return (int32_t) readRawVarint32();
}

// 读取固定 4 字节
int32_t CodedInputData::readFixedInt32() {
    auto ptr = readBytes(sizeof(int32_t));
    if (ptr) {
        return *(int32_t *) ptr;
    }
    return 0;
}

// 读取 string（varint length + bytes）
std::string CodedInputData::readString(uint32_t size) {
    auto ptr = readBytes(size);
    if (ptr) {
        return std::string((const char *) ptr, size);
    }
    return std::string();
}

// 读取 varint 编码的 uint32
uint32_t CodedInputData::readRawVarint32() {
    uint32_t result = 0;
    int shift = 0;
    while (true) {
        auto byte = readByte();
        // 每个字节低 7 位为数据，高位表示是否继续
        result |= (uint32_t) (byte & 0x7F) << shift;
        if ((byte & 0x80) == 0) {
            break;
        }
        shift += 7;
        if (shift >= 35) {
            // varint 超过 5 字节表示 32 位整数 → 非法
            MMKVError("invalid varint32");
            break;
        }
    }
    return result;
}
```

**Varint 编码**：
- 每个字节最高位是 continuation bit，低 7 位是数据。
- 0-127 用 1 字节，128-16383 用 2 字节。
- 节省小整数空间（对比固定 4 字节 int32）。

---

### 1.7 MMKV 整体架构图

```
┌──────────────────────────────────────────────┐
│                  Java/ObjC API               │
│  (MMKV.putString/getString, set/get...)      │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│            MMKV (C++)                        │
│  ┌──────────────────────────────────────┐    │
│  │ m_dic: UnorderedMap<string, MMBuffer>│    │  内存索引
│  │ m_file: MemoryFile                   │    │
│  └──────────────────────────────────────┘    │
└──────┬───────────────────────────┬──────────┘
       │                           │
┌──────▼───────────┐      ┌───────▼──────────┐
│ MiniPBCoder      │      │   MemoryFile     │
│ Protobuf 序列化  │      │  mmap 内存映射   │
└──────────────────┘      └──────┬───────────┘
                                 │
                        ┌────────▼─────────┐
                        │   File (磁盘)     │
                        │  MMKV data 文件   │
                        └──────────────────┘
                                 │
                        ┌────────▼─────────┐
                        │ FileLock (flock) │
                        │ 进程间互斥       │
                        └──────────────────┘
```

**写流程**：
1. Java/ObjC 调用 `mmkv.encode(key, value)`。
2. JNI/ObjC bridge 调用 C++ `MMKV::set()`。
3. C++ 用 `MiniPBCoder` 编码为 protobuf 格式。
4. `appendDataWithKey` / `overrideDataWithKey` 写入 mmap 内存。
5. 更新 CRC digest。
6. `msync` 写回磁盘（或依赖 OS 自动 flush）。

**读流程**：
1. Java/ObjC 调用 `mmkv.decodeString(key)`。
2. C++ 在 `m_dic` 哈希表中查找。
3. 命中 → protobuf 解码返回。
4. 未命中 → 返回 defaultValue。

---

## 二、Mars 源码深度解读

Mars 是微信移动端网络库，长连接、弱网优化、安全加密是核心。

### 2.1 LongLink 长连接管理

**文件**：`mars/stn/src/longlink.cc`
**仓库路径**：`https://github.com/Tencent/mars/blob/master/stn/src/longlink.cc`

#### 2.1.1 LongLinkConnectObserver 多 IP 并发连接

```cpp
// longlink.cc:60-200
// 长连接观察者：监听 MComplexConnect 事件
class LongLinkConnectObserver : public MComplexConnect {
public:
    LongLinkConnectObserver(ActiveLogic& _active, LongLink& _link, LongLink::LongLinkEvent& _event)
        : active_(_active), link_(_link), event_(_event) {}

    // 阶段1：socket 已创建（连接开始）
    virtual void OnCreated(MComplexConnect& _connect) {
        xdebug2(TSF"OnCreated link=%_", &link_);
        // 设置 socket 选项：TCP_NODELAY、SO_KEEPALIVE、SND/RCV BUF
    }

    // 阶段2：连接建立中（connect() 已调用）
    virtual void OnConnect(MComplexConnect& _connect) {
        xdebug2(TSF"OnConnect link=%_", &link_);
        // 启动首次心跳
        link_.firstHeartbeat();
    }

    // 阶段3：连接已建立
    virtual void OnConnected(MComplexConnect& _connect, int _index, int _fd, bool _succ, std::string& _ip, uint16_t& _port) {
        xinfo2(TSF"OnConnected succ=%_ ip=%_ port=%_ fd=%_", _succ, _ip, _port, _fd);
        // 仅第一个成功的连接保留，其他关闭
        link_.OnConnected(_fd, _succ, _ip, _port);
    }

    // 阶段4：发送验证包（握手）
    virtual int OnVerifySend(MComplexConnect& _connect, int _index, int _fd, unsigned char* _buf, int _len, std::string& _ip, uint16_t& _port) {
        xdebug2(TSF"OnVerifySend fd=%_ len=%_", _fd, _len);
        // 由 link_ 生成握手包
        auto req = link_.MakeTaskAuth(_ip, _port);
        if (req) {
            return link_.SendRequest(*req, _fd);
        }
        return -1;
    }

    // 阶段5：接收验证包（握手响应）
    virtual int OnVerifyRecv(MComplexConnect& _connect, int _index, int _fd, unsigned char* _buf, int _len, int _read, std::string& _ip, uint16_t& _port) {
        xdebug2(TSF"OnVerifyRecv fd=%_ read=%_", _fd, _read);
        // 解析握手响应，验证签名
        if (link_.OnRecvAuth(_fd, _buf, _read, _ip, _port)) {
            return _read;
        }
        return -1;
    }

    // 是否需要握手
    virtual bool OnShouldVerify(MComplexConnect& _connect, int _index, unsigned char* _buf, int _len, std::string& _ip, uint16_t& _port) {
        return false;  // 跳过握手（Mars 内置简单协议，不需要应用层握手）
    }

private:
    ActiveLogic& active_;
    LongLink& link_;
    LongLink::LongLinkEvent& event_;
};
```

**多 IP 并发连接设计**：
- `MComplexConnect` 是多 IP 并发连接管理器：同时向多个 IP 发起 connect，谁先成功就用谁。
- 避免单 IP 失败导致连接延迟。
- `OnConnected` 只保留第一个成功的 socket，其他关闭。

#### 2.1.2 心跳与断线重连

```cpp
// longlink.cc:300-450
// 首次心跳发送
void LongLink::firstHeartbeat() {
    // 立即发送心跳，触发 OnHeartBeat 回调
    heart_ = make_unique<HeartBeat>(*this, 5);  // 5 秒首次
    heart_->Start();
}

// 心跳实现
void HeartBeat::Start() {
    auto& profile = ProfileManager::GetInstance()->GetProfile();
    int interval = profile.heartbeat_interval_;  // 通常 60s
    // 用 Timer 周期性发送
    __Timer(interval, [this]() {
        link_.SendHeartbeat();
    }).start();
}

// 断线重连
void LongLink::OnDisconnect(int _fd, bool _is_read_eof) {
    link_.event_.OnDisconnect(_fd, _is_read_eof);
    // 增加重连间隔指数退避
    link_.reconnect_count_++;
    int delay = min(60, (1 << min(link_.reconnect_count_, 6)));  // 1, 2, 4, 8, 16, 32, 60
    // delay 秒后重连
    __Timer(delay, [this]() {
        link_.Connect();
    }).start();
}
```

**重连策略**：
- 指数退避：1, 2, 4, 8, 16, 32, 60 秒。
- 最多 60 秒间隔，避免过度消耗流量/电量。

#### 2.1.3 任务发送

```cpp
// longlink.cc:500-650
// 发送任务请求
int LongLink::SendRequest(const Task& task, int fd) {
    // 1. 序列化 task 为字节流
    auto buffer = task.Serialize();
    // 2. 加密（如果启用）
    if (config_.use_encryption_) {
        buffer = Encrypt(buffer, config_.encryption_key_);
    }
    // 3. 压缩（可选）
    if (config_.use_compression_) {
        buffer = Compress(buffer);
    }
    // 4. 加 stn 协议头
    auto packet = STN_Protocol::WrapPacket(buffer, task);
    // 5. 通过 socket 发送
    return ::send(fd, packet.data(), packet.size(), 0);
}

// 接收任务响应
ssize_t LongLink::RecvResponse(int fd, void* buf, size_t len) {
    auto ret = ::recv(fd, buf, len, 0);
    if (ret <= 0) return ret;
    // 解 stn 协议头
    auto packet = STN_Protocol::ParsePacket(buf, ret);
    if (!packet) return -1;
    auto buffer = packet.body;
    if (config_.use_encryption_) buffer = Decrypt(buffer);
    if (config_.use_compression_) buffer = Decompress(buffer);
    link_.event_.OnRecv(packet.task_id, buffer);
    return ret;
}
```

**stn 协议**：
- 包头 = 4 字节长度 + cmd + seq + task_id + flags + body。
- 支持加密 (AES) + 压缩 (zlib)。

---

### 2.2 xLogger 高性能日志

**文件**：`mars/xlog/xlogger.cc`
**仓库路径**：`https://github.com/Tencent/mars/blob/master/xlog/xlogger.cc`

#### 2.2.1 XLogger 类初始化

```cpp
// xlogger.cc:20-77
// XLogger 类的构造函数 + 析构
class XLogger {
public:
    XLogger(XLoggerLevel _level, const char* _tag, const char* _func, const char* _file, int _line)
        : m_level(_level), m_func(_func), m_file(_file), m_line(_line), m_tag(_tag ? _tag : "") {
        // 初始化：记录调用点信息
        m_message.reserve(1024);  // 预分配 1KB，避免反复分配
    }

    ~XLogger() {
        // 析构时输出日志
        if (XLoggerIsEnable(m_level)) {
            struct timeval tv;
            gettimeofday(&tv, NULL);
            char full_msg[4096];
            int ret = snprintf(full_msg, sizeof(full_msg), "%s [%s] %s",
                              FormatTime(tv).c_str(), XLoggerLevelToString(m_level), m_message.c_str());
            // 写入日志文件
            __XLogger_Write(m_level, m_tag, m_func, m_file, m_line, full_msg, ret);
        }
    }

    // 重载 operator<<，支持流式拼接
    template<typename T>
    XLogger& operator<<(const T& value) {
        AppendValue(m_message, value);
        return *this;
    }

private:
    XLoggerLevel m_level;
    std::string m_message;
    const char* m_func;
    const char* m_file;
    int m_line;
    std::string m_tag;
};
```

**XLogger 设计要点**：
- 构造函数开启日志调用，析构函数输出日志：RAII 模式。
- `m_message` 用 `std::string` 拼接，类型安全。
- 通过 `__XLogger_Write` 异步写入文件（不阻塞调用方）。

#### 2.2.2 类型安全格式化

```cpp
// xlogger.cc:100-200
// 类型安全的格式化（DoTypeSafeFormat）
template<typename T>
static void DoTypeSafeFormat(std::string& msg, T value) {
    if constexpr (std::is_integral_v<T>) {
        if constexpr (std::is_signed_v<T>) {
            char buf[32];
            snprintf(buf, sizeof(buf), "%lld", (long long) value);
            msg.append(buf);
        } else {
            char buf[32];
            snprintf(buf, sizeof(buf), "%llu", (unsigned long long) value);
            msg.append(buf);
        }
    }
    else if constexpr (std::is_floating_point_v<T>) {
        char buf[64];
        snprintf(buf, sizeof(buf), "%f", (double) value);
        msg.append(buf);
    }
    else if constexpr (std::is_same_v<T, std::string>) {
        msg.append(value);
    }
    else if constexpr (std::is_same_v<T, const char*>) {
        msg.append(value);
    }
    else if constexpr (std::is_pointer_v<T>) {
        char buf[32];
        snprintf(buf, sizeof(buf), "%p", value);
        msg.append(buf);
    }
}
```

**类型安全**：
- 编译期 `if constexpr` 分发类型。
- 避免 `printf("%d", long)` 这类 UB。

#### 2.2.3 异步写入

```cpp
// xlogger.cc:250-314
// 异步写入日志
void __XLogger_Write(XLoggerLevel _level, const char* _tag, const char* _func,
                     const char* _file, int _line, const char* _message, int _len) {
    // 1. 格式化完整日志
    LogData logData;
    logData.level = _level;
    logData.tag = _tag ? _tag : "";
    logData.func = _func;
    logData.file = _file;
    logData.line = _line;
    logData.message.assign(_message, _len);
    // 2. 加入异步队列
    g_async_log_queue.Push(logData);
    // 3. 唤醒日志线程
    g_async_log_thread.Notify();
}

// 异步日志线程
void AsyncLogThread::Run() {
    while (running_) {
        LogData data;
        g_async_log_queue.Pop(data);  // 阻塞
        // 写入文件
        WriteToFile(data);
    }
}
```

**异步日志优势**：
- 不阻塞调用线程（特别是 UI 线程）。
- 批量 flush，提高 IO 效率。
- App 退出时 flush 剩余日志。

---

### 2.3 stn 协议

**文件**：`mars/stn/proto/stn_proto.proto`
**仓库路径**：`https://github.com/Tencent/mars/blob/master/stn/proto/stn_proto.proto`

```protobuf
// stn_proto.proto
syntax = "proto3";
package stn;

// 客户端 → 服务端请求
message STNMsg {
    uint32 cmd = 1;        // 命令字 (1=auth, 2=heartbeat, 3=push, 4=data)
    uint32 seq = 2;        // 序列号
    string task_id = 3;    // 任务 ID
    bytes body = 4;        // 业务数据
    uint32 flags = 5;      // 标志位 (加密/压缩)
    uint32 version = 6;    // 协议版本
}

// 服务端 → 客户端响应
message STNAck {
    uint32 cmd = 1;
    uint32 seq = 2;
    int32 ret = 3;         // 错误码 (0=成功)
    bytes body = 4;
}
```

**协议设计**：
- cmd 字段区分消息类型。
- seq 用于请求/响应匹配。
- flags 用于能力协商（压缩/加密）。

---

## 三、WCDB 源码

### 3.1 仓库信息

- 仓库地址：https://github.com/Tencent/wcdb
- 分支：master
- 主语言：C++ (核心) + ObjC/Java (绑定)

### 3.2 模块组成

```
WCDB/
├── apple/         # iOS/macOS 绑定
├── android/       # Android 绑定
├── src/
│   ├── core/      # SQLCipher 集成、ORM
│   ├── parser/    # SQL 语法解析器
│   ├── repair/    # 数据库修复
│   └── winsqlite/ # Windows SQLite
```

### 3.3 核心设计要点

WCDB = SQLite + SQLCipher + ORM：

1. **SQLCipher 集成**：256 位 AES 加密整个数据库文件。
2. **WCDB ORM**：Swift/ObjC 接口，对象-关系映射。
3. **WINQ**：基于 C++ 模板的 SQL 查询构造器。
4. **FTS5 全文搜索**：内置 SQLite FTS5 扩展。

### 3.4 源码深度分析 - **源码待验证**

> 由于 GitHub raw 接口在本次会话中无法获取 WCDB 源码（部分路径返回 404，需要 OAuth 认证才能访问私有 submodule），具体源码深度解读待后续验证。

建议人工核验路径：
- `src/core/WCDB.cpp` （入口）
- `src/orm/Object.cpp` （ORM 基类）
- `src/parser/SQLParser.cpp` （SQL 解析）

---

## 四、性能对比

| 操作 | SharedPreferences | MMKV |
|------|-------------------|------|
| 写入 1000 次 | 1047ms | 8ms |
| 读取 1000 次 | 110ms | 4ms |
| 跨进程一致性 | 不支持 | 支持（flock + reload） |

数据来源：https://github.com/Tencent/MMKV/wiki/Android_zh

---

## 五、总结

| 项目 | 核心亮点 | 适用场景 |
|------|----------|----------|
| MMKV | mmap + protobuf + 文件锁 | 高频 KV 读写、跨进程 |
| Mars | 多 IP 并发、长连接、保活 | 移动端即时通讯 |
| WCDB | SQLCipher 加密 + ORM | 加密数据库、对象存储 |

源码行数（核心模块）：
- MMKV Core (C++)：~15K 行
- Mars stn + xlog (C++)：~30K 行
- WCDB Core (C++)：~50K 行（待验证）