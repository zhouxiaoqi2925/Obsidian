---
date: 2026-08-01
timestamp: 2026-08-01 10:00
tags: [技术, Lil'Log, 每日抓取, 抓取]
source: https://lilianweng.github.io/index.xml
count: 5
full_content: 5
code_items: 1
---

# 🧪 Lil'Log Top 5 (2026-08-01)

## 前面介绍

- 数据源：Lil'Log
- 抓取日期：2026-08-01
- 条目数：5
- 含完整正文：5
- 含代码片段：1
- 组织方式：前面介绍 / 树状图 / 文字描述 / 代码解析 / 源码

## 思维导图

```mermaid
mindmap
  root((Lil'Log))
    强化学习课程学习综述
    大语言模型对抗性攻击综述
    谨慎看待缩放定律
    面向好奇者的深度学习概览
    提示工程指南
```

## 详细整理（5 条，5 条含全文，1 条含代码）

### 1. 强化学习课程学习综述
- **链接**: [https://lilianweng.github.io/posts/2020-01-29-curriculum-rl/](https://lilianweng.github.io/posts/2020-01-29-curriculum-rl/)
- **发布**: Wed, 29 Jan 2020 00:00:00 +0000

#### 前面介绍

- 课程学习通过逐步增加训练样本的难度来加速模型收敛。
- Bengio等人提出清洁样本能带来更好的泛化能力。
- Zaremba和Sutskever发现混合策略通常优于单纯增加难度的策略。

#### 树状图

```mermaid
mindmap
  root((强化学习课程学习综述))
    前面介绍
    文字描述
    代码解析
    源码
```

#### 文字描述

- Elman在1993年提出神经网络课程学习的概念，通过从简单数据开始逐步增加复杂度来训练模型。
- Bengio等人的研究指出，课程学习可以加快在线训练速度，但设计有效的课程策略具有挑战性。
- Zaremba和Sutskever通过控制Python代码的长度和嵌套深度来控制程序复杂度，发现混合策略能避免遗忘。
- PCG（程序化内容生成）是创建不同难度视频游戏的流行方法，涉及算法随机性和人类专业知识。

#### 代码解析

- 本文未提供源码，以下为实现思路或结构解析

#### 源码

#### 中文节选

[Updated on 2020-02-03: 在“任务特定课程”部分提及了 [PCG](#pcg)。

[Updated on 2020-02-04: 增加了一个新的 [“通过蒸馏进行课程学习”](#curriculum-through-distillation) 章节。

如果我们想教一个连基本算术都不知道的3岁孩子积分或导数，这听起来像是一项不可能完成的任务。这就是为什么教育很重要，因为它提供了一种系统化的方法来分解复杂知识，并为从简单到困难的概念教学提供了一个很好的课程。课程让学习困难的事情对我们人类来说变得更容易、更可及。但是，机器学习模型呢？我们能否通过课程学习更高效地训练模型？我们能否设计一个课程来加速学习？

早在1993年，Jeffrey Elman 就提出了通过课程学习训练神经网络的想法。他在学习简单语言语法方面的早期工作证明了这种策略的重要性：从一组受限的简单数据开始，并逐渐增加训练样本的复杂性；否则，模型根本无法学习。

与没有课程的学习相比，我们预期采用课程学习可以加速收敛速度，并且可能会或可能不会提高最终模型的性能。设计一个高效且有效的课程并不容易。请记住，糟糕的课程甚至可能会阻碍学习。

接下来，我们将研究几种类别的课程学习，如图所示。大多数情况应用于强化学习，监督学习中有少数例外。

在“The importance of starting small”论文（[Elman 1993](http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.128.4487&rep=rep1&type=pdf)）中，我特别喜欢开篇的句子，发现它们既鼓舞人心又引人深思：

“人类在许多维度上与其他物种不同，但有两个维度尤为显著。人类表现出卓越的学习能力；而人类在达到成熟所需的异常漫长的时间方面也令人瞩目。学习的适应性优势是显而易见的，而且可以说，通过文化，学习为基于非遗传的行为传递奠定了基础，这可能加速了我们物种的进化。”

确实，学习可能是我们人类拥有的最好超能力。

# 针对任务的课程[#](#task-specific-curriculum)

[Bengio 等人 (2009)](https://www.researchgate.net/profile/Y_Bengio/publication/221344862_Curriculum_learning/links/546cd2570cf2193b94c577ac/Curriculum-learning.pdf) 在过去提供了关于课程学习的良好概述。该论文通过使用手动设计的针对任务的课程玩具实验，提出了两个观点：

- 更干净的示例可能更快地带来更好的泛化能力。
- 逐渐引入更困难的示例可以加速在线训练。

某些课程策略可能是无用甚至有害的。该领域一个值得回答的好问题是：*什么可能是

#### 完整正文（中文）

[Updated on 2020-02-03: 在“任务特定课程”部分提及了 [PCG](#pcg)。

[Updated on 2020-02-04: 增加了一个新的 [“通过蒸馏进行课程学习”](#curriculum-through-distillation) 章节。

如果我们想教一个连基本算术都不知道的3岁孩子积分或导数，这听起来像是一项不可能完成的任务。这就是为什么教育很重要，因为它提供了一种系统化的方法来分解复杂知识，并为从简单到困难的概念教学提供了一个很好的课程。课程让学习困难的事情对我们人类来说变得更容易、更可及。但是，机器学习模型呢？我们能否通过课程学习更高效地训练模型？我们能否设计一个课程来加速学习？

早在1993年，Jeffrey Elman 就提出了通过课程学习训练神经网络的想法。他在学习简单语言语法方面的早期工作证明了这种策略的重要性：从一组受限的简单数据开始，并逐渐增加训练样本的复杂性；否则，模型根本无法学习。

与没有课程的学习相比，我们预期采用课程学习可以加速收敛速度，并且可能会或可能不会提高最终模型的性能。设计一个高效且有效的课程并不容易。请记住，糟糕的课程甚至可能会阻碍学习。

接下来，我们将研究几种类别的课程学习，如图所示。大多数情况应用于强化学习，监督学习中有少数例外。

在“The importance of starting small”论文（[Elman 1993](http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.128.4487&rep=rep1&type=pdf)）中，我特别喜欢开篇的句子，发现它们既鼓舞人心又引人深思：

人类在许多维度上与其他物种不同，但有两个维度尤为显著。人类表现出非凡的学习能力；而且，人类在达到成熟期所需的时间之长方面也令人瞩目。学习的适应优势是显而易见的，而且可以说，通过文化，学习为基于非遗传的行为传递奠定了基础，这可能加速了我们物种的进化。

确实，学习可能是我们人类拥有的最好超能力。

# 面向任务的课程[#](#task-specific-curriculum)

[Bengio 等人 (2009)](https://www.researchgate.net/profile/Y_Bengio/publication/221344862_Curriculum_learning/links/546cd2570cf2193b94c577ac/Curriculum-learning.pdf) 在过去提供了关于课程学习的一个很好的概述。该论文提出了两个观点，并使用手动设计的面向任务的课程进行了玩具实验：

- 更清洁的示例可能更快地带来更好的泛化能力。
- 逐步引入更困难的示例可以加速在线训练。

某些课程策略可能是无用甚至有害的。该领域一个值得回答的好问题是：*是什么通用原则使得某些课程策略比其他策略效果更好？* Bengio 2009 年的论文假设，让学习专注于“有趣”的示例（既不太难也不太容易）将是有益的。

如果我们简单的课程是逐步增加复杂度来训练模型，那么我们需要一种方法来首先量化任务的难度。一个想法是使用其在另一个模型上的最小损失，而该模型在其他任务上进行了预训练（[Weinshall 等人 2018](https://arxiv.org/abs/1802.03796)）。通过这种方式，预训练模型的知识可以通过建议训练样本的顺序传递给新模型。图 2 展示了 `curriculum` 组（绿色）相对于 `control` 组（随机顺序；黄色）和 `anti` 组（反转顺序；红色）的有效性。

[Zaremba & Sutskever (2014)](https://arxiv.org/abs/1410.4615) 做了一个有趣的实验，训练 LSTM 来预测短 Python 程序的输出，该程序用于数学运算，但并不实际执行代码。他们发现课程学习对于学习是必要的。程序的复杂度由两个参数控制，`length` ∈ [1, a] 和 `nesting`∈ [1, b]。考虑了三种策略：

- **朴素课程**：首先增加 `length` 直到达到 `a`；然后增加 `nesting` 并将 `length` 重置为 1；重复此过程直到两者都达到最大值。
- **混合课程**：采样 `length`~ [1, a] 和 `nesting`~ [1, b]
- **组合**：朴素 + 混合。

他们注意到组合策略总是优于朴素课程，并且通常会（但并非总是）优于混合策略——这表明在训练中混合简单任务对于 *避免遗忘* 至关重要。

[Procedural content generation (][PCG](https://en.wikipedia.org/wiki/Procedural_generation)) is a popular approach for creating video games of various levels of difficulty. PCG involves algorithmic randomness and a heavy dose of human expertise in designing game elements and dependencies among them. Procedurally generated levels have been introduced into several benchmark environments for evaluating whether an RL agent can generalize to a new level that it is not trained on ([meta-RL](https://lilianweng.github.io/posts/2019-06-23-meta-rl/)!), such as [GVGAI](http://www.gvgai.net/), OpenAI [CoinRun](https://openai.com/blog/quantifying-generalization-in-reinforcement-learning/) and [Procgen benchmark](https://openai.com/blog/procgen-benchmark/). Using GVGAI, [Justesen, et al. (2018)](https://arxiv.org/abs/1806.10729) demonstrated that an RL policy can easily overfit to a specific game but training over a simple curriculum that grows the task difficulty together with the model performance helps its generalization to new human-designed levels. Similar results are also found in CoinRun ([Cobbe, et al. 2018](https://arxiv.org/abs/1812.02341)). POET ([Wang et al, 2019](https://arxiv.org/abs/1901.01753)) is another example for leveraging evolutionary algorithm and procedural generated game levels to improve RL generalization, which I’ve described in details in my [meta-RL post](https://lilianweng.github.io/posts/2019-06-23-meta-rl/#evolutionary-algorithm-on-environment-generation).

To follow the curriculum learning approaches described above, generally we need to figure out two problems in the training procedure:

- Design a metric to quantify how hard a task is so that we can sort tasks accordingly.
- Provide a sequence of tasks with an increasing level of difficulty to the model during training.


然而，任务的顺序不必是顺序的。在我们的魔方论文（[OpenAI et al, 2019](https://arxiv.org/abs/1910.07113.））中，我们依赖于*自动领域随机化*（**ADR**）通过增长一系列复杂度递增的环境分布来生成课程。每个任务的难度（即在特定环境中解决魔方）取决于各种环境参数的随机化范围。即使假设所有环境参数都不相关，我们也能够为我们的机械手创建一个相当不错的课程。

# 教师引导式课程[#](#teacher-guided-curriculum)

*自动课程学习*（**ACL**）的概念由 [Graves 等人 2017](https://arxiv.org/abs/1704.03003) 稍早提出。它将 $N$ 任务课程视为一个[$N$臂老虎机](https://lilianweng.github.io/posts/2018-01-23-multi-armed-bandit/)问题，以及一个学习优化该老虎机回报的自适应策略。

论文中考虑了两种类别的学习信号：

- 损驱动的进度：一次梯度更新前后损失函数的变化。这种类型的奖励信号跟踪学习过程的速度，因为最大的任务损失减少等同于最快的学习。
- 复杂驱动的进度：网络权重后验分布与先验分布之间的 KL 散度。这种类型的学习信号受到[MDL](https://en.wikipedia.org/wiki/Minimum_description_length)原理的启发，“增加一定量的模型复杂度只有在压缩数据量更大的情况下才是值得的”。因此，模型复杂度预期会在模型很好地泛化到训练样本时增加最多。

[通过另一个 RL 代理自动提出课程的方法被形式化为 ]*Teacher-Student Curriculum Learning* (**TSCL**; [Matiisen, et al. 2017](https://arxiv.org/abs/1707.00183))。在 TSCL 中，*学生* 是一个正在执行实际任务的 RL 代理，而 *教师* 代理则是用于选择任务的策略。学生的目标是掌握一个可能很难直接学习的复杂任务。为了使这个任务更容易学习，我们设置教师代理通过选择适当的子任务来指导学生的训练过程。

在这个过程中，学生应该学习能够：

- 帮助学生实现最快学习进度的任务，或
- 有被遗忘风险的任务。

注意：将教师模型构建为 RL 问题的设置感觉与神经架构搜索 (NAS) 非常相似，但不同的是 TSCL 中的 RL 模型在任务空间上运行，而 NAS 在主模型架构空间上运行。

训练教师模型是解决一个 [POMDP](https://en.wikipedia.org/wiki/Partially_observable_Markov_decision_process) 问题：

- 不可观测的 $s_t$ 是学生模型的完整状态。
- 可观测的 $o = (x_t^{(1)}, \dots, x_t^{(N)})$ 是 $N$ 个任务的分数列表。
- 动作 $a$ 是选择一个子任务。
- 每步的奖励是分数差 $r_t = \sum_{i=1}^N x_t^{(i)} - x_{t-1}^{(i)}$（即，相当于在回合结束时最大化所有任务的分数）。

从嘈杂的任务分数中估计学习进度，同时平衡探索与利用的方法，可以从非平稳多臂老虎机问题中借鉴——使用 [ε-greedy](https://lilianweng.github.io/posts/2018-01-23-multi-armed-bandit/#%CE%B5-greedy-algorithm)，或 [Thompson sampling](https://lilianweng.github.io/posts/2018-01-23-multi-armed-bandit/#thompson-sampling)。

总结来说，核心思想是使用一个策略为另一个策略提出任务，以便后者学习得更好。有趣的是，上述两项工作（在离散任务空间中）都发现从所有任务中均匀采样是一个出奇强大的基准。

如果任务空间是连续的呢？[Portelas, et al. (2019)](https://arxiv.org/abs/1910.07224) 研究了一个连续的教师-学生框架，其中教师必须从连续任务空间中采样参数来生成学习课程。给定一个新采样的参数 $p$，绝对学习进度（Absolute Learning Progress，简称 ALP）被测量为 $\text{ALP}_p = \vert r - r_\text{old} \vert$，其中 $r$ 是与 $p$ 相关的回合奖励，$r_\text{old}$ 是与 $p_\text{old}$ 相关的奖励。这里，$p_\text{old}$ 是任务空间中距离 $p$ 最近的先前采样的参数，可以通过最近邻检索。请注意，这个 ALP 分数与上面 [TSCL](#TSCL) 或 [Grave, et al. 2017](#grave-et-al-2017) 中的学习信号有何不同：ALP 分数测量的是两个任务之间的奖励差异，而不是同一任务在两个时间步上的性能。

在任务参数空间之上，训练了一个高斯混合模型来拟合 $\text{ALP}_p$ 在 $p$ 上的分布。在采样任务时使用 ε-greedy 策略：以一定的概率随机采样一个任务；否则，从 GMM 模型中按 ALP 分数比例采样。

# Curriculum through Self-Play[#](#curriculum-through-self-play)

与教师-学生框架不同，两个智能体在做非常不同的事情。教师学习为学生选择任务，而无需了解实际的任务内容。如果我们想让它们直接在主任务上进行训练呢？甚至让它们互相竞争怎么样？

[Sukhb


### 2. 大语言模型对抗性攻击综述
- **链接**: [https://lilianweng.github.io/posts/2023-10-25-adv-attack-llm/](https://lilianweng.github.io/posts/2023-10-25-adv-attack-llm/)
- **发布**: Wed, 25 Oct 2023 00:00:00 +0000

#### 前面介绍

- 对抗性攻击旨在通过输入触发模型输出不受期望的内容。
- 文本攻击比图像攻击更具挑战性，因为缺乏直接的梯度信号。
- 攻击主要分为白盒和黑盒两种设置。

#### 树状图

```mermaid
mindmap
  root((大语言模型对抗性攻击综述))
    前面介绍
    文字描述
    代码解析
    源码
```

#### 文字描述

- 威胁模型假设攻击仅发生在推理时，模型权重固定。
- 分类任务中，攻击者寻找与原始输入几乎不可感知差异的对抗样本。
- 生成任务中，攻击旨在让模型输出不安全内容或泄露训练数据。
- Token操作攻击通过替换同义词等简单操作触发模型错误预测。
- 梯度攻击依赖于梯度信号来学习有效的攻击方法。
- 越狱提示攻击通常基于启发式提示来绕过模型的安全机制。

#### 代码解析

- 本文未提供源码，以下为实现思路或结构解析

#### 源码

#### 中文节选

The use of large language models in the real world has strongly accelerated by the launch of ChatGPT. We (including my team at OpenAI, shoutout to them) have invested a lot of effort to build default safe behavior into the model during the alignment process (e.g. via [RLHF](https://openai.com/research/learning-to-summarize-with-human-feedback)). However, adversarial attacks or jailbreak prompts could potentially trigger the model to output something undesired.

A large body of ground work on adversarial attacks is on images, and differently it operates in the continuous, high-dimensional space. Attacks for discrete data like text have been considered to be a lot more challenging, due to lack of direct gradient signals. My past post on [Controllable Text Generation](https://lilianweng.github.io/posts/2021-01-02-controllable-text-generation/) is quite relevant to this topic, as attacking LLMs is essentially to control the model to output a certain type of (unsafe) content.

There is also a branch of work on attacking LLMs to extract pre-training data, private knowledge ([Carlini et al, 2020](https://arxiv.org/abs/2012.07805)) or attacking model training process via data poisoning ([Carlini et al. 2023](https://arxiv.org/abs/2302.10149)). We would not cover those topics in this post.

# Basics[#](#basics)

## Threat Model[#](#threat-model)

Adversarial attacks are inputs that trigger the model to output something undesired. Much early literature focused on classification tasks, while recent effort starts to investigate more into outputs of generative models. In the context of large language models In this post we assume the attacks only happen **at inference time**, meaning that **model weights are fixed**.

### Classification[#](#classification)

Adversarial attacks on classifiers have attracted more attention in the research community in the past, many in the image domain. LLMs can be used for classification too. Given an input $\mathbf{x}$ and a classifier $f(.)$, we would like to find an adversarial version of the input, denoted as $\mathbf{x}_\text{adv}$, with imperceptible difference from $\mathbf{x}$, such that $f(\mathbf{x}) \neq f(\mathbf{x}_\text{adv})$.

### 文本生成[#](#text-generation)

给定输入 $\mathbf{x}$ 和生成模型 $p(.)$，模型输出一个样本 $\mathbf{y} \sim p(.\vert\mathbf{x})$。对抗性攻击将识别出这样的 $p(\mathbf{x})$，使得 $\mathbf{y}$ 违反模型的内置安全行为；例如，在非法话题上输出不安全内容，泄露私人信息或模型训练数据。对于生成任务，判断攻击是否成功并不容易，这需要高质量的分类器来判断 $\mathbf{y}$ 是否不安全或进行人工审查。

### 白盒与黑盒[#](#white-box-vs-black-box)

白盒攻击假设攻击者对模型权重、架构和训练流程拥有完全访问权限，从而攻击者可以获得梯度信号

#### 完整正文（中文）

ChatGPT 的推出极大地加速了大型语言模型在现实世界中的使用。我们（包括我在 OpenAI 的团队，向他们致敬）在对齐过程中投入了大量精力，将默认的安全行为构建到模型中（例如通过 [RLHF](https://openai.com/research/learning-to-summarize-with-human-feedback)）。然而，对抗性攻击或越狱提示词可能会触发模型输出不受欢迎的内容。

大量关于对抗性攻击的早期工作集中在图像上，其操作方式不同，是在连续的高维空间中进行的。由于缺乏直接的梯度信号，针对离散数据（如文本）的攻击被认为要困难得多。我之前关于 [Controllable Text Generation](https://lilianweng.github.io/posts/2021-01-02-controllable-text-generation/) 的帖子与此话题非常相关，因为攻击 LLM 本质上就是控制模型输出某种类型（不安全）的内容。

还有另一类工作旨在攻击 LLM 以提取预训练数据、私有知识（[Carlini et al, 2020](https://arxiv.org/abs/2012.07805)）或通过数据投毒攻击模型训练过程（[Carlini et al. 2023](https://arxiv.org/abs/2302.10149)）。我们不会在本文中涵盖这些话题。

# Basics[#](#basics)

## Threat Model[#](#threat-model)

对抗性攻击是触发模型输出不受欢迎内容的输入。早期的文献主要集中在分类任务上，而最近的努力开始更多地研究生成模型的输出。在大型语言模型的背景下，本文假设攻击仅发生在**推理时间**，这意味着**模型权重是固定的**。

### Classification[#](#classification)

过去，针对分类器的对抗性攻击在研究社区中引起了更多关注，许多工作集中在图像领域。LLM 也可以用于分类。给定输入 $\mathbf{x}$ 和分类器 $f(.)$，我们希望找到输入的一个对抗版本，记为 $\mathbf{x}_\text{adv}$，它与 $\mathbf{x}$ 的差异不可察觉，使得 $f(\mathbf{x}) \neq f(\mathbf{x}_\text{adv})$。

### 文本生成[#](#text-generation)

给定输入 $\mathbf{x}$ 和生成模型 $p(.)$，模型输出一个样本 $\mathbf{y} \sim p(.\vert\mathbf{x})$。对抗性攻击将识别出这样的 $p(\mathbf{x})$，使得 $\mathbf{y}$ 违反模型的内置安全行为；例如，在非法话题上输出不安全内容，泄露私人信息或模型训练数据。对于生成任务，判断攻击是否成功并不容易，这需要高质量极高的分类器来判断 $\mathbf{y}$ 是否不安全或进行人工审查。

### 白盒与黑盒攻击[#](#white-box-vs-black-box)

白盒攻击假设攻击者拥有对模型权重、架构和训练流程的完全访问权限，从而攻击者可以获取梯度信号。我们假设攻击者无法访问完整的训练数据。这仅适用于开源模型。黑盒攻击假设攻击者只能访问类似 API 的服务，他们提供输入 $\mathbf{x}$ 并返回样本 $\mathbf{y}$，而不知道关于模型的任何其他信息。

# 对抗性攻击类型[#](#types-of-adversarial-attacks)

有多种方法可以找到对抗性输入，以触发 LLM 输出不需要的内容。我们在此介绍五种方法。

| 攻击 | 类型 | 描述 | 
|---|---|---|
| Token 操作 | 黑盒 | 改变文本输入中一小部分 token，使其触发模型故障，但仍保持其原始语义含义。 | 
| 基于梯度的攻击 | 白盒 | 依赖梯度信号来学习有效的攻击。 | 
| 越狱提示 | 黑盒 | 通常基于启发式的提示来“越狱”内置的模型安全机制。 | 
| 人工红队测试 | 黑盒 | 人工攻击模型，无论是否有其他模型的协助。 | 
| 模型红队测试 | 黑盒 | 模型攻击模型，其中攻击模型可以被微调。 | 

## Token 操作[#](#token-manipulation)

给定一段包含一系列 token 的文本输入，我们可以应用简单的 token 操作，如同义词替换，来触发模型做出错误的预测。基于 token 操作的攻击在 **黑盒** 设置下有效。Python 框架 TextAttack ([Morris et al. 2020](https://arxiv.org/abs/2005.05909)) 实现了许多词和 token 操作攻击方法，以创建 NLP 模型的对抗样本。该领域的大多数工作都针对分类和蕴含预测进行了实验。

[Ribeiro et al (2018)](https://www.aclweb.org/anthology/P18-1079/) 依赖手动提出的语义等价对抗规则 (SEARs) 来进行最小化的 token 操作，从而使模型无法生成正确的答案。示例规则包括 (*What  NOUN→Which NOUN*), (*), (*`WP` is → `WP`’s’*was→is*), 等。对抗操作后的语义等价性通过回译进行检查。这些规则是通过相当手动、启发式的过程提出的，并且 SEARs 探测的模型“漏洞”类型仅限于对最小 token 变化的敏感性，随着基础 LLM 能力的增强，这不应成为问题。

相比之下，[EDA](https://lilianweng.github.io/posts/2022-04-15-data-gen/#EDA) (Easy Data Augmentation; [Wei & Zou 2019](https://arxiv.org/abs/1901.11196)) 定义了一组简单且更通用的操作来增强文本：同义词替换、随机插入、随机交换或随机删除。研究表明，EDA 增强可以提高多个基准测试的分类准确率。

TextFooler ([Jin et al. 2019](https://arxiv.org/abs/1907.11932)) 和 [BERT-Attack (][Li et al. 2020](https://aclanthology.org/2020.emnlp-main.500.pdf)) 遵循相同的过程：首先识别出对模型预测影响最大且最脆弱的词，然后以某种方式替换这些词。

给定分类器 $f$ 和输入文本字符串 $\mathbf{x}$，每个词的重要性分数可以通过以下方式衡量：

其中 $f_y$ 是标签 $y$ 的预测对数几率，而 $x_{\setminus w_i}$ 是排除目标词 $w_i$ 后的输入文本。重要性高的词是很好的替换候选词，但应跳过停用词，以避免破坏语法。

TextFooler 基于词嵌入余弦相似度用顶级同义词替换这些词，然后通过检查替换词是否仍具有相同的词性标注以及句子级相似度是否超过阈值来进一步过滤。BERT-Attack 则相反，它通过 BERT 用语义相似的词替换这些词，因为上下文感知预测是掩码语言模型非常自然的用例。通过这种方式发现的对抗样本在不同模型之间具有一定的可迁移性，具体取决于模型和任务。

## 基于梯度的攻击[#](#gradient-based-attacks)

在白盒设置中，我们可以完全访问模型参数和架构。因此，我们可以依靠梯度下降来编程学习最有效的攻击。基于梯度的攻击仅在白盒设置中有效，例如对于开源 LLM。

**GBDA**（“基于梯度的分布攻击”；[Guo et al. 2021](https://arxiv.org/abs/2104.13733)）使用 Gumbel-Softmax 近似技巧来*使对抗损失优化可微*，其中使用 BERTScore 和困惑度来保证感知度和流畅度。给定一个由标记组成的输入 $\mathbf{x}=[x_1, x_2 \dots x_n]$，其中单个标记 $x_i$ 可以从分类分布 $P_\Theta$ 中采样，其中 $\Theta \in \mathbb{R}^{n \times V}$ 且 $V$ 是标记词表大小。考虑到 $V$ 通常约为 $O(10,000)$ 且大多数对抗示例只需要几个标记替换，它具有高度过参数化的特征。我们有：

$$ x_i \sim P_{\Theta_i} = \text{Categorical}(\pi_i) = \text{Categorical}(\text{Softmax}(\Theta_i)) $$

其中 $\pi_i \in \mathbb{R}^V$ 是第 $i$ 个 token 的概率向量。要最小化的对抗目标函数是让分类器 $f$ 对输入 $\mathbf{X}$ 产生与正确标签 $y$ 不同的错误标签：$\min_{\Theta \in \mathbb{R}^{n \times V}} \mathbb{E}_{\mathbf{x} \sim P_{\Theta}} \mathcal{L}_\text{adv}(\mathbf{X}, y; f)$。然而，由于类别分布的原因，表面上这不可微。使用 Gumbel-softmax 近似（[Jang et al. 2016](https://arxiv.org/abs/1611.01144)），我们通过 $\tilde{\boldsymbol{\pi}}$ 从 Gumbel 分布 $\tilde{P}_\Theta$ 近似类别分布：

其中 $g_{ij} \sim \text{Gumbel}(0, 1)$；温度 $\tau > 0$ 控制分布的平滑度。

Gumbel 分布用于对样本数量（无论样本分布如何）的*极端*值、最大值或最小值进行建模。额外的 Gumbel 噪声引入了模仿从类别分布中采样的随机决策过程。

低温度 $\tau \to 0$ 推动收敛到类别分布，因为使用温度为 0 的 softmax 进行采样是确定性的。“采样”部分仅取决于 $g_{ij}$ 的值，该值主要集中在 0 附近。

设 $\mathbf{e}_j$ 为 token $j$ 的嵌入表示。我们可以用 $\bar{e}(\tilde{\boldsymbol{\pi}})$ 近似 $\mathbf{x}$，即对应于 token 概率的嵌入向量的加权平均：$\bar{e}(\pi_i) = \sum_{j=1}^V \pi_i^{(j)} \mathbf{e}_j$。请注意，当 $\pi_i$ 是对应于 token $x_i$ 的独热向量时，我们将有 $\bar{e}(\pi_i) = \mathbf{e}_{z_i}$。结合嵌入表示和 Gumbel-softmax 近似，我们有一个可最小化的可微目标：$\min_{\Theta \in \mathbb{R}^{n \times V}} \mathbb{E}_{\tilde{\boldsymbol{\pi}} \sim \tilde{P}_{\Theta}} \mathcal{L}_\text{adv}(\bar{e}(\tilde{\boldsymbol{\pi}}), y; f)$。

同时，也很容易应用可微软约束与白盒攻击。GBDA 实验了（1）使用 NLL（负对数似然）的软流畅度约束和（2）BERTScore（*“一种用于评估文本生成的相似度分数，它捕捉了 Transformer 模型上下文嵌入中成对标记之间的语义相似性”*；[Zhang et al. 2019](https://arxiv.org/abs/1904.09675)）来衡量两个文本输入之间的相似度，以确保扰动后的版本不会与原始版本偏离太远。结合所有约束，最终的目标函数如下，其中 $\lambda_\text{lm}, \lambda_\text{sim} > 0$ 是预设的超参数，用于控制软约束的强度：

Gumbel-softmax 技巧很难扩展到标记删除或添加，因此它仅限于标记替换操作，不包括删除或添加。

**HotFlip** ([Ebrahimi et al. 2018](https://arxiv.org/abs/1712.06751)) 将文本操作视为向量空间中的输入，并测量损失对这些向量的导数。这里假设输入向量是一个字符级独热编码矩阵，$\mathbf{x} \in {0, 1}^{m \times n \times V}$ 且 $\mathbf{x}_{ij} \in {0, 1}^V$，其中 $m$ 是单词的最大数量，$n$ 是每个单词的最大字符数，$V$ 是字母表大小。给定原始输入向量 $\mathbf{x}$，我们构造一个新的向量 $\mathbf{x}_{ij, a\to b}$，其中第 $i$ 个单词的第 $j$ 个字符从 $a \to b$ 变化，因此我们有 $x_{ij}^{(a)} = 1$ 但 $x_{ij, a\to b}^{(a)} = 0, x_{ij, a\to b}^{(b)} = 1$。

根据一阶泰勒展开，损失的变化为：

该目标被优化以选择向量，仅使用一次反向传播来最小化对抗损失。

为了应用多次翻转，我们可以运行 $r$ 步的束搜索

...（截断，原文 46582+ 字符）


### 3. 谨慎看待缩放定律
- **链接**: [https://lilianweng.github.io/posts/2026-06-24-scaling-laws/](https://lilianweng.github.io/posts/2026-06-24-scaling-laws/)
- **发布**: Wed, 24 Jun 2026 00:00:00 +0000

#### 前面介绍

- 缩放定律描述了模型大小、数据量和计算量与训练损失之间的幂律关系。
- 该定律可用于预测大模型的计算和Token需求。
- 早期研究已验证了泛化误差随数据规模呈幂律衰减。

#### 树状图

```mermaid
mindmap
  root((谨慎看待缩放定律))
    前面介绍
    文字描述
    代码解析
    源码
```

#### 文字描述

- Amari等人推导了四种类型的学习曲线，均遵循幂律形式。
- Hestness等人观察到泛化误差随数据规模呈幂律变化，且模型改进只改变误差曲线的偏移量。
- Rosenfeld等人提出联合函数模型，同时考虑模型大小和数据规模对误差的影响。
- 缩放定律的核心在于如何在不同因素间分配宝贵的计算资源。

#### 代码解析

- 本文未提供源码，以下为实现思路或结构解析

#### 源码

#### 中文节选

缩放定律是深度学习中最关键的实证发现之一。其观察结果形式简单：随着模型大小 $N$、数据集大小 $D$ 和计算量 $C$ 的增加，训练损失 $L$ 会遵循幂律曲线（在双对数图上表现为直线）可预测地下降。我们可以将缩放定律视为描述计算量、损失、模型大小和数据之间关系的框架；其核心在于如何在这两者之间最优地分配宝贵的计算资源。

这种可预测性使缩放定律在实践中极具价值。常见的工作流程是在少量小规模运行中拟合缩放定律，然后外推以估算更大模型的代币和计算需求。

| 符号 | 备注 |
|---|---|
| $N$ | 模型大小，以参数数量衡量。 |
| $D$ | 训练数据集大小，通常以代币数量衡量。 |
| $C$ | 以 FLOPs 为单位的训练计算量。作为一个有用的近似，$C \approx 6ND$ ( [Kaplan et al. 2020](https://arxiv.org/abs/2001.08361))，其中 $2ND$ 用于前向传播，$4ND$ 用于反向传播。 |
| $E$ | 不可约损失 |
| $L, \hat{L}(.)$ | 测试损失 / 测试损失预测函数；也可以指训练损失，因为两者高度相关。 |
| $\epsilon$ | 泛化误差。 |

# 早期：机器学习损失的可预测性[#](#early-days-ml-loss-predictability)

在缩放定律成为主流概念之前，泛化误差随规模的可预测性就已经被研究过了。

[Amari et al. (1992)](https://ieeexplore.ieee.org/document/6796972) 使用贝叶斯方法和退火近似推导出了四种类型的学习曲线。

- 确定性学习算法，无噪声数据，唯一解：$\epsilon \sim c \cdot D^{-1}$，其中 $c$ 是某个常数。
- 确定性学习算法，无噪声数据，多个等价解：$\epsilon \sim c \cdot D^{-2}$；随着每个新数据点的加入，学习速度更快，因为模型只学习参数的最优流形，而不是寻找单个解点。

- Deterministic learning algorithm, noisy data: $\epsilon \sim c \cdot D^{-1/2}$; noises in data make learning harder.
- Stochastic learning algorithm, noisy data: $\epsilon \sim c \cdot D^{-1} + E$; here the irreducible loss $E$ is the residual error that a stochastic learner cannot reduce further, for example when the model runs out of capacity on large data. All four types of learning curves follow a power law:

where $E$ can be 0 and $\alpha = -2, -1, -1/2$. Although their theoretical setup is based on a simplified binary classification task, it points in a useful direction for building empirical ML loss prediction models.

One of the earliest empirical studies by [Hestness et al. (2017)](https://arxiv.org/abs/1712.00409) explained the relationship between generalization error, model size and data. For a given training data size, they identified the best-fit model size via grid search and then plot

#### 完整正文（中文）

缩放定律是深度学习中最关键的实证发现之一。其观察结果形式简单：随着模型大小 $N$、数据集大小 $D$ 和计算量 $C$ 的增加，训练损失 $L$ 会遵循幂律曲线（在双对数图上表现为直线）可预测地下降。我们可以将缩放定律视为描述计算量、损失、模型大小和数据之间关系的框架；其核心在于如何在这两者之间最优地分配宝贵的计算资源。

这种可预测性使缩放定律在实践中极具价值。常见的工作流程是在少量小规模运行中拟合缩放定律，然后外推以估算更大模型的代币和计算需求。

| 符号 | 备注 |
|---|---|
| $N$ | 模型大小，以参数数量衡量。 |
| $D$ | 训练数据集大小，通常以代币数量衡量。 |
| $C$ | 以 FLOPs 为单位的训练计算量。作为一个有用的近似，$C \approx 6ND$ ( [Kaplan et al. 2020](https://arxiv.org/abs/2001.08361))，其中 $2ND$ 用于前向传播，$4ND$ 用于反向传播。 |
| $E$ | 不可约损失 |
| $L, \hat{L}(.)$ | 测试损失 / 测试损失预测函数；也可以指训练损失，因为两者高度相关。 |
| $\epsilon$ | 泛化误差。 |

# 早期：机器学习损失的可预测性[#](#early-days-ml-loss-predictability)

在缩放定律成为主流概念之前，泛化误差随规模的可预测性就已经被研究过了。

[Amari et al. (1992)](https://ieeexplore.ieee.org/document/6796972) 使用贝叶斯方法和退火近似推导出了四种类型的学习曲线。

- 确定性学习算法，无噪声数据，唯一解：$\epsilon \sim c \cdot D^{-1}$，其中 $c$ 是某个常数。
- 确定性学习算法，无噪声数据，多个等价解：$\epsilon \sim c \cdot D^{-2}$；随着每个新数据点的加入，学习速度更快，因为模型只学习参数的最优流形，而不是寻找单个解点。

- Deterministic learning algorithm, noisy data: $\epsilon \sim c \cdot D^{-1/2}$; noises in data make learning harder.
- Stochastic learning algorithm, noisy data: $\epsilon \sim c \cdot D^{-1} + E$; here the irreducible loss $E$ is the residual error that a stochastic learner cannot reduce further, for example when the model runs out of capacity on large data. All four types of learning curves follow a power law:

where $E$ can be 0 and $\alpha = -2, -1, -1/2$. Although their theoretical setup is based on a simplified binary classification task, it points in a useful direction for building empirical ML loss prediction models.

One of the earliest empirical studies by [Hestness et al. (2017)](https://arxiv.org/abs/1712.00409) explained the relationship between generalization error, model size and data. For a given training data size, they identified the best-fit model size via grid search and then plotted loss against training dataset size. Across four different domains in deep learning (neural machine translation, image classification, language modeling, and speech recognition), a recurring pattern was observed where:

- Generalization error scales as a power law across a set of factors (e.g. data size).
- Model improvements shift the error curve but do not seem to affect the power-law exponent.
- Interestingly, architecture changes the offset ($E$) of the power-law fit but does not change the exponent ($\alpha$). The slope of the power law appears to be a property of the problem domain rather than the model architecture.
- The number of model parameters $N$ needed to fit a dataset of size $D$ also scales as a power law.

A conceptual illustration breaks the learning curve into three stages. In the small-data region, when there are not enough learning signals, the model performs only slightly better than random guessing. In the middle (“power-law region”), we observe a power-law relationship between loss, data, and model size. The final irreducible-error region can be attributed to factors such as noise in the data.


[Rosenfeld et al. (2020)](https://arxiv.org/abs/1909.12673) pushed this further by trying to model error as a joint function of both model size $N$ and data size $D$, across a diverse set of architectures (ResNet, WRN, LSTM, Transformer) and optimizers (Adam, SGD variants). Empirically they observed that, holding one axis fixed, the error decays as a power law in the other:

which can be combined into a joint form:

where $A > 0, B > 0, \alpha \geq 0, \beta \geq 0$ are scalar constants and $E$ is not dependent on either $N$ or $D$.

Thus, they can build a prediction model in the form of a simple parametric function with $\boldsymbol{\theta} = \langle A, B, E, \alpha, \beta \rangle$ to predict the expected loss for $(D, N)$ > certain thresholds by only training on a set of smaller training configs, $(D, N)$ < certain thresholds.

Side note: These early works lean on classical learning-theory intuition like the [VC dimension](https://en.wikipedia.org/wiki/Vapnik%E2%80%93Chervonenkis_dimension) (the cardinality of the largest set of points a model can shatter) as a proxy for capacity, but in modern deep learning work the VC dimension is often too coarse to explain the behavior and the empirical power laws turned out to be much cleaner and more practical than the worst-case bounds that theory provides.

# Scaling Laws in Data-Infinite Region[#](#scaling-laws-in-data-infinite-region)

## Kaplan et al.’s Scaling Laws[#](#kaplan-et-als-scaling-laws)


[Kaplan et al. (2020)](https://arxiv.org/abs/2001.08361) popularized the concept of scaling laws in the language modeling community. They found that the cross-entropy test loss $L$ scales as a power law with each of model size $N$ (excluding embedding layers), dataset size $D$, and training compute $C$ across many orders of magnitude. The findings are aligned with early work in the last section, but Kaplan et al. formalized the concept with a focus on Transformer language models and empirical experimentation at a larger scale, with model size ranging from 768M to 1.5B non-embedding parameters and dataset size from 22M to 23B tokens. All training runs in the paper used a learning rate schedule with a 3000 step linear warmup, followed by a cosine decay to zero.

List of key findings:

- The loss $L$ scales as a power law with $N$, $D$, and $C$ individually; for optimal performance all three must scale in tandem.
- Training curves follow predictable power laws whose parameters are roughly independent of model size.
- Larger models are more sample-efficient, meaning that they reach a given loss with fewer optimization steps and fewer data points than small models.
- Architectural details (width, aspect ratio, etc.) matter less than sheer scale.
- Train loss and test loss are positively correlated. (Sounds trivial but this is the foundation for pretraining work. On the other hand, whether pretraining loss improvement transfers to posttraining evaluation needs separate studies.)
- Given a fixed compute budget, it is more efficient to train a very large model and stop *before convergence*than to train a smaller model all the way to convergence.**This finding is where the Chinchilla scaling laws (the next section) disagree: Kaplan et al. overestimated the optimal model size as their fitted exponent was larger.**

They summarize the joint dependence on $N$ and $D$ in a single equation:


A nice consequence of this form is that the extent of overfitting (i.e. model is complex or data is small) depends predominantly on the ratio $N^{\alpha / \beta} / D$, which indicates that the data needs to grow in a specific proportion to the growth of the model size to avoid training being data-limited.

The most influential and, in hindsight, most contested conclusion was the compute-optimal allocation. Kaplan et al. found $N_\text{opt} \propto C^{0.73}$ and concluded that model size should grow faster than dataset size. Concretely, for a 10x increase in compute they suggested scaling the model size by ~5.5x but the training tokens by only ~1.8x. The Chinchilla paper would later overturn this recommendation, arguing that it leaves large models badly *undertrained*.

Another useful analysis in Kaplan et al. approximates the number of training FLOPs needed based on $D$ and $N$. Each multiply-add is counted as ~2 FLOPs.

Given a standard config where $d_\text{attn} = d_\text{model} = d_\text{ff}/4$, and excluding embedding layers from $N$ and the per-token forward compute:

Then we count backward-pass FLOPs as twice the forward-pass FLOPs, because backpropagation runs two matrix multiplications, for gradients with respect to the input activations and the weights, respectively. Thus, in total, the training FLOPs per token are approximately $6N$, and the total FLOPs for training over $D$ tokens are $C \approx 6ND$.

## Chinchilla Scaling Laws[#](#chinchilla-scaling-laws)

The Chinchilla paper ([Hoffmann et al. 2022](https://arxiv.org/abs/2203.15556)) studied the relationship between the optimal model size $N$ (total parameters, *including* embeddings) and the number of tokens $D$ under a *fixed* compute budget $C$ with a more careful experimental design and arrived at a somewhat different answer from Kaplan et al..

The central question is on the best strategy to allocate resources given a constraint $\text{FLOPs}(N, D) = C \approx 6ND$. In other words, when we have only limited FLOPs (a given number of GPUs running for a given period of time), how should we choose between more data tokens and more model parameters?


The Chinchilla paper presented three neatly designed methods for scaling laws fitting.

The empirical experiments scanned over 400 models, with sizes from 70M to over 16B parameters and training tokens from 5B to 500B. The experiments were under the assumption that every training token is unique (the infinite-data regime). All runs used a cosine learning-rate schedule decaying by 10x over the training horizon. Sweeping over model sizes traces out the compute-optimal frontier.

### Method 1: Fix model sizes, vary the token budget[#](#method-1-fix-model-sizes-vary-the-token-budget)

For each parameter count $N$, train several runs with different token budgets, and record the minimal loss achieved per FLOP budget $C$.

### Method 2: IsoFLOP profiles[#](#method-2-isoflop-profiles)

Fix a compute budget $C$ and plot the final loss against parameter count $N$. Each iso-FLOP curve is roughly a parabola in log-space, and its minimum flags the optimal model size for that compute budget. Then repeating across budgets traces a power-law line in the plot.

### Method 3: Parametric fit[#](#method-3-parametric-fit)

[Fit the same parametric function as in ][Rosenfeld et al. (2020)](https://arxiv.org/abs/1909.12673) directly,

We can actually get a closed form approximation of optimal $N_\text{opt}(C), D_\text{opt}(C)$ by minimizing $\hat{L}(N, D)$ under the constraint $\text{FLOPs}(N,D) = C \approx 6ND$.

First let’s reduce the expression to contain only $N$:

When $\alpha \approx \beta$, model size and training tokens should scale at equal rates.

To find the optimal $\boldsymbol{\theta} = \langle A, B, E, \alpha, \beta\rangle$, the Chinchilla paper adopts a [Huber loss](https://en.wikipedia.org/wiki/Huber_loss) (robust to outliers; $\delta=10^{-3}$) and the [L-BFGS algorithm](https://en.wikipedia.org/wiki/Limited-memory_BFGS) (good for curve fitting with a small number of parameters).

Chinchilla arrives at its answer through three complementary methods whose final results agree with each other, and this is part of why the result was quite convincing.


Chinchilla 论文中关于当时大多数大型模型（约 2022 年）训练不足的论断，得到了一个著名的演示的支持：在相同的计算预算下（与 Gopher 相同，[Rae et al. 2021](https://arxiv.org/abs/2112.11446)；280B 参数量，

...（截断，原文 29101+ 字符）


### 4. 面向好奇者的深度学习概览
- **链接**: [https://lilianweng.github.io/posts/2017-06-21-overview/](https://lilianweng.github.io/posts/2017-06-21-overview/)
- **发布**: Wed, 21 Jun 2017 00:00:00 +0000

#### 前面介绍

- 深度学习之所以现在流行，是因为数据量增加和计算能力提升。
- CNN受视觉皮层组织启发，通过卷积层提取图像特征。
- 残差网络通过跳跃连接解决了深层网络训练困难的问题。

#### 树状图

```mermaid
mindmap
  root((面向好奇者的深度学习概览))
    前面介绍
    文字描述
    代码解析
    源码
```

#### 文字描述

- AlphaGo与李世石的对局标志着深度学习在复杂博弈领域的突破。
- 深度学习模型通过大量参数自动学习复杂的非线性模式，减少了人工特征工程的需求。
- 卷积操作通过滑动核矩阵与输入图像进行元素级乘法来提取特征。
- 池化层通常用于降维和提取主要特征，减少计算量。

#### 代码解析

- 本文未提供源码，以下为实现思路或结构解析

#### 源码

#### 中文节选

(The post was originated from my talk for [WiMLDS x Fintech meetup](http://wimlds.org/chapters/about-bay-area/) hosted by [Affirm](www.affirm.com).)

I believe many of you have watched or heard of the [games](https://youtu.be/vFr3K2DORc8) between AlphaGo and professional Go player [Lee Sedol](https://en.wikipedia.org/wiki/Lee_Sedol) in 2016. Lee has the highest rank of nine dan and many world championships. No doubt, he is one of the best Go players in the world, but he [lost by 1-4](https://www.scientificamerican.com/article/how-the-computer-beat-the-go-master/) in this series versus AlphaGo. Before this, Go was considered to be an intractable game for computers to master, as its simple rules lay out an exponential number of variations in the board positions, many more than what in Chess. This event surely highlighted 2016 as a big year for AI. Because of AlphaGo, much attention has been attracted to the progress of AI.

Meanwhile, many companies are spending resources on pushing the edges of AI applications, that indeed have the potential to change or even revolutionize how we are gonna live. Familiar examples include self-driving cars, chatbots, home assistant devices and many others. One of the secret receipts behind the progress we have had in recent years is deep learning.

# Why Does Deep Learning Work Now?[#](#why-does-deep-learning-work-now)

Deep learning models, in simple words, are large and deep artificial neural nets. A neural network (“NN”) can be well presented in a [directed acyclic graph](https://en.wikipedia.org/wiki/Directed_acyclic_graph): the input layer takes in signal vectors; one or multiple hidden layers process the outputs of the previous layer. The initial concept of a neural network can be traced back to more than [half a century ago](https://cs.stanford.edu/people/eroberts/courses/soco/projects/neural-networks/History/history1.html). But why does it work now? Why do people start talking about them all of a sudden?

The reason is surprisingly simple:

- We have a lot **more data**.
- We have **much powerful computers**.


A large and deep neural network has many more layers + many more nodes in each layer, which results in exponentially many more parameters to tune. Without enough data, we cannot learn parameters efficiently. Without powerful computers, learning would be too slow and insufficient.

Here is an interesting plot presenting the relationship between the data scale and the model performance, proposed by Andrew Ng in his “[Nuts and Bolts of Applying Deep Learning](https://youtu.be/F1ka6a13S9I)” talk. On a small dataset, traditional algorithms (Regression, Random Forests, SVM, GBM, etc.) or statistical learning does a great job, but once the data scale goes up to the sky, the large NN outperforms others. Partially because compared to a traditional ML model, a neural network model has many more parameters and has the capability to learn complicated nonlinear patterns. Thus we expect the model to pick the most h

#### 完整正文（中文）

（这篇文章源于我在 [Affirm](www.affirm.com) 举办的 [WiMLDS x Fintech meetup](http://wimlds.org/chapters/about-bay-area/) 上所做的演讲。）

我相信你们中的许多人都在 2016 年看过或听说过 [AlphaGo 与职业围棋手 [李世石](https://en.wikipedia.org/wiki/Lee_Sedol) 之间的对局](https://youtu.be/vFr3K2DORc8)。李世石拥有九段最高段位和许多世界冠军头衔。毫无疑问，他是世界上最优秀的围棋手之一，但在这场系列赛中他以 1-4 输给了 AlphaGo。在此之前，围棋被认为是一门计算机难以掌握的难题，因为其简单的规则在棋盘位置上产生了指数级的变体，远多于国际象棋。这一事件无疑将 2016 年标记为人工智能的一个大年。由于 AlphaGo 的出现，人们对人工智能的进展给予了极大的关注。

与此同时，许多公司正在投入资源推动人工智能应用的边界，这些应用确实有潜力改变甚至彻底改变我们将来的生活方式。熟悉的例子包括自动驾驶汽车、聊天机器人、家庭助手设备等。近年来我们所取得的进步背后的一个秘诀就是深度学习。

# 为什么深度学习现在才奏效？[#](#why-does-deep-learning-work-now)

简单来说，深度学习模型是大型且深层的人工神经网络。神经网络（“NN”）可以用 [有向无环图](https://en.wikipedia.org/wiki/Directed_acyclic_graph) 来很好地表示：输入层接收信号向量；一个或多个隐藏层处理前一层的输出。神经网络的概念最早可以追溯到半个多 [世纪前](https://cs.stanford.edu/people/eroberts/courses/soco/projects/neural-networks/History/history1.html)。但是为什么它现在才奏效？为什么人们突然开始谈论它？

原因出奇地简单：

- 我们拥有多得多的 **数据**。
- 我们拥有功能强大得多的 **计算机**。

一个大型且深层的神经网络拥有更多的层 + 每一层更多的节点，这导致需要调整的参数呈指数级增长。如果没有足够的数据，我们无法高效地学习参数。如果没有强大的计算机，学习将太慢且不足。

这是安德鲁·吴在他的“[应用深度学习的核心要素](https://youtu.be/F1ka6a13S9I)”演讲中提出的一个有趣的图表，展示了数据规模与模型性能之间的关系。在小数据集上，传统算法（回归、随机森林、SVM、GBM 等）或统计学习表现优异，但一旦数据规模呈指数级增长，大型神经网络就会超越其他方法。部分原因在于，与传统机器学习模型相比，神经网络模型拥有更多的参数，并且具备学习复杂非线性模式的能力。因此，我们期望模型能够自行挑选最有用的特征，而无需过多涉及专家参与的手动特征工程。

# 深度学习模型[#](#deep-learning-models)

接下来，让我们回顾几个经典的深度学习模型。

## 卷积神经网络[#](#convolutional-neural-network)

卷积神经网络，简称“CNN”，是一种前馈人工神经网络，其神经元之间的连接模式受到视觉皮层系统组织的启发。初级视觉皮层（V1）从视网膜的原始视觉输入中进行边缘检测。次级视觉皮层（V2），也称为纹状皮层，接收来自V1的边缘特征并提取简单的视觉属性，如方向、空间频率和颜色。视觉区域V4处理更复杂的物体属性。所有处理后的视觉特征流入最终的逻辑单元——下颞回（IT），以进行物体识别。V1和V4之间的捷径启发了CNN的一种特殊类型，即层与层之间具有连接的非相邻层：残差网络 ([He, et al. 2016](http://www.cv-foundation.org/openaccess/content_cvpr_2016/papers/He_Deep_Residual_Learning_CVPR_2016_paper.pdf))，其中包含支持某一层的部分输入传递到两层后的组件的“残差块”。

卷积是一个数学术语，这里指的是两个矩阵之间的运算。卷积层具有一个定义好的固定小矩阵，也称为核或滤波器。当核在输入图像的矩阵表示上滑动（即卷积）时，它计算核矩阵中的值与原始图像值之间的逐元素乘法。[专门设计的核](http://setosa.io/ev/image-kernels/)可以快速高效地处理图像以实现常见目的，如模糊、锐化、边缘检测等。

[卷积](http://ufldl.stanford.edu/tutorial/supervised/FeatureExtractionUsingConvolution/)和[池化](http://ufldl.stanford.edu/tutorial/supervised/Pooling/)（或图4中的“下采样”）层类似于V1、V2和V4视觉皮层单元，用于响应特征提取。物体识别推理发生在后期的全连接层中，这些层消耗提取出的特征。

## 循环神经网络[#](#recurrent-neural-network)

序列模型通常被设计用来将输入序列转换为属于不同域的输出序列。循环神经网络，简称“RNN”，非常适合这一目的，并在手写识别、语音识别和机器翻译等问题上取得了巨大的改进 ([Sutskever et al. 2011](http://machinelearning.wustl.edu/mlpapers/paper_files/ICML2011Sutskever_524.pdf), [Liwicki et al. 2007](http://www6.in.tum.de/Main/Publications/Liwicki2007a.pdf))。

循环神经网络模型天生具备处理长序列数据以及解决具有时间上下文扩散任务的能力。该模型在每一个时间步处理序列中的一个元素。经过计算后，更新后的单元状态被传递到下一个时间步，以促进下一个元素的计算。想象一下，当 RNN 模型逐个字符阅读所有维基百科文章时，它可以根据上下文预测接下来的单词。

然而，简单地将当前输入元素和上一个单元状态进行线性组合的感知神经元很容易丢失长期依赖关系。例如，我们以“爱丽丝在……工作”开始一个句子，几段话之后，我们希望正确地用“她”或“他”开始下一个句子。如果模型忘记了角色的名字“爱丽丝”，我们就永远无法知道了。为了解决这个问题，研究人员创建了一种具有更复杂内部结构的特殊神经元来记忆长期上下文，被称为 [“长短期记忆（LSTM）”](http://web.eecs.utk.edu/~itamar/courses/ECE-692/Bobby_paper1.pdf) 单元。它足够智能，可以学习应该记忆旧信息多长时间，何时遗忘，何时利用新数据，以及如何将旧记忆与新输入结合起来。这篇 [介绍](http://colah.github.io/posts/2015-08-Understanding-LSTMs/) 写得非常好，我推荐所有对 LSTM 感兴趣的人都去阅读。它已在 [Tensorflow 文档](https://www.tensorflow.org/tutorials/recurrent) 中被正式收录 ;-).

为了展示 RNN 的强大功能，[Andrej Karpathy](http://karpathy.github.io/2015/05/21/rnn-effectiveness/) 使用带有 LSTM 单元的 RNN 构建了一个基于字符的语言模型。在事先不了解任何英语词汇的情况下，该模型能够学习字符之间的关系以形成单词，然后学习单词之间的关系以形成句子。即使没有巨大的训练数据集，它也能取得相当不错的性能。

## RNN：序列到序列模型[#](#rnn-sequence-to-sequence-model)

[序列到序列模型](https://arxiv.org/pdf/1406.1078.pdf) 是 RNN 的一个扩展版本，但其应用领域足够独特，因此我想将其列在一个单独的章节中。与 RNN 一样，序列到序列模型处理序列数据，但特别地，它通常用于开发聊天机器人或个人助理，两者都能为输入的问题生成有意义的回复。序列到序列模型由两个 RNN 组成，即编码器和解码器。编码器从输入单词中学习上下文信息，然后通过“**上下文向量**”（或“思维向量”，如图 8 所示）将知识传递给解码器一侧。最后，解码器消耗上下文向量并生成适当的回复。

## 自编码器[#](#autoencoders)

与之前的模型不同，自编码器用于无监督学习。它旨在学习**高维**数据集的**低维**表示，类似于 [主成分分析 (PCA)](https://en.wikipedia.org/wiki/Principal_component_analysis) 所做的工作。自编码器模型试图学习一个近似函数 $ f(x) \approx x $ 来重现输入数据。然而，它受到中间瓶颈层的限制，该层节点数量非常少。由于容量有限，该模型被迫形成数据的高效编码，这本质上就是我们学到的低维代码。

[Hinton 和 Salakhutdinov](https://pdfs.semanticscholar.org/7d76/b71b700846901ac4ac119403aa737a285e36.pdf) 使用自编码器对各种主题的文档进行了压缩。如图 10 所示，当同时应用 PCA 和自编码器将文档降维至二维时，自编码器展示了更好的效果。借助自编码器，我们可以进行高效的数据压缩，从而加速包括文档和图像在内的信息检索。

# 强化（深度）学习[#](#reinforcement-deep-learning)

既然我以 AlphaGo 开头，让我们更深入地探讨一下 AlphaGo 为什么能成功。[强化学习（“RL”）](https://en.wikipedia.org/wiki/Reinforcement_learning) 是其成功背后的秘诀之一。RL 是机器学习的一个子领域，它允许机器和软件代理在给定上下文中自动确定最优行为，其目标是通过给定的指标最大化长期性能。


### 5. 提示工程指南
- **链接**: [https://lilianweng.github.io/posts/2023-03-15-prompt-engineering/](https://lilianweng.github.io/posts/2023-03-15-prompt-engineering/)
- **发布**: Wed, 15 Mar 2023 00:00:00 +0000

#### 前面介绍

- 提示工程通过在上下文中提供示例来引导模型行为，无需更新权重。
- 零样本和少样本学习是两种基本的提示方法。
- 示例的选择、格式和顺序对模型性能有显著影响。

#### 树状图

```mermaid
mindmap
  root((提示工程指南))
    前面介绍
    文字描述
    代码解析
    源码
```

#### 文字描述

- 零样本学习直接将任务文本输入模型并请求结果。
- 少样本学习通过提供高质量的输入输出示例来提高性能，但消耗更多Token。
- Zhao等人指出LLM存在多数标签偏差、近因偏差和常见Token偏差。
- Liu等人提出使用k-NN聚类选择语义相似的示例。
- Su等人提出基于图的多样性选择方法，通过评分机制鼓励选择多样化的样本。

#### 代码解析

- 零样本示例：Text: i'll bet the video game is a lot more fun than the film. Sentiment:
- 少样本示例：Text: (lawrence bounces) all over the stage, dancing, running, sweating, mopping his face and generally displaying the wacky talent that brought him fame in the first place. Sentiment: positive
- 示例选择建议：使用k-NN聚类选择语义相似的示例，或使用基于图的多样性选择方法。

#### 源码

#### 源码片段 1（text）

```text
Text: i'll bet the video game is a lot more fun than the film.
Sentiment:
```

#### 源码片段 2（text）

```text
Text: (lawrence bounces) all over the stage, dancing, running, sweating, mopping his face and generally displaying the wacky talent that brought him fame in the first place.
Sentiment: positive
Text: despite all evidence to the contrary, this clunker has somehow managed to pose as an actual feature movie, the kind that charges full admission and gets hyped on tv and purports to amuse small children and ostensible adults.
Sentiment: negative
Text: for the first time in years, de niro digs deep emotionally, perhaps because he's been stirred by the powerful work of his co-stars.
Sentiment: positive
Text: i'll bet the video game is a lot more fun than the film.
Sentiment:
```

#### 源码片段 3（text）

```text
Please label the sentiment towards the movie of the given movie review. The sentiment label should be "positive" or "negative". 
Text: i'll bet the video game is a lot more fun than the film. 
Sentiment:
```

#### 完整正文（中文）

**提示工程**，也称为 **上下文提示**，指的是与 LLM 通信的方法，旨在引导其行为以获得期望的结果，*而无需* 更新模型权重。它是一门经验科学，提示工程方法的效果在不同模型之间差异很大，因此需要大量的实验和启发式方法。

本文仅关注自回归语言模型的提示工程，因此不涉及填空测试、图像生成或多模态模型。其核心在于，提示工程的目标是对齐和模型的可引导性。请查看我关于可控文本生成的[上一篇文章](https://lilianweng.github.io/posts/2021-01-02-controllable-text-generation/)。

[我的个人观点] 在我看来，一些提示工程论文不值得占用 8 页篇幅，因为这些技巧可以用一两句话解释清楚，剩下的都是关于基准测试。一个易于使用且共享的基准测试基础设施对社区更有益。迭代提示或使用外部工具设置起来并不简单。此外，将整个研究社区引导至采用它也并非易事。

# 基础提示[#](#basic-prompting)

零样本和少样本学习是提示模型的最基本方法，由许多 LLM 论文开创，并常用于基准测试 LLM 性能。

## 零样本[#](#zero-shot)

**零样本学习**是指简单地给模型提供任务文本并要求其给出结果。

（所有情感分析示例均来自 SST-2）

```
Text: i'll bet the video game is a lot more fun than the film.
Sentiment:
```
## 少样本[#](#few-shot)

**少样本学习**在目标任务上展示一组高质量的演示，每个演示都包含输入和期望的输出。由于模型首先看到的是好的示例，它可以更好地理解人类意图以及期望答案类型的标准。因此，少样本学习通常比零样本学习带来更好的性能。然而，这需要消耗更多的 token，并且当输入和输出文本较长时，可能会触及上下文长度限制。

```

Text: (lawrence bounces) all over the stage, dancing, running, sweating, mopping his face and generally displaying the wacky talent that brought him fame in the first place.
Sentiment: positive
Text: despite all evidence to the contrary, this clunker has somehow managed to pose as an actual feature movie, the kind that charges full admission and gets hyped on tv and purports to amuse small children and ostensible adults.
Sentiment: negative
Text: for the first time in years, de niro digs deep emotionally, perhaps because he's been stirred by the powerful work of his co-stars.
Sentiment: positive
Text: i'll bet the video game is a lot more fun than the film.
Sentiment:
```
许多研究探讨了如何构建上下文示例以最大化性能，并观察到**提示格式、训练示例的选择以及示例的顺序会导致性能出现显著差异**，从接近随机猜测到接近 SoTA（最先进水平）不等。

[Zhao et al. (2021)](https://arxiv.org/abs/2102.09690) 调查了少样本分类的情况，并提出 LLM（他们在实验中使用了 GPT-3）的几种偏差导致了如此高的方差：(1) 如果示例中的标签分布不平衡，则存在*多数标签偏差*；(2) *近因偏差*指的是模型可能重复最后一个标签的倾向；(3) *常见词偏差*表明 LLM 倾向于比稀有词更频繁地产生常见词。为了克服这种偏差，他们提出了一种方法，当输入字符串为 `N/A` 时，将模型输出的标签概率校准为均匀分布。

### 示例选择技巧[#](#tips-for-example-selection)

- 
使用嵌入空间中的 $k$-NN 聚类选择与测试示例在语义上相似的示例（ [Liu et al., 2021](https://arxiv.org/abs/2101.06804)）
-

为了选择多样且具有代表性的示例集合，[Su 等人 (2022)](https://arxiv.org/abs/2209.01975) 提出使用基于图的方法：(1) 首先，基于样本之间的嵌入（例如通过 [SBERT](https://arxiv.org/abs/1908.10084) 或 [其他](https://arxiv.org/abs/2201.10005) [嵌入](https://platform.openai.com/docs/guides/embeddings) [模型](https://openai.com/blog/new-and-improved-embedding-model)）余弦相似度构建有向图 $G=(V, E)$，其中每个节点指向其 $k$ 个最近邻；(2) 从选定的样本集合 $\mathcal{L}=\emptyset$ 和剩余样本集合 $\mathcal{U}$ 开始。每个样本 $u \in \mathcal{U}$ 的得分为 $$ \text{score}(u) = \sum_{v \in \{v \mid (u, v) \in E, v\in \mathcal{U}\}} s(v)\quad\text{其中 }s(v)=\rho^{- \vert \{\ell \in \mathcal{L} \vert (v, \ell)\in E \}\vert},\quad\rho > 1 $$，使得如果 $v$ 的许多邻居被选中，则 $s(v)$ 较低，从而鼓励选择多样化的样本。
- 
[Rubin 等人 (2022)](https://arxiv.org/abs/2112.08633) 提出通过针对单个训练数据集的 [对比学习](https://lilianweng.github.io/posts/2021-05-31-contrastive/) 来训练嵌入，用于上下文学习示例选择。给定每个训练对 $(x, y)$，一个示例 $e_i$（格式化为输入-输出对）的质量可以通过 LM 分配的条件概率来衡量：$\text{score}(e_i) = P_\text{LM}(y \mid e_i, x)$。我们可以识别得分最高和最低的 $k$ 个其他示例，作为每个训练对的候选正集和负集，并将其用于对比学习。
- 
一些研究人员尝试使用 [Q-Learning](https://lilianweng.github.io/posts/2018-02-19-rl-overview/#q-learning-off-policy-td-control) 进行示例选择。([Zhang 等人 2022](https://arxiv.org/abs/2211.04486))
- 
受基于不确定性的 [主动学习](https://lilianweng.github.io/posts/2022-02-20-active-learning/) 启发，[Diao 等人 (2023)](https://arxiv.org/abs/2302.12246) 建议识别在多次采样试验中具有高不一致性或熵的示例。然后对这些示例进行标注，以用于少样本提示。

### 示例排序技巧[#](#tips-for-example-ordering)

- 一般建议是保持示例选择的多样性，与测试样本相关，并按随机顺序排列，以避免多数标签偏差和时效性偏差。
- 增加模型规模或包含更多训练示例并不能减少上下文示例不同排列方式之间的方差。相同的顺序可能对一个模型效果很好，但对另一个模型效果很差。当验证集有限时，考虑选择一种模型不会产生极其不平衡的预测或对其预测过于自信的顺序。（[Lu 等人 2022](https://arxiv.org/abs/2104.08786)）

# 指令提示[#](#instruction-prompting)

在提示中展示少样本示例的目的是向模型解释我们的意图；换句话说，以演示的形式向模型描述任务指令。然而，少样本在令牌使用方面成本较高，并且由于上下文长度有限而限制了输入长度。那么，为什么不直接给出指令呢？

*指令化语言模型*（例如 [InstructGPT](https://openai.com/research/instruction-following)，[自然指令](https://github.com/allenai/natural-instructions)）使用高质量的（任务指令、输入、真实输出）元组对预训练模型进行微调，以使语言模型更好地理解用户意图并遵循指令。[RLHF](https://lilianweng.github.io/posts/2021-01-02-controllable-text-generation/#rl-fine-tuning-with-human-preferences)（基于人类反馈的强化学习）是实现这一点的常用方法。指令遵循风格微调的好处是提高了模型与人类意图的一致性，并极大地降低了通信成本。

在与指令模型交互时，我们应该详细描述任务要求，力求*具体*和*精确*，避免说“不要做某事”，而是明确说明要做什么。

```
请对给定电影评论中针对电影的情感进行标注。情感标签应为“positive”或“negative”。
Text: i'll bet the video game is a lot more fun than the film.
Sentiment:
```

向受众解释是给出指令的另一种明智方式

- 例如，为儿童制作教育材料，

```
Describe what is quantum physics to a 6-year-old.
```
- 以及安全内容，

```
... in language that is safe for work.
```
*上下文指令学习* ([Ye et al. 2023](https://arxiv.org/abs/2302.14691)) 将少样本学习与指令提示相结合。它在提示中包含了跨不同任务的多个演示示例，每个演示由指令、任务输入和输出组成。请注意，他们的实验仅限于分类任务，且指令提示包含所有标签选项。

```
Definition: Determine the speaker of the dialogue, "agent" or "customer".
Input: I have successfully booked your tickets.
Ouput: agent
Definition: Determine which category the question asks for, "Quantity" or "Location".
Input: What's the oldest building in US?
Ouput: Location
Definition: Classify the sentiment of the given movie review, "positive" or "negative".
Input: i'll bet the video game is a lot more fun than the film.
Output:
```
# 自洽采样[#](#self-consistency-sampling)

**自洽采样** ([Wang et al. 2022a](https://arxiv.org/abs/2203.11171)) 是使用温度 > 0 采样多个输出，然后从这些候选项中选择最佳的一个。选择最佳候选项的标准因任务而异。一个通用的解决方案是选择**多数投票**。对于易于验证的任务（例如带有单元测试的编程问题），我们可以简单地运行解释器并使用单元测试验证正确性。

# 思维链 (CoT)[#](#chain-of-thought-cot)

**思维链 (CoT) 提示** ([Wei et al. 2022](https://arxiv.org/abs/2201.11903)) 生成一系列简短的句子，逐步描述推理逻辑，称为*推理链*或*理由*，最终引出最终答案。CoT 的好处在**复杂的推理任务**中更为明显，而在使用**大模型**（例如参数超过 500 亿）时。简单的任务仅从 CoT 提示中略微受益。

## CoT 提示的类型[#](#cot-提示的类型)

CoT 提示主要有两种类型：

- **少样本 CoT**。这是通过提供少量演示来提示模型，每个演示都包含手动编写（或模型生成）的高质量推理链。

（所有数学推理示例均来自 [GSM8k](https://github.com/openai/grade-school-math)）

```
Question: Tom and Elizabeth have a competition to climb a hill. Elizabeth takes 30 minutes to climb the hill. Tom takes four times as long as Elizabeth does to climb the hill. How many hours does it take Tom to climb up the hill?
Answer: It takes Tom 30*4 = <<30*4=120>>120 minutes to climb the hill.
It takes Tom 120/60 = <<120/60=2>>2 hours to climb the hill.
So the answer is 2.
===
Question: Jack is a soccer player. He needs to buy two pairs of socks and a pair of soccer shoes. Each pair of socks cost $9.50, and the shoes cost $92. Jack has $40. How much more money does Jack need?
Answer: The total cost of two pairs of socks is $9.50 x 2 = $<<9.5*2=19>>19.
The total cost of the socks and the shoes is $19 + $92 = $<<19+92=111>>111.
Jack need $111 - $40 = $<<111-40=71>>71 more.
So the answer is 71.
===
Question: Marty has 100 centimeters of ribbon that he must cut into 4 equal parts. Each of the cut parts must be divided into 5 equal parts. How long will each final cut be?
Answer:
```
- **零样本 CoT**。使用自然语言语句，如 `Let's think step by step`，来明确鼓励模型首先生成推理链，然后

...（截断，原文 33128+ 字符）

