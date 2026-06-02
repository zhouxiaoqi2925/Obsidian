# ansible - 无代理 SSH 自动化的四级调度与声明式幂等引擎

**GitHub**: ansible/ansible
**Star**: 66k+
**语言**: Python
**主题**: 配置管理 / 编排 / IT 自动化 / 声明式
**适用场景**: 多机部署、配置漂移修复、应用发布、网络设备管理

## 第一段：基础范式

### 模式 1：TaskQueueManager + Strategy 的"四级调度"

**问题场景**：playbook 里的 task 顺序固定，但真实环境下"host A 卡住"不应阻塞"host B"；"host 失败"不应终止整批；"中途新增 host"应能合并入队。简单串行 for 循环无法满足这种 host × task 二维矩阵的灵活调度。

**解决方案**：引入 `TaskQueueManager` + `StrategyBase` 把调度拆成四层：`Playbook → Play → Strategy → Worker`。Strategy 决定"先 host 后 task"还是"先 task 后 host"，把 host×task 矩阵的迭代顺序策略化；WorkerProcess 是 fork 出来的子进程，通过 `queue.Queue` 抢活执行。
```python
class TaskQueueManager:
    def __init__(self, inventory, variable_manager, loader, hosts, ...):
        self._strategy = strategy_loader.get(...)
        self._queue = queue.Queue()
        for i in range(forks):
            wp = WorkerProcess(self._queue, ...)
            self._workers.append(wp)
            wp.start()
```

**关键参数**：
- `PlaybookExecutor` 编排整本 playbook
- `TaskQueueManager` 管理单个 play 的 host/task 队列
- `StrategyBase` 子类决定 host × task 的迭代策略
- `WorkerProcess` fork 出的子进程，真正执行 module
- `forks` 默认 5——并行执行 5 个 host

**最佳实践**：用 Strategy 模式把"调度"与"执行"解耦——可独立扩展；WorkerProcess 用 `multiprocessing` 而非 `threading`——避开 GIL；失败隔离：单个 host 失败不影响其他 host。

---

### 模式 2：linear / free / host_pinned 三种 Strategy

**问题场景**：不同 playbook 想要的"任务执行策略"不同：默认按 host 串行（保证一致性）；紧急修复用 free 策略（不串行）；网络设备用 host_pinned（同一连接复用）。把策略写死在调度器里会丧失灵活性。

**解决方案**：把"host × task 矩阵的迭代顺序"抽成 `StrategyBase` 抽象类，提供三个内置实现。`linear` 按 host 串行（host-major），`free` 按 task 并行（task-major），`host_pinned` 复用同一 host 的 connection。Strategy 是插件——用户可写自定义 Strategy。
```python
class StrategyModule(StrategyBase):
    def _execute_meta(self, task, play_context, iterator, ...):
        for host in self._inventory.get_hosts(play.hosts):
            for task in play.tasks:
                self._queue.put((host, task))
```

**关键参数**：
- `linear`：host-major（按 host 串行），默认；强一致
- `free`：task-major（按 task 并行），紧急 fix、读多写少
- `host_pinned`：host-major + 复用连接，网络设备、低带宽
- `debug`：单步执行，调试专用
- `strategy: free` 在 playbook 顶部声明——per-playbook 切换

**最佳实践**：`linear` 是默认——新手用就够；`host_pinned` 是网络设备场景的杀手锏——复用 SSH 连接减少握手；选错策略会引发"host 间状态不一致"——业务层要清楚。

---

### 模式 3：fork 多进程 + 队列的 Producer-Consumer

**问题场景**：Python GIL 让多线程无法利用多核；几千台机器的并发不能阻塞主进程。线程模型在 CPU 密集型 module 执行下完全失效。

**解决方案**：用 `multiprocessing` + `queue.Queue` 跑经典 Producer-Consumer：主进程（Producer）枚举 host×task 投递进队列，子进程（Consumer）抢活执行。每个 Worker 是独立 Python 进程，吃满多核。
```python
def _start_workers(self):
    for i in range(self._forks):
        wp = WorkerProcess(
            self._queue, self._loader,
            self._variable_manager, self._hostvars, ...
        )
        self._workers.append(wp)
        wp.start()
```

**关键参数**：
- `forks` 默认 5，`-f 10` 提高并行度
- `timeout` 默认 30s——单 task 超时
- `connect_timeout` 默认 10s——SSH 连接超时
- `pipelining: True`——减少 SSH 握手 50%+ 时间
- `pipelining` 需要目标机支持 `ControlPersist`

**最佳实践**：`forks` 不要超过 CPU 核数 × 2——子进程也是 Python 进程，吃 CPU；加大 forks 不一定加速——被控机 CPU/带宽可能先到瓶颈；调试时把 forks 设 1——单步走查。

---

### 模式 4：WorkerProcess 子进程隔离

**问题场景**：某个 module 崩溃（segfault / OOM）不能拖垮整个 playbook；某个 module 内存泄漏不能积累；Python 全局状态（如 signal handler）需要每个子进程独立。同进程多线程做不到这种"硬隔离"。

**解决方案**：`WorkerProcess` 是 `multiprocessing.Process` 子类，fork 出来的子进程完全独立——崩溃不传染、内存不共享、信号独立处理。用 `queue.put(None)` 哨兵优雅停止。
```python
class WorkerProcess(multiprocessing.Process):
    def run(self):
        signal.signal(signal.SIGTERM, self._signal_handler)
        while True:
            try:
                work_item = self._queue.get(block=True, timeout=1.0)
                if work_item is None: break
                result = self._execute(work_item)
            except queue.Empty:
                continue
```

**关键参数**：
- 进程隔离：`multiprocessing.Process`，避开 GIL、隔离崩溃
- 临时目录：`rsync_tmpdir` per-worker，module 产物临时存放
- 信号处理：子进程独立 `SIGTERM`，不互相干扰
- 哨兵退出：`queue.put(None)` 触发优雅停止
- `block=True, timeout=1.0` 让子进程能响应 SIGTERM

**最佳实践**：子进程完全独立——一个崩了不影响其他；临时目录用 `mkdtemp` + `finally cleanup`——避免残留；子进程退出时主动 flush 输出缓冲区。

---

### 模式 5：async / poll 长任务支持

**问题场景**：部署一个 10GB 数据库需要 30 分钟，但 ansible 默认 task timeout 30 秒。短超时无法处理"启动后要跑几小时"的场景。

**解决方案**：用 `async` + `poll` 拆解"启动"与"轮询"两步：`async: 1800` 让 task 跑在后台最多 30 分钟，`poll: 0` 启动后立即返回不阻塞 playbook，后续 task 用 `async_status` 显式轮询 jid 状态。
```yaml
- name: 启动数据库迁移
  command: /opt/migrate.sh
  async: 1800
  poll: 0
- name: 等待所有迁移完成
  async_status:
    jid: "{{ item.ansible_job_id }}"
  register: job_result
  until: job_result.finished
  retries: 300
  delay: 6
```

**关键参数**：
- `async`：task 最大运行秒数
- `poll`：主进程轮询间隔（默认 10s）
- `poll: 0`：启动后立即返回，不轮询
- `async_status`：显式轮询另一个 jid
- `retries` + `delay` + `until` 经典"轮询直到完成"

**最佳实践**：`async` > 0 让 task 跑在后台——不被 timeout 杀；`poll: 0` 启动后立即返回——不阻塞 playbook 流程；长任务 + 短任务不要混——放不同 play。

---

## 第二段：扩展范式

### 模式 6：SSH connection 插件的"无代理"哲学

**问题场景**：Puppet/Chef 都需要在被控机装 agent——但"装"本身就是鸡生蛋问题：装之前怎么管？firewall 怎么开？agent 升级怎么推？任何需要"先装"的方案都有"冷启动空窗"。

**解决方案**：ansible 走"无代理"路线——只靠 SSH，一个**所有** Linux 都有的东西。`Connection` 插件只负责"如何到达远端"，不依赖任何被控机上的额外软件。Windows 用 WinRM 等价替换。
```python
class Connection(ConnectionBase):
    def _connect(self):
        ssh_cmd = ['ssh', '-o', 'ControlMaster=auto', ...]
        self.ssh = subprocess.Popen(ssh_cmd, ...)
    def exec_command(self, cmd, in_data=None, sudoable=True):
        # 在远端执行命令
        # 读 stdout/stderr/returncode
        ...
```

**关键参数**：
- 通道：SSH（默认）/ WinRM / Paramiko / Local
- 认证：密码 / 公私钥 / Kerberos / 证书
- 持久连接：`ControlMaster=auto` 复用
- 文件传输：SFTP / SCP / pipe
- WinRM 是 Windows 机器的 SSH 等价

**最佳实践**：`pipelining: True` 启用 SSH 长连接——减少 50%+ SSH 握手时间；优先用公私钥 + `ssh-agent`——避免明文密码；Local connection 给本机自调用——跳过 SSH。

---

### 模式 7：ansiballz 黑魔法——把 module 打成 base64 字符串

**问题场景**：module 是 Python 代码，但远端机器可能没装 ansible。如何让远端机器"零安装"也能跑 ansible module？

**解决方案**：ansiballz 把 module 源码 + 依赖（module_utils）打成 zip → base64 字符串，通过 SSH `python -c "exec(base64.b64decode(...))"` 在远端执行。远端机器只需要 Python，连 ansible 都不用装。
```python
def _get_shebang_payload(module_path, arg_paths, task_vars, ...):
    # 1. 读 module 源码
    # 2. 收集所有 module_utils 依赖
    # 3. 注入 ANSIBLE_* 参数
    # 4. zip + base64 打包
    # 5. 构造 wrapper：#!/usr/bin/python ... exec(_ANSIBLE_CODE)
```

**关键参数**：
- 主进程打包：module + module_utils → zip（100KB-2MB）
- base64 编码：zip → ASCII（× 1.37）
- SSH 传输：scp 或 sftp
- 远端执行：`python <module> <args>`，落地临时文件
- 结果回传：JSON stdout（< 10KB）

**最佳实践**：ansiballz 让 module 看起来"自带依赖"——远端不需要装 ansible；临时落地 `/root/.ansible/tmp/...`——远端不留痕；自定义 module 不用 ansiballz——直接 `command: python /path/to/module.py`。

---

### 模式 8：JSONArgs 协议——主进程与远端 module 的接口

**问题场景**：主进程要在远端 module 上调用 `module(arg1=..., arg2=...)`——但 Python pickle 跨进程不安全，跨机器更不安全。需要一个稳定、跨语言、跨版本的 IPC 协议。

**解决方案**：ansiballz 用**纯 JSON**做 IPC：参数序列化为 JSON 通过 stdin 传入，远端 module 反序列化执行，结果用 JSON 写到 stdout。`ANSIBLE_MODULE_ARGS` 是唯一业务入参通道，元数据走其他字段。
```python
# 主进程：构造 module 入参
args = json.dumps({
    'ANSIBLE_MODULE_ARGS': {
        'path': '/etc/nginx/nginx.conf',
        'state': 'present',
    },
    'ANSIBLE_HOST': 'web01.example.com',
})
# 远端 module 入口
def main():
    args = json.loads(sys.stdin.readline())
    result = {'changed': True, 'path': args['ANSIBLE_MODULE_ARGS']['path']}
    print(json.dumps(result))  # stdout 输出结果
```

**关键参数**：
- `ANSIBLE_MODULE_ARGS`：主 → 远端，JSON 业务入参
- `ANSIBLE_HOST` 等元数据：主 → 远端，JSON 环境
- 结果：远端 → 主，JSON stdout
- 错误：远端 → 主，JSON `{"failed": true, "msg": "..."}`
- 调试：远端 → 主，stderr（非结构化）

**最佳实践**：JSON 协议不依赖 Python pickle——跨语言、跨版本安全；任何非 JSON 字段用 `no_log: True` 标记——防泄露；`result['failed']` / `result['changed']` 是约定字段。

---

### 模式 9：module_utils 共享代码库

**问题场景**：100+ module 之间要共享"参数校验"、"文件操作"、"包管理"等工具。每 module 重复写 `if arg is None` 校验是巨大浪费。

**解决方案**：ansiballz 打包时**自动**收集所有 `from ansible.module_utils.xxx import *` 的依赖，把共享代码内联到 module payload 里。`AnsibleModule` 入口类是 80%+ module 的基类，提供参数校验、exit_json/fail_json 等统一接口。
```python
class AnsibleModule:
    def __init__(self, argument_spec, ...):
        self.params = self._load_params()
        self._check_argument_spec()
    def exit_json(self, **kwargs):
        print(json.dumps(kwargs))
        sys.exit(0)
    def fail_json(self, **kwargs):
        kwargs['failed'] = True
        print(json.dumps(kwargs))
        sys.exit(1)
```

**关键参数**：
- `basic.py`：入口类 `AnsibleModule`，被 80%+ module 引用
- `apt.py` / `yum.py`：包管理器抽象
- `urls.py`：HTTP 请求工具
- `files.py`：文件属性操作
- `argument_spec`：集中参数校验入口

**最佳实践**：任何 module 必须从 `ansible.module_utils.basic` import `AnsibleModule`；`argument_spec` 走集中校验——避免重复 `if` 判断；`exit_json` / `fail_json` 是约定——确保主进程能解析；module_utils 改动要谨慎——影响所有 module。

---

### 模式 10：become（sudo）权限提升的 connection 钩子

**问题场景**：很多操作需要 root，但 SSH 登录的是普通用户。如何在不污染 module 代码的前提下注入提权？

**解决方案**：把"提权"实现成 connection 插件的钩子——`become: yes` 让 `exec_command` 在远端命令前注入 `sudo`。`become` 是在 connection 层实现的，**不**污染 module 代码——module 只关心参数。
```python
def exec_command(self, cmd, in_data=None, sudoable=True):
    if sudoable and self._play_context.become:
        cmd = self._play_context.become_method + ' ' + cmd
    return self._run(cmd, in_data)
```

**关键参数**：
- `sudo`：Linux 默认，`sudo -E -u root -H`
- `su`：老 Linux，`su - root -c '...'`
- `pbrun`：PowerBroker 商业版
- `runas`：Windows 走 WinRM
- `doas`：OpenBSD 的轻量提权
- `become_user: postgres` 可指定非 root

**最佳实践**：`become: yes` + `become_method: sudo` 是默认——90% 场景；SSH 登录用户需要在 sudoers——`NOPASSWD` 或 `visudo` 配置；提权是 connection 钩子——不污染 module 代码。

---

## 第三段：进阶范式

### 模式 11：Playbook YAML 解析与 DataLoader

**问题场景**：YAML 解析容易踩坑（缩进、类型转换、重复键）。直接 `yaml.load()` 接受任意 Python 对象，有 RCE 风险。还要支持 Vault 透明解密。

**解决方案**：用 `DataLoader` 统一加载所有 YAML——`safe_load` 拒绝任意 Python 对象、`_FILE_CACHE` 内存缓存避免重复读、`_decrypt_vault` 透明解密 Vault 加密的 YAML。所有加载（playbook/role/inventory）都走同一个入口。
```python
class DataLoader:
    def load_from_file(self, path, ...):
        if path in self._FILE_CACHE:
            return self._FILE_CACHE[path]
        with open(path, 'r') as f:
            data = f.read()
        data = self._decrypt_vault(data, path)
        parsed = yaml.safe_load(data)
        self._FILE_CACHE[path] = parsed
        return parsed
```

**关键参数**：
- YAML parser：`PyYAML`（成熟）
- 缓存：内存 dict，重复 import 加速
- Vault：ansible-vault 原生支持
- `safe_load`：防任意 Python 对象 RCE
- `DataLoader` 注入到 Strategy / Task——所有加载都走它

**最佳实践**：所有 YAML 走 `DataLoader`——统一缓存 + Vault；`safe_load` 拒绝任意 Python 对象——防 RCE；重复 import 同一个文件不会重读——缓存命中；Vault 加密的 YAML 透明解密——用户无感。

---

### 模式 12：Jinja2 模板引擎 + unsafe_proxy 防泄露

**问题场景**：配置文件中要嵌入变量（`{{ port }}`），且密码字段**不能**打到日志。直接 Jinja2 渲染会把密码原文显示在 debug 输出里。

**解决方案**：用 Jinja2 渲染，包装 `unsafe_proxy` 标记敏感字段——`__repr__` 拦截后只显示 `VALUE_DISPLAYED_TO_USER_TRACEBACK`。`no_log: True` 在 task 级别禁止打印敏感字段。
```python
class Templar:
    def template(self, variable):
        if self._is_unsafe(variable):
            return self._wrap_unsafe(variable)
        return self._environment.from_string(variable).render(self._available_variables)
    def _wrap_unsafe(self, value):
        return wrap_var(value)  # repr 时只显示 VALUE_DISPLAYED_TO_USER_TRACEBACK
```

**关键参数**：
- `{{ var }}`：Jinja2 变量替换
- `{{ var | filter }}`：Jinja2 filter 链
- `{{ var | default('x') }}`：默认值 filter
- `no_log: True`：task 敏感字段不打印
- `unsafe_proxy`：标记密码字段，避免日志泄露

**最佳实践**：密码字段必须用 `no_log: True`——防 `ansible-playbook` 输出；`{{ var | default('x') }}` 比 `if-else` 简洁；Jinja2 支持 `{% if %}` / `{% for %}`——但 playbook 里不建议复杂逻辑。

---

### 模式 13：Ansible Vault 加密

**问题场景**：playbook 里有密码/API key——直接 commit 到 git 不安全。需要"加密后可审计"+"运行时透明解密"的存储方案。

**解决方案**：Ansible Vault 用 AES-256-CTR 加密整个 YAML 文件，PBKDF2 + 10000 轮做 KDF 抗暴力破解。Header `$ANSIBLE_VAULT;1.1;AES256` 标识文件类型。`DataLoader` 钩子在加载时透明解密——用户无感。
```bash
# 创建 / 编辑 / 加密 / 解密
ansible-vault create secret.yml
ansible-vault edit secret.yml
ansible-vault encrypt vars.yml
ansible-vault decrypt vars.yml
# 运行时提供密码
ansible-playbook site.yml --ask-vault-pass
ansible-playbook site.yml --vault-password-file ~/.vault_pass
```

**关键参数**：
- 算法：AES-256-CTR，工业级
- KDF：PBKDF2 + 10000 轮，抗暴力
- Header：`$ANSIBLE_VAULT;1.1;AES256`
- 多密码：`--vault-id label@path` 支持多 vault
- 透明解密：DataLoader 钩子自动处理

**最佳实践**：密码文件 `chmod 600`——严禁进 git；不同环境用不同 vault（dev/staging/prod）——`--vault-id` 隔离；`ansible-vault rekey` 定期换密码；vault 文件可纳入 git——加密后可审计 diff。

---

### 模式 14：变量优先级链的 22 个 source

**问题场景**：同一个变量可能在 22 个地方定义，优先级必须明确。CI 注入的环境变量、playbook 里的 vars、host facts 冲突时，ansible 必须给出"谁覆盖谁"的铁律。

**解决方案**：ansible 的变量优先级是"显式大于隐式"——`command-line > playbook vars > host facts > role defaults > ...`。22 个 source 排成一条链，命中即用。
```
优先级从高到低：
1. -e command line        # 全局最强
2. role params             # role 传参
3. play vars               # play 内 vars
4. vars_files              # play 外部 vars
5. role vars               # role 内 vars
6. host facts              # setup 模块采集
7. play defaults           # play 默认
8. role defaults           # role 默认
9. group_vars / host_vars  # 主机清单分组
10. inventory vars         # 清单内置
```

**关键参数**：
- `-e` command line：全局最强，CI/CD 注入环境变量用
- `defaults/`：role 的"安全默认值"——可被覆盖
- `host_vars/<hostname>.yml`：单 host 配置
- `group_vars/<group>.yml`：组级配置
- `debug: var=foo` 看实际生效值——不要猜

**最佳实践**：不要在 5 个地方定义同一个变量——难调试；显式 `-e` 是"压倒性"——CI/CD 注入用；用 `debug: var=foo` 看实际生效值——不要凭直觉猜；把可变配置（端口、路径）放在 `-e`，把不可变默认值放在 `defaults/`。

---

### 模式 15：Handlers 与 notify 的"事件驱动"

**问题场景**：nginx 配置改了，要 reload；服务首次安装要启动；配置文件变了**只**触发**一次**。在每个 task 后写"reload if changed"会让代码膨胀。

**解决方案**：Handler 是"只在 notify 时执行"的 task，**且**整个 play 结束才跑。`notify` 在 task `changed: true` 时触发，handler 在 play 末尾**每个 handler 只跑 1 次**——天然去重。
```yaml
- name: 部署 nginx 配置
  template:
    src: nginx.conf.j2
    dest: /etc/nginx/nginx.conf
  notify: reload nginx
handlers:
  - name: reload nginx
    service:
      name: nginx
      state: reloaded
```

**关键参数**：
- `notify`：task `changed: true` 时触发
- `handler`：被 notify 后排队，play 末尾跑，每个只跑 1 次
- `force_handlers`：play 失败时也跑
- `flush_handlers`：task 主动调用立即跑
- 失败时 handler 默认不跑——`force_handlers: yes` 改

**最佳实践**：handler 不是"修复"——是"事件响应"；整个 play 结束才跑——避免 reload 多次；同名 handler 在 play 末尾只跑 1 次——天然去重；`flush_handlers` 提前刷新——中间有"必须等 handler 跑完"的 task。

---

## 第四段：实战范式

### 模式 16：7 大类插件的能力扩展点

**问题场景**：ansible 不可能内置所有"连接方式"（SSH/WinRM/Local）、所有"模块"（apt/yum/docker）、所有"过滤"（upper/lower/json_query）——必须有插件机制。

**解决方案**：定义 7 大类插件作为 ansible 的所有扩展点：`connection`（通道）、`action`（任务动作）、`lookup`（数据查找）、`filter`（数据转换）、`test`（条件判断）、`strategy`（执行策略）、`callback`（输出回调）。每类插件都是 `BasePlugin` 子类，独立分发与加载。
```python
PLUGIN_TYPES = [
    'connection',   # ssh / winrm / local / docker
    'action',       # normal / copy / template
    'lookup',       # file / template / env / pipe
    'filter',       # upper / lower / json_query
    'test',         # defined / file_exists / version
    'strategy',     # linear / free / host_pinned
    'callback',     # json / yaml / junit
]
```

**关键参数**：
- `connection`：远端通道，`ssh.py` / `winrm.py` / `local.py`
- `action`：任务动作，`copy.py` / `template.py`
- `lookup`：数据查找，`file.py` / `env.py` / `pipe.py`
- `filter`：数据转换，`upper.py` / `json_query.py`
- `test`：条件判断，`defined.py` / `version.py`
- `strategy`：执行策略，`linear.py` / `free.py`
- `callback`：输出回调，`json.py` / `junit.py`

**最佳实践**：7 大类覆盖了 ansible 所有扩展点；自定义插件放 `~/.ansible/plugins/<type>/<name>.py` 或 role 内；Collection 是插件的"分发单位"——多个插件打包；插件必须继承 `BasePlugin`——统一接口。

---

### 模式 17：Collection 仓库的"分发单位"

**问题场景**：plugin 散落各仓库——用户安装/升级混乱。一个 collection 想用另一个 collection 的 lookup，但没声明依赖——运行时找不到。

**解决方案**：ansible 2.10 引入 **Collection** 概念：一个 collection 是一个**版本化的命名空间**，里面是一组相关插件/角色/模块/playbook。命名空间强制——避免冲突。`galaxy.yml` 声明 `dependencies`——自动安装依赖。
```bash
# 安装 collection
ansible-galaxy collection install community.general
# 安装特定版本
ansible-galaxy collection install community.general:5.0.0
# 从本地 tarball 安装
ansible-galaxy collection install my_ns-my_coll-1.0.0.tar.gz
```

**关键参数**：
- 命名空间：`<namespace>.<collection>`（如 `community.general`）
- 仓库：`github.com/ansible-collections/<namespace>.<collection>`
- 版本：SemVer 2.0 严格
- 依赖：`galaxy.yml` 声明 `dependencies:`
- 安装路径：`~/.ansible/collections/ansible_collections/<namespace>/<collection>/`

**最佳实践**：Collection 取代了旧的 `roles/` 单体分发；`requirements.yml` 锁定 collection 版本——CI 一致；写自定义 collection——`ansible-galaxy collection init my_ns.my_coll`；Collection 内部版本独立于 ansible-core——升级节奏解耦。

---

### 模式 18：dynamic inventory 脚本化主机清单

**问题场景**：1000+ 台机器的主机清单**不可能**手写 ini/yaml。云上 EC2 每天有实例启停——手写清单永远追不上。

**解决方案**：dynamic inventory 用脚本（任何语言）实时返回主机清单——对接 AWS EC2、Azure VM、CMDB。约定：脚本接收 `--list` 返回所有 host + groups JSON，`--host <hostname>` 返回单 host vars，stdout 是契约。
```python
#!/usr/bin/env python
import json
import boto3
def main():
    ec2 = boto3.client('ec2')
    instances = ec2.describe_instances()
    inventory = {
        '_meta': {'hostvars': {}},
        'web': [],
        'db': [],
    }
    for r in instances['Reservations']:
        for i in r['Instances']:
            name = i['Tags'][0]['Value']
            inventory['_meta']['hostvars'][name] = {
                'ansible_host': i['PrivateIpAddress'],
            }
    print(json.dumps(inventory))
```

**关键参数**：
- `--list`：返回所有 host + groups（JSON）
- `--host <hostname>`：返回单 host vars
- `_meta.hostvars`：必须输出，否则 hostvars 为空
- 缓存：inventory 缓存到本地文件，避免每次打 AWS API
- `hostvars` 提前 prefetch 加载

**最佳实践**：用 `ec2.py` / `gce.py` / `azure_rm.py` 等官方脚本；自定义 dynamic inventory 必须输出 `_meta.hostvars`；缓存 inventory 到本地文件——避免每次都打 AWS API；dynamic inventory 只返回 JSON——stdout 是契约。

---

### 模式 19：lookup / filter / test 三种模板扩展

**问题场景**：模板里要查文件、读环境变量、转大写、判断文件是否存在。每种需求都写一个 module 太重——需要"轻量扩展点"。

**解决方案**：ansible 提供 `lookup()`、`| filter`、`is test` 三种语法扩展。`lookup` 在渲染时查找数据（file/env/pipe），`filter` 在渲染时转换数据（upper/json_query），`test` 在 when 条件里判断（defined/file）。
```yaml
# lookup：查数据
vars:
  mysql_password: "{{ lookup('file', '/etc/mysql/password') }}"
  env_home: "{{ lookup('env', 'HOME') }}"
# filter：转换数据
tasks:
  - debug:
      msg: "{{ 'hello' | upper }}"
# test：条件判断
tasks:
  - debug:
      msg: "is file"
    when: my_path is file
```

**关键参数**：
- `lookup('name', args)`：渲染时查找，`file` / `env` / `pipe` / `template`
- `value | name(args)`：渲染时转换，`upper` / `lower` / `json_query`
- `value is name`：when 条件判断，`defined` / `file` / `directory`
- `lookup` 默认 1 个结果，`wantlist=True` 拿列表
- `filter` 是 chain——`value | filter1 | filter2`

**最佳实践**：`lookup` 接收任意类型参数（路径、URL、命令）；`test` 只返回 boolean——`is` 是约定；自定义 lookup / filter / test 写 plugin 即可；在 playbook 顶部用 `lookup` 收集动态数据，避免在 task 里反复调。

---

### 模式 20：role 与 import/include 的模块化

**问题场景**：playbook 写长了无法维护。100 个 task 平铺在一个 site.yml 里——审 PR 像读天书。

**解决方案**：role 是"标准化目录结构"的模块单位——`tasks/main.yml` + `handlers/main.yml` + `vars/main.yml` + `defaults/main.yml` + `templates/` + `files/` + `meta/main.yml`。`import_*` 是"静态展开"（预解析），`include_*` 是"动态调用"（运行时条件触发）。
```yaml
# site.yml
- hosts: all
  roles:
    - common
    - { role: nginx, tags: ['web'] }
    - { role: db, vars: { db_name: 'app' } }
# tasks/main.yml
- import_tasks: setup.yml
- include_tasks: dynamic.yml
  when: condition
```

**关键参数**：
- `import_tasks`：静态包含，**预解析**
- `include_tasks`：动态包含，**条件触发**
- `import_role`：静态 role 引用
- `include_role`：动态 role 引用
- `roles:`：playbook 顶部静态包含
- `meta/main.yml`：声明 role 依赖——自动 include 依赖

**最佳实践**：role 目录结构强约定——`tasks/main.yml` 是入口；`defaults/main.yml` 是 role 默认值——可被覆盖；`import_*` 是"展开"——`include_*` 是"调用"；用 `tags` 给 role 打标——`ansible-playbook site.yml --tags web`。

---

## 附：仓库元信息

| 字段 | 值 |
|:---|:---|
| 仓库 | `github.com/ansible/ansible` |
| 协议 | GPL-3.0 |
| 总文件 | ~3500（lib/ansible + test + docs） |
| 主语言 | Python |
| 当前版本 | 2.x devel（持续滚动） |
| 团队 | Red Hat + 5000+ 社区贡献者 |
| 商业模式 | 上游开源 + Ansible Automation Platform 商业版 |
| 关键里程碑 | 1.x → 2.0 strategy → 2.10 community 拆出 → ansible-core 独立包 |
