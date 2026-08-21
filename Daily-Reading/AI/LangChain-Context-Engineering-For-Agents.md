# LangChain Context Engineering：面向 Agent 的上下文工程

> 📅 创建日期：2026-08-21  
> 📚 原文日期：2025-07-02  
> 🔗 原文：[Context Engineering for Agents](https://www.langchain.com/blog/context-engineering-for-agents)  
> 🎯 适合人群：LangChain / LangGraph 开发者、Agent 工程师、RAG 和 AI 应用架构师  
> 💡 核心内容：Write、Select、Compress、Isolate 四类上下文工程策略，以及它们在 LangGraph 中的落地方式  
> 🧩 示例语言：TypeScript（LangChain JS / LangGraph JS）

---

## 目录

- [一、先说结论](#一先说结论)
  - [1.1 先看一个具体任务](#11-先看一个具体任务)
  - [1.2 四种能力分别解决什么问题](#12-四种能力分别解决什么问题)
- [二、Context Engineering 到底是什么](#二context-engineering-到底是什么)
  - [2.1 LLM 是 CPU，Context Window 是 RAM](#21-llm-是-cpucontext-window-是-ram)
  - [2.2 上下文的三种类型](#22-上下文的三种类型)
  - [2.3 Agent 为什么更需要上下文工程](#23-agent-为什么更需要上下文工程)
- [三、Write：把上下文写到窗口之外](#三write把上下文写到窗口之外)
  - [3.1 Scratchpad：任务草稿区](#31-scratchpad任务草稿区)
  - [3.2 短期记忆与 Checkpoint](#32-短期记忆与-checkpoint)
  - [3.3 长期记忆](#33-长期记忆)
- [四、Select：只选择当前需要的上下文](#四select只选择当前需要的上下文)
  - [4.1 从 Scratchpad 选择](#41-从-scratchpad-选择)
  - [4.2 选择长期记忆](#42-选择长期记忆)
  - [4.3 工具选择](#43-工具选择)
  - [4.4 知识选择与代码检索](#44-知识选择与代码检索)
- [五、Compress：压缩上下文](#五compress压缩上下文)
  - [5.1 Summarization：摘要](#51-summarization摘要)
  - [5.2 Trimming：裁剪](#52-trimming裁剪)
  - [5.3 工具边界压缩](#53-工具边界压缩)
- [六、Isolate：隔离上下文](#六isolate隔离上下文)
  - [6.1 Multi-agent：多 Agent 隔离](#61-multi-agent多-agent-隔离)
  - [6.2 Sandbox：环境隔离](#62-sandbox环境隔离)
  - [6.3 State：状态字段隔离](#63-state状态字段隔离)
- [七、LangGraph 如何支持四种策略](#七langgraph-如何支持四种策略)
- [八、LangSmith：建立观察和评测闭环](#八langsmith建立观察和评测闭环)
- [九、项目落地清单](#九项目落地清单)
- [十、总结](#十总结)

---

## 一、先说结论

LangChain 官方把 Context Engineering 定义为：

> 在 Agent 的每一步轨迹中，把“恰好有用的信息”放入上下文窗口。

它不是单纯地把 Prompt 写得更长，也不是把所有历史消息、文档和工具结果全部传给模型，而是持续管理模型下一步真正需要看到的内容。

官方文章把 Agent 上下文工程归纳为四类动作：

```text
Write      把有价值的信息写到上下文窗口之外
Select     在需要时选择相关信息放入上下文
Compress   删除或摘要不必要的 token
Isolate    将上下文拆分到不同 Agent、State 或执行环境
```

可以把一个长任务抽象成：

```text
用户请求
  ↓
模型思考
  ↓
调用工具
  ↓
工具反馈进入上下文
  ↓
模型继续思考
  ↓
再次调用工具……
```

Context Engineering 的目标，就是在每一个箭头处控制上下文的写入、取回、压缩和隔离。

### 1.1 先看一个具体任务

假设我们正在开发一个 TypeScript 代码排障 Agent。用户提出：

> 帮我排查“订单已经创建成功，但库存没有扣减”的问题，找到原因并给出修复方案。

这不是一次模型调用就能完成的任务。Agent 至少需要：

1. 理解问题并制订排查计划；
2. 搜索订单创建相关代码；
3. 查找库存服务和调用链；
4. 阅读日志、测试结果和项目规范；
5. 对比多个可能原因；
6. 保存已经确认的事实；
7. 最后给出修复方案。

执行过程中会不断产生信息：

```text
用户问题
+ 项目开发规范
+ 订单服务代码
+ 库存服务代码
+ 搜索命中的 30 个文件
+ 5,000 行应用日志
+ 测试输出
+ Agent 的排查计划
+ 已排除的原因
+ 最终确认的根因
```

最直接的做法是把这些内容全部追加到消息列表：

```ts
const messages = [
  systemPrompt,
  userQuestion,
  searchResult1,
  searchResult2,
  applicationLogs,
  testOutput,
  // 后续结果继续追加……
];
```

但任务越往后，这种做法的问题越严重：

- 已确认的排查计划可能被旧消息淹没；
- 大量无关代码和日志占用 token；
- 模型可能反复检查已经排除的原因；
- 当前只需要库存调用链，却同时看到了订单、支付、营销等全部代码；
- 原始日志和中间分析混在一起，模型难以区分事实与推测。

Context Engineering 就是在解决这些具体问题。一个更合理的设计是：

```text
Write
把“排查计划、已确认事实、已排除原因”保存到 State。

Select
检查库存调用时，只取回库存相关代码、当前计划和最近结论。

Compress
把 5,000 行日志压缩成异常时间、错误码和关键调用链。

Isolate
让日志分析节点处理原始日志，让代码分析节点处理代码；
主 Agent 只接收二者的结论。
```

最终，模型在“判断根因”这一步真正看到的内容可能只有：

```text
当前目标：解释订单成功但库存未扣减的原因。

已确认事实：
1. OrderService.createOrder() 成功写入订单。
2. 创建订单后发布了 order.created 事件。
3. InventoryConsumer 监听的是 order.completed 事件。
4. 日志中没有 InventoryConsumer 的消费记录。

相关代码：
- OrderService.ts 的事件发布代码
- InventoryConsumer.ts 的事件订阅代码

请判断根因并提出修复方案。
```

这段上下文比“完整对话 + 全部文件 + 全部日志”短得多，却更能支持模型作出正确判断。

### 1.2 四种能力分别解决什么问题

| 能力 | 通俗解释 | 在排障 Agent 中的作用 | 不使用的后果 |
|---|---|---|---|
| Write | 把重要内容记到外部笔记里 | 保存计划、事实和排除项 | 信息随着消息裁剪而丢失，Agent 重复调查 |
| Select | 当前做什么，就只拿什么 | 只读取库存相关代码和记忆 | 无关代码、工具和记忆干扰判断 |
| Compress | 把大结果提炼成小结果 | 将长日志和搜索结果变成关键事实 | token、成本和延迟持续增加 |
| Isolate | 不同工作放在不同空间处理 | 日志、代码、测试由不同节点或 Agent 处理 | 原始数据混在一起，职责和上下文互相污染 |

四种策略并不是四套互斥方案，而是一条信息处理流水线：

```text
产生信息
  ↓ Write：保存下来
存有大量信息
  ↓ Select：取出当前相关部分
取出的内容仍然很大
  ↓ Compress：提炼关键内容
不同任务互相干扰
  ↓ Isolate：放到不同边界处理
形成下一步模型真正需要的上下文
```

---

## 二、Context Engineering 到底是什么

### 2.1 LLM 是 CPU，Context Window 是 RAM

文章借用了 Andrej Karpathy 的类比：

```text
LLM              ≈ CPU
Context Window   ≈ RAM
Context Engineering ≈ 操作系统对 RAM 的管理
```

模型可以拥有很强的推理能力，但每一次推理都只能基于当前 Context Window 中的内容。上下文窗口容量有限，且信息越多并不必然越好。

因此，真正的问题不是：

```text
模型“知道”多少？
```

而是：

```text
模型在当前这一步“看到了”什么？
```

### 2.2 上下文的三种类型

#### Instructions：指令类上下文

包括：

- System Prompt 和任务说明
- Tool 描述
- Few-shot 示例
- 用户偏好和行为规则
- Agent 之前形成的计划

例如：

```text
你是一名代码审查助手。
必须先读取项目规范，再检查代码。
不能修改生产环境文件。
```

#### Knowledge：知识类上下文

包括：

- RAG 检索结果
- 用户画像和长期记忆
- 数据库查询结果
- 项目文件和代码
- 外部 API 返回的数据

#### Tools：工具反馈类上下文

包括：

- 搜索结果
- 浏览器内容
- 数据库返回值
- 代码执行结果
- 其他 Agent 的结果

这些数据可以保存在系统中，但不一定要全部放进下一次模型调用的 messages。

### 2.3 Agent 为什么更需要上下文工程

普通问答通常是“一问一答”，而 Agent 会交替进行模型调用和工具调用，任务可能持续几十甚至几百轮。上下文不断累积，会导致以下问题。

#### Context Poisoning：上下文污染

错误信息或幻觉被写入上下文，并在后续步骤中被当成事实继续使用。

#### Context Distraction：上下文分散注意力

无关的旧对话、日志和工具结果过多，模型难以聚焦当前目标。

#### Context Confusion：上下文混淆

多个相似结果同时出现，模型无法判断哪一个才是当前有效信息。

#### Context Clash：上下文冲突

系统规则、用户要求、工具描述和外部资料之间发生矛盾，需要明确优先级和可信来源。

因此，长上下文并不是简单的“多多益善”。上下文应该经过筛选、压缩和分层管理。

---

## 三、Write：把上下文写到窗口之外

`Write` 的含义是：把重要信息保存到 Context Window 之外，后续需要时再取回。Context Window 不是数据库，也不是无限大的工作笔记。

它解决的是“Agent 做到一半，如何不忘记已经确认的信息”。

在排障任务中，Agent 先搜索订单代码，过一会儿又去分析库存日志。如果计划和中间结论只存在旧消息里，那么消息被裁剪后这些信息就会消失；即使没有被裁剪，它们也可能被大量工具结果淹没。

因此需要把真正应该保留的内容写到独立状态中：

```text
适合写入：任务计划、已确认事实、已排除原因、待办步骤
不宜直接写入：完整日志、全部搜索结果、随时可以重新生成的数据
```

### 3.1 Scratchpad：任务草稿区

人类解决复杂任务时会记笔记，Agent 也可以维护 Scratchpad。在订单排障任务中，它可以记录：

```text
任务目标：找出订单成功但库存未扣减的原因
已经完成：
1. 确认订单数据成功写入
2. 确认 OrderService 发布了 order.created 事件
3. 排除数据库事务回滚
待完成：
1. 检查库存消费者监听的事件名
2. 检查消息队列消费日志
3. 输出根因和修复方案
```

下面的工具让 Agent 主动把一条结论写入外部文件。模型只需要调用 `save_note`，不需要让所有旧消息永久留在 Context Window 中：

```ts
import { appendFile } from "node:fs/promises";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const saveNote = tool(
  async ({ note }) => {
    await appendFile("scratchpad.md", `${note}\n`, "utf8");
    return "note saved";
  },
  {
    name: "save_note",
    description: "保存当前任务的工作笔记",
    schema: z.object({ note: z.string() }),
  },
);
```

也可以写入 LangGraph State：

```ts
import type { BaseMessage } from "@langchain/core/messages";

interface AgentState {
  messages: BaseMessage[];
  plan: string;
  confirmedFacts: string[];
}
```

某个节点只更新笔记字段：

```ts
function researchNode(state: AgentState): Partial<AgentState> {
  const fact = "OrderService 在创建订单后发布 order.created 事件。";
  return { confirmedFacts: [...state.confirmedFacts, fact] };
}
```

这里的输入是当前 `state`，输出不是完整 State，而是需要合并的增量：

```text
输入：已经保存的 confirmedFacts
处理：加入刚刚从代码中确认的新事实
输出：更新后的 confirmedFacts
```

Scratchpad 的价值在于：中间结论可以持久化，但不必每一轮都完整地出现在模型上下文中。

### 3.2 短期记忆与 Checkpoint

LangGraph 的 Checkpointer 可以保存 Agent 在每个步骤的 State，使 Agent 能够：

- 保存当前计划
- 中断后继续
- 失败后恢复
- 支持人工审批
- 在同一个 thread 内跨多个模型调用保留工作状态

一个状态可以这样设计：

```ts
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  plan: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  confirmedFacts: Annotation<string[]>({
    reducer: (current, next) => [...current, ...next],
    default: () => [],
  }),
  ruledOutCauses: Annotation<string[]>({
    reducer: (current, next) => [...current, ...next],
    default: () => [],
  }),
  pendingApproval: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
});

type AgentStateType = typeof AgentState.State;
```

这几个字段各自承担不同职责：

| 字段 | 保存什么 | 为什么不只放在 `messages` |
|---|---|---|
| `plan` | 当前排查步骤 | 计划需要稳定存在，不能依赖旧对话是否保留 |
| `confirmedFacts` | 已由代码或工具验证的事实 | 防止事实和模型推测混在一起 |
| `ruledOutCauses` | 已排除原因 | 避免 Agent 反复调查同一路径 |
| `pendingApproval` | 是否等待人工确认 | 这是程序控制状态，不应靠模型从文本猜测 |

注意：State 中存在某个字段，不代表每次都必须把它暴露给模型。State 是程序状态，模型上下文只是 State 的一个经过选择的视图。

### 3.3 长期记忆

Scratchpad 主要服务于当前任务或当前 thread；长期记忆则可以跨多个会话保存：

- 用户偏好
- 项目规范
- 历史反馈
- 组织规则
- 用户画像

可以将长期记忆分为三种：

| 类型 | 保存内容 | 示例 |
|---|---|---|
| Semantic memory | 事实和知识 | 该项目使用事件驱动架构，事件常量定义在 `src/events/topics.ts` |
| Episodic memory | 过去的具体案例 | 上次生成 API 时用户要求先给设计方案 |
| Procedural memory | 行为规则 | 数据库变更前必须先生成迁移脚本 |

LangGraph 的 Store 和 LangMem 可以用于构建这类跨会话记忆系统。关键不是“记住一切”，而是只保存未来确实有用的信息。

例如，本次任务的“事件名不一致”是当前 thread 的事实，不一定值得永久保存；但“该项目使用事件驱动架构，事件名定义在 `src/events/topics.ts`”对未来排障仍有帮助，可以保存为长期项目记忆。

---

## 四、Select：只选择当前需要的上下文

`Select` 是指：从 State、Store、文件、知识库或工具集合中，只取回与当前任务相关的内容。

它解决的是“系统已经保存了很多信息，但模型当前到底应该看哪一些”。

排障 Agent 在不同阶段需要的上下文不同：

```text
制订计划时：用户问题 + 项目架构规则
检查订单代码时：OrderService + 订单事件定义
检查库存代码时：InventoryConsumer + 库存事件定义
判断根因时：双方事件名 + 关键日志 + 已确认事实
```

如果每一步都读取整个代码库、全部记忆和所有工具，Write 出去的信息又会全部塞回来，等于没有管理上下文。

### 4.1 从 Scratchpad 选择

如果 Scratchpad 是工具，Agent 可以主动调用读取工具；如果 Scratchpad 是 State，开发者可以在每个节点中决定暴露哪些字段。

```ts
function buildModelContext(state: AgentStateType) {
  return {
    plan: state.plan,
    confirmedFacts: state.confirmedFacts.slice(-5),
    ruledOutCauses: state.ruledOutCauses.slice(-3),
    recentMessages: state.messages.slice(-6),
  };
}
```

相比把完整 State 转成 Prompt，这种方式更容易控制 token，也能减少无关信息和敏感数据泄露。

这段代码表达的不是简单的数组截取，而是一条上下文规则：判断根因时保留任务计划、最近确认的事实、已排除原因和近期对话，不把原始日志、全部搜索命中和旧工具消息传给模型。

### 4.2 选择长期记忆

如果项目积累了几百或几千条长期记忆，不能每次全部注入模型。例如这次只需要检索“订单事件、库存消费者、消息队列”相关的项目记忆，不需要读取 UI 规范和部署文档。选择记忆时可以组合使用：

- 关键词检索
- 向量检索
- 标签和租户过滤
- 时间过滤
- 重要性排序
- 最近使用排序
- 知识图谱关系

伪代码：

```ts
const memories = await memoryStore.search({
  query: "订单创建成功但库存没有扣减，检查事件发布和消费流程",
  namespace: ["project", projectId],
  limit: 5,
});

const selectedMemories = memories.filter((item) => item.score >= 0.75);
```

记忆选择错误可能比没有记忆更糟。例如用户只问代码问题，系统却把过去保存的地理位置、家庭信息等无关内容注入上下文。记忆必须具备相关性、范围隔离和可解释性。

### 4.3 工具选择

Agent 拥有的工具越来越多时，一次性暴露所有 Tool 描述会造成工具混淆和错误调用。

工具描述本身也占用 Context Window，而且名字和功能相似时会影响模型判断。例如一个工程 Agent 可能拥有：

```text
searchCode、readFile、searchLogs、queryDatabase、runTests、
deployService、deleteResource、createTicket、sendMessage……
```

当前只是定位库存调用链，真正需要的通常只有 `searchCode`、`readFile` 和 `searchLogs`。减少候选工具既节省 token，也降低误调用高风险工具的可能性。

一种方案是对工具描述做检索：

```text
用户问题
  ↓
检索最相关的工具描述
  ↓
只向模型暴露当前任务可能需要的工具
```

例如当前步骤是“检查库存消费者”，可以只暴露：

```text
searchCode
readFile
searchLogs
```

而不是同时暴露部署、删除资源和发送消息等工具。LangGraph 生态中的 Bigtool 就采用了对工具描述进行语义搜索的思路。

### 4.4 知识选择与代码检索

文章特别强调：

> Indexing code ≠ Context retrieval

代码建立向量索引，并不等于能够准确找到完成任务所需的上下文。大型代码库通常需要组合：

- 关键词和 grep/file search
- AST 解析
- 符号索引
- 文件和目录关系
- 函数调用关系
- 向量检索
- Rerank 重排序

例如问题是“订单创建后在哪里扣库存”，真正相关的上下文可能是一条调用链：

```text
OrderService.create()
  → InventoryService.reserve()
  → StockRepository.update()
```

因此，代码 Agent 的检索应该同时考虑语义相关性、代码结构、调用关系、版本和当前工作区状态。

这一阶段的理想输出不是“搜到了 30 个文件”，而是可直接交给下一步推理的最小代码集合：

```text
src/order/OrderService.ts          发布 order.created
src/inventory/InventoryConsumer.ts 订阅 order.completed
src/events/topics.ts               定义两个事件常量
```

---

## 五、Compress：压缩上下文

`Compress` 的目标是保留完成任务所需要的 token，主要方式是摘要和裁剪。

它解决的是“选中的信息仍然太大，无法经济、清晰地交给模型”。

例如日志工具返回 5,000 行内容，其中真正相关的可能只有：

```text
10:02:13 OrderService 发布 order.created，orderId=O-1001
10:02:13 消息代理确认接收
10:02:13 至 10:10:00 没有 InventoryConsumer 消费记录
```

压缩不是随便删短，而是保留下一步完成任务所需要的证据、约束和引用。

### 5.1 Summarization：摘要

长任务执行几十轮后，可以把完整轨迹压缩为结构化摘要。仍以库存排障为例：

```text
任务目标：排查订单成功但库存未扣减。

已完成：
1. 确认订单 O-1001 创建成功
2. 确认 OrderService 发布 order.created
3. 确认 InventoryConsumer 监听 order.completed
4. 确认库存消费者没有被触发

当前判断：生产者和消费者的事件名不一致。

关键约束：
1. 事件名必须使用统一常量
2. 修复不能影响现有已完成订单流程
3. 需要补充事件消费集成测试

待完成：确认正确事件名，给出修改点和测试方案。
```

摘要必须保留：

- 用户目标
- 已确认事实
- 已执行动作
- 关键工具结果
- 已作出的决策
- 当前错误
- 未完成任务
- 约束条件
- 重要的文件路径、资源 ID 或引用来源

不要只生成“我们已经讨论了很多内容，当前正在继续处理”这类无法支持后续执行的空泛总结。

摘要可以按阶段进行：

```text
需求分析摘要
  ↓
代码定位摘要
  ↓
实现摘要
  ↓
测试摘要
  ↓
全局任务摘要
```

### 5.2 Trimming：裁剪

裁剪通常使用规则，不需要再次调用模型。例如只保留最近消息：

```ts
import { trimMessages } from "@langchain/core/messages";

const trimmed = await trimMessages(messages, {
  maxTokens: 6000,
  strategy: "last",
  tokenCounter: model,
  includeSystem: true,
  allowPartial: false,
});
```

还可以：

- 删除旧的工具调用细节
- 只保留工具结果摘要
- 删除重复消息
- 删除已经完成的中间步骤
- 限制单个工具结果长度

裁剪速度快、成本低、行为可预测，但可能误删关键决策。因此生产系统通常采用：

```text
硬裁剪 + 结构化摘要 + 关键事实持久化
```

三者承担的职责不同：

```text
关键事实持久化：保证重要事实不会因裁剪而丢失
结构化摘要：保留长任务的目标、进展和决策
硬裁剪：删除最近消息之外的冗余对话和工具细节
```

### 5.3 工具边界压缩

工具返回结果是上下文膨胀的主要来源之一。搜索网页、数据库查询和代码搜索都可能产生非常大的结果。

可以在工具节点之后增加压缩步骤：

```ts
async function summarizeSearchResults(results: string): Promise<string> {
  const prompt = `
你正在排查“订单成功但库存未扣减”的问题。
请从工具结果中提取：
1. 事件发布与消费记录
2. 时间、订单 ID 和错误码
3. 能证明或排除某个原因的证据
4. 不同结果之间的冲突
5. 对应的文件路径或日志位置

工具结果：
${results}
`;

  const response = await summarizer.invoke(prompt);
  return typeof response.content === "string"
    ? response.content
    : JSON.stringify(response.content);
}
```

该函数的输入可以是完整日志或大段搜索结果，输出应该是“可验证的关键事实”，而不是重新写一篇宽泛说明。原始数据仍保存在 State 或外部存储，后续如果需要核对细节，可以通过引用位置再次读取。

原始结果可以保存在 State、文件或外部存储中，模型上下文只接收摘要和引用 ID。

压缩的触发时机可以是：

```ts
if (estimatedTokens > contextWindow * 0.8) {
  await summarizeTrajectory();
}
```

也可以在完成一个阶段、工具结果过大、子 Agent 交接或工具调用次数过多时主动压缩，而不是等到上下文已经溢出。

---

## 六、Isolate：隔离上下文

`Isolate` 是把上下文拆分到不同边界，避免所有信息进入同一个模型调用。

它解决的是“不同类型的工作和数据互相干扰”。

在排障任务里，代码、日志和测试结果的处理方式完全不同：

```text
代码分析需要：文件、符号、调用关系
日志分析需要：时间线、订单 ID、错误码
测试执行需要：命令、退出码、失败用例
根因判断需要：三者的结论，而不是全部原始内容
```

隔离的本质不是为了增加 Agent 数量，而是给不同工作建立清晰的数据边界。

### 6.1 Multi-agent：多 Agent 隔离

当子任务确实需要独立工具、独立上下文或可以并行处理时，可以拆成多个专业 Agent：

```text
主 Agent
├── 代码分析 Agent：检查事件发布和订阅代码
├── 日志分析 Agent：还原订单 O-1001 的消息时间线
└── 测试 Agent：验证修复前后的事件消费行为
```

每个子 Agent 有自己的：

- System Prompt
- 工具集合
- 任务目标
- Context Window
- 中间过程

例如日志分析 Agent 只接收：

```text
请分析订单 O-1001 在 10:02 至 10:10 的消息队列日志，
确认 order.created 是否发布、被路由以及被库存消费者接收。
```

它不需要看到主 Agent 的全部对话、用户画像和其他工具日志。完成后只向主 Agent 返回压缩后的结果：

```text
日志结论：order.created 已成功发布并进入消息代理，
但没有 InventoryConsumer 的消费记录。
证据：logs/message-broker.log:1820-1842。
```

优点：

- 子任务上下文更干净
- 每个 Agent 更专注
- 可以并行执行
- 工具权限更容易控制

代价：

- 总 token 可能增加很多
- 需要设计 Agent 之间的协调协议
- 交接时可能丢失细节
- 子 Agent 结果可能发生冲突

所以拆分 Agent 的理由应该是上下文和职责确实需要隔离，而不是为了“看起来更高级”。

### 6.2 Sandbox：环境隔离

图片、音频、大型 DataFrame、完整网页和大型 JSON 等对象不适合一直放入模型上下文。

可以将它们放在 Sandbox 或执行环境中：

```text
模型：创建图像并保存为 image_1
环境：实际保存完整图像对象
模型：需要时调用 get_image_metadata("image_1")
```

模型只看到对象的 ID、摘要或必要的统计结果。Hugging Face 的 CodeAgent 就体现了这种思路：把状态和大对象放在执行环境中，只把选定的返回值交给 LLM。

排障 Agent 可以把完整日志文件保存在 Sandbox 中，只让模型通过工具执行过滤：

```ts
const result = await sandbox.run(
  `rg "O-1001|order.created|InventoryConsumer" logs/*.log`,
);

// 下一次模型调用只接收过滤后的文本和原始文件引用
return {
  excerpt: result.stdout,
  source: "logs/*.log",
};
```

这样模型不需要直接持有整个日志文件，Sandbox 中的数据也可以在后续步骤继续查询。

### 6.3 State：状态字段隔离

LangGraph 的 State Schema 本身就是一种上下文隔离机制：

```ts
import type { BaseMessage } from "@langchain/core/messages";

interface AgentState {
  messages: BaseMessage[];
  rawLogsRef: string;
  codeSearchResults: Array<Record<string, unknown>>;
  confirmedFacts: string[];
}
```

可以让：

- `rawLogsRef` 保存原始日志的位置，不直接保存到 messages
- `codeSearchResults` 保存代码搜索的结构化结果
- `confirmedFacts` 保存模型真正需要的事实
- `messages` 保存对话和工具消息

模型每次只读取：

```ts
const context = {
  messages: state.messages.slice(-5),
  confirmedFacts: state.confirmedFacts,
};
```

State 中的原始数据仍然可用，但不会自动污染模型上下文。

---

## 七、LangGraph 如何支持四种策略

LangGraph 是低层编排框架，开发者可以显式定义节点、状态和每次模型调用的上下文，因此适合落实这四种策略。

在代码层面，不需要寻找一个名为 `contextEngineering()` 的 API。上下文工程体现在三件事中：

1. State Schema 如何拆分原始数据、事实和控制状态；
2. 每个 Node 读取和写入哪些字段；
3. 调用模型前，如何从 State 组装本次 messages。

| 文章概念 | LangGraph / LangChain 落地方式 |
|---|---|
| Write Scratchpad | State 字段、文件工具、数据库 |
| Write 短期记忆 | Checkpointer、thread state |
| Write 长期记忆 | Store、LangMem |
| Select State | 在节点中选择需要的字段 |
| Select Memory | 向量检索、标签过滤、知识图谱 |
| Select Tools | 工具描述检索、Bigtool |
| Compress 摘要 | Summary node、摘要模型 |
| Compress 裁剪 | `trimMessages`、长度限制 |
| Compress 工具结果 | Tool wrapper、post-processing |
| Isolate 多 Agent | Supervisor、Swarm、subgraph |
| Isolate 环境 | E2B、Pyodide 等 Sandbox |
| Isolate 状态 | State Schema、隐藏字段 |

一个实用的 State 可以这样划分：

```ts
import type { BaseMessage } from "@langchain/core/messages";

interface AgentState {
  messages: BaseMessage[];
  plan: string;
  rawLogsRef: string;
  codeSearchResults: Array<Record<string, unknown>>;
  confirmedFacts: string[];
  ruledOutCauses: string[];
  selectedMemories: string[];
  phase: string;
}
```

对应的节点职责可以是：

```text
plannerNode        写入 plan
retrievalNode      写入 codeSearchResults 和 rawLogsRef
compressionNode    把工具结果压缩成 confirmedFacts
memoryNode         选择 selectedMemories
modelNode          只使用当前步骤需要的字段
handoffNode        把压缩结果交给子 Agent
```

关键原则是：

```text
State 是完整的程序状态，Model Context 是 State 的一个选择性视图。
```

例如最终判断根因的节点，可以显式构造小而清晰的模型输入：

```ts
async function diagnoseNode(state: AgentState) {
  const response = await model.invoke([
    {
      role: "system",
      content: [
        "你是 TypeScript 后端排障助手。",
        "只能基于已确认事实判断；推测必须明确标注。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `排查计划：${state.plan}`,
        `已确认事实：\n${state.confirmedFacts.join("\n")}`,
        `已排除原因：\n${state.ruledOutCauses.join("\n")}`,
        `相关项目记忆：\n${state.selectedMemories.join("\n")}`,
        "请给出根因、证据、修复位置和测试方案。",
      ].join("\n\n"),
    },
  ]);

  return { messages: [response] };
}
```

注意这个节点没有把 `rawLogsRef` 指向的完整日志或全部 `codeSearchResults` 发给模型。它只使用前面节点提炼过的事实，这就是四种策略最终汇合的位置。

---

## 八、LangSmith：建立观察和评测闭环

Context Engineering 不能只靠直觉。需要先观察 Agent 的真实行为，再验证改动是否有效。

### 8.1 观察什么

重点记录：

- 每次模型调用的完整 messages
- 每一步实际使用的 State 字段
- 工具输入和输出
- 检索到的文档和分数
- 每次调用的 token
- 上下文总长度
- 工具调用次数
- 子 Agent 的交接内容
- 最终答案和失败步骤

LangSmith 的价值是回答：

```text
Agent 到底看到了什么？
为什么选择了这个工具？
哪一次上下文导致了错误？
```

### 8.2 如何评测

建立一组真实任务，至少包含：

- 用户问题
- 期望答案或关键事实
- 期望工具调用
- 权限边界
- 重要业务约束

然后比较：

```text
原始 Agent
vs
加入摘要的 Agent
vs
加入记忆选择的 Agent
vs
加入工具选择的 Agent
```

评测指标不应只有“回答是否通顺”，还应包括：

- 任务成功率
- 工具选择准确率
- 检索召回和引用准确率
- 权限隔离正确率
- 平均 token 和延迟
- 上下文溢出率
- 失败恢复能力

理想的循环是：

```text
追踪上下文
  ↓
定位污染、冗余、冲突和过长问题
  ↓
实施 Write / Select / Compress / Isolate
  ↓
运行评测
  ↓
比较效果并继续调整
```

---

## 九、项目落地清单

### 9.1 先设计 State，而不是先堆 Prompt

明确区分：

```text
messages          对话消息
plan              当前计划
rawData           原始工具结果
processedData     程序处理后的结果
confirmedFacts    模型需要的关键事实
memory            长期记忆检索结果
approvalStatus    人工审批状态
```

不要把所有业务状态都塞进 `messages`。

### 9.2 找出最占 token 的部分

常见来源包括：

- 长对话
- 网页和搜索结果
- 大型数据库查询
- 完整代码文件
- 工具调用日志
- 子 Agent 交接结果

### 9.3 为每类信息选择策略

```text
未来还可能使用       → Write 到 State、Store 或文件
只在当前阶段有用     → Compress 成摘要
只在某个节点需要     → Select 后再暴露
体积很大或职责独立   → Isolate 到 Sandbox 或子 Agent
```

### 9.4 建立优先级和可信度

建议明确上下文优先级：

```text
系统安全规则 > 权限规则 > 业务规则 > 当前用户请求 > 外部参考资料
```

外部网页、用户输入和工具结果都应被当作数据，而不是自动执行的指令。

### 9.5 工具层强制执行边界

模型可以提出意图，程序负责确认：

- 用户身份
- 租户范围
- 访问权限
- 参数格式
- 高风险操作审批

不要让模型通过工具参数自行传入 `user_id` 或 `tenant_id` 来决定访问对象。

---

## 十、总结

这篇 LangChain 官方文章的核心不是“如何写一个更长的 Prompt”，而是把 Agent 上下文当成需要持续管理的运行时资源。

```text
Write：
把有价值的信息保存到上下文窗口之外。

Select：
只把当前任务需要的信息取回模型上下文。

Compress：
将冗余历史、工具结果和执行轨迹摘要或裁剪掉。

Isolate：
通过 State、子 Agent 和 Sandbox 分离不同类型的信息。
```

LangGraph 提供了实现这些策略所需要的控制点：

- 可持久化的 State
- Thread Checkpoint
- 长期 Store
- 节点级上下文组装
- 多 Agent 和 Subgraph
- Sandbox 集成

LangSmith 则提供观察和评测闭环。

最终目标可以浓缩成一句话：

> 不要追求让模型看到更多信息，而要在正确的时间，让正确的 Agent 看到完成当前步骤所需的最小信息集合。

---

## 延伸阅读

- [Context Engineering for Agents（LangChain 官方博客）](https://www.langchain.com/blog/context-engineering-for-agents)
- [LangGraph 文档](https://langchain-ai.github.io/langgraph/)
- [LangSmith 文档](https://docs.smith.langchain.com/)
- [LangMem](https://langchain-ai.github.io/langmem/)
