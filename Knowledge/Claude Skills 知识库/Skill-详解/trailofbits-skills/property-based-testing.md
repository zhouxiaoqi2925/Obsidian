---
tags: [claude-skill, trailofbits, security, testing]
source: trailofbits-skills/plugins/property-based-testing
---

# property-based-testing

## 1. 元信息
- **仓库源**：trailofbits-skills/plugins/property-based-testing
- **路径**：`C:\Users\15389\claude-skills\trailofbits-skills\plugins\property-based-testing`
- **分类**：安全 > 测试
- **触发词**："Use when the user asks to do fuzzing, property-based testing, or generate test cases from properties"

## 2. 一句话定位
**基于属性的测试（Property-Based Testing, PBT）**——自动生成大量随机输入验证代码不变量。

## 3. 与传统单元测试的区别

| 维度 | 单元测试 | PBT |
|------|---------|-----|
| 测试用例 | 手动写 | 自动生成 |
| 数量 | 几个 | 数百到数千 |
| 覆盖 | 特定场景 | 边界 + 随机组合 |
| 失败时 | 具体值 | **最小反例**（shrinking） |

## 4. 工作流

```
Step 1: 识别属性（不变量）
  - 不变量：任何输入都应满足的条件
  - 例：sort([3,1,2]) == [1,2,3]
  - 例：reverse(reverse(x)) == x
  ↓
Step 2: 用 Hypothesis / QuickCheck 编码
  ↓
Step 3: 自动生成 1000+ 测试用例
  ↓
Step 4: 失败时自动 shrinking
  - 找到最小的反例
  ↓
Step 5: 报告 + 复现脚本
```

## 5. 工具支持

| 语言 | 库 |
|------|-----|
| Python | Hypothesis |
| Haskell | QuickCheck |
| Scala | ScalaCheck |
| JavaScript | fast-check |
| Rust | proptest |
| Java | jqwik |

## 6. 调用示例

```python
from hypothesis import given, strategies as st

# 属性：对任意列表，reverse(reverse(x)) == x
@given(st.lists(st.integers()))
def test_reverse_twice(xs):
    assert list(reversed(list(reversed(xs)))) == xs
```

## 7. 与其它 Skill 的关系
- **配合**：`engineering/api-test-suite-builder`
- **集成**：可作为 CI/CD 的一部分

## 8. 来源链接
- GitHub: https://github.com/trailofbits/skills
- 本地路径：`C:\Users\15389\claude-skills\trailofbits-skills\plugins\property-based-testing`