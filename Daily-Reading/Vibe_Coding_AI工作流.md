# Vibe Coding AI 编程工作流

> 可直接复制给 Cursor / Claude Code / GitHub Copilot / Windsurf 等 AI 编程工具使用。
>
> **核心思想**：不要一上来让 AI 写代码，而是让它 **"定需求 → 做设计 → 拆任务 → 分步实现 → 自测修复"**。这套方法论被称为 **Spec-Driven Development（规范驱动开发）**，是当前社区公认最高效的 AI 编程范式。

---

## 一、项目启动前的工程规范（新增）

> **2025-2026 年社区共识**：Vibe Coding 落地成败，由前置工程规范决定，而非提示词的精细修饰。在开始任何 AI 编程之前，先把"规则"铺好。

### 1.1 创建项目规则文件

在项目根目录创建一个规则文件，让 AI 在每次对话时自动读取项目规范：

| 工具 | 规则文件路径 | 说明 |
|------|-------------|------|
| Cursor | `.cursor/rules/*.mdc` 或 `.cursorrules` | 项目级规则，支持 glob 匹配 |
| Claude Code | `CLAUDE.md` | 每次对话自动读取，支持层级继承 |
| Windsurf | `.windsurfrules` | 类似 Cursor Rules |
| GitHub Copilot | `.github/copilot-instructions.md` | Copilot 项目指令 |

**规则文件模板（Monorepo 架构）：**

```markdown
# 项目规则

## 项目架构
本项目采用 Monorepo 架构，使用 pnpm workspace + Turborepo 管理多包协同。
所有子包共享统一的工程规范和构建流水线。

## 技术栈
- 前端：React 18 + TypeScript + Tailwind CSS + Vite
- 后端：NestJS + Prisma ORM
- 数据库：PostgreSQL
- 公共包：@repo/utils（公共方法）、@repo/types（共享类型）、@repo/config（统一配置）
- 代码质量：ESLint + Prettier + Husky + lint-staged + commitlint
- 测试：Vitest（前端）+ Jest（后端）
- 部署：Docker + Turborepo remote cache + Vercel / Railway

## 代码规范
- 使用函数式组件 + Hooks，禁止 class 组件
- 所有变量使用 camelCase，组件使用 PascalCase，常量使用 UPPER_SNAKE_CASE
- 每个文件不超过 200 行，超过则拆分
- 所有 API 调用统一放在各子包的 services/ 目录
- 跨包复用的公共方法统一放在 packages/utils/ 中，通过 @repo/utils 引用
- 共享类型定义统一放在 packages/types/ 中，禁止在各子包中重复定义
- 错误处理使用统一的 ErrorBoundary 组件（前端）和全局 ExceptionFilter（后端）
- 提交代码前必须通过 Husky 触发的 lint-staged 检查（ESLint + Prettier）
- commit message 必须遵循 Conventional Commits 规范，由 commitlint 校验

## 目录结构（Monorepo）
项目根目录/
  apps/
    web/              # 前端应用
      src/
        components/   # 可复用 UI 组件
        pages/        # 页面级组件
        services/     # 前端 API 调用层
        hooks/        # 自定义 Hooks
        store/        # 状态管理
        assets/       # 静态资源
      package.json
    api/              # 后端 NestJS 应用
      src/
        modules/      # 按业务拆分的 NestJS 模块
        common/       # 后端公共守卫、拦截器、装饰器
        prisma/       # Prisma schema & migrations
      package.json
  packages/
    utils/            # 公共方法（跨前后端复用）
      src/
        format.ts     # 格式化工具（日期、金额、字符串等）
        validate.ts   # 校验工具（邮箱、手机号、表单等）
        request.ts    # 统一请求封装
        helpers.ts    # 其他通用辅助函数
      package.json
    types/            # 共享 TypeScript 类型定义
      src/
        api.ts        # API 请求/响应类型
        models.ts     # 数据模型类型
      package.json
    config/           # 共享配置（ESLint、TSConfig、环境变量等）
      eslint/         # 统一 ESLint 配置
      tsconfig/       # 统一 TypeScript 配置
      package.json
  turbo.json          # Turborepo 构建编排配置
  pnpm-workspace.yaml # pnpm workspace 声明
  package.json
  .husky/             # Git hooks（pre-commit / commit-msg）
  .eslintrc.js        # 根目录 ESLint 入口（引用 @repo/config/eslint）

## 禁止事项
- 不要使用 any 类型，类型统一从 @repo/types 引入
- 不要使用内联样式
- 不要引入未在 package.json 中声明的依赖
- 不要在 apps/ 中重复定义已存在于 packages/utils/ 的公共方法
- 不要绕过 Husky 的 pre-commit 检查（禁止 --no-verify）
- 不要生成测试文件或文档（除非明确要求）
- 不要修改不在当前任务范围内的代码
- 不要在子包中直接引用另一个子包的内部文件，必须通过包名引用
```

### 1.2 上下文管理策略

> 当前社区的共识是：**上下文工程（Context Engineering）比 Prompt Engineering 更重要**。

核心原则：

- **显式引用**：用 `@file` 或 `@folder` 主动喂上下文，不要让 AI 猜
- **分层管理**：全局规范放规则文件，局部任务放对话提示
- **及时清理**：上下文窗口过长时开新对话，避免 AI "遗忘"关键信息
- **活文档维护**：每次 AI 犯错被纠正后，把教训写回 `CLAUDE.md` / `.cursorrules`，防止重复犯错

---

## 二、总控提示词

这段可以作为整个项目开始时的**第一条指令**，先把 AI 的工作方式约束住。

```text
你现在是我的资深全栈开发助手。

我接下来要用 Vibe Coding 的方式完成一个项目。你不能一上来直接写代码，
而是必须严格按照以下流程推进：

1. Proposal：先帮我明确需求
2. Design：再帮我设计功能模块和技术方案
3. Tasks：把项目拆成可执行任务
4. Implement：按任务一步一步写代码
5. Test：每完成一个模块都要测试
6. Review：最后检查代码质量、潜在 bug 和优化点

在整个过程中，你必须遵守以下规则：

- 每一步开始前，先说明你要做什么
- 不确定的地方必须先问我，不能擅自决定
- 每次只改一小部分，不要一次性生成一大堆代码
- 写代码前，先读懂当前 Monorepo 项目结构（请先读取 .cursorrules 或 CLAUDE.md 了解项目规范，注意 apps/ 和 packages/ 的包划分）
- 修改代码时，要告诉我改了哪些文件、为什么改
- 每完成一个阶段，都要给我一个总结
- 如果出现报错，要先分析原因，再给修复方案
- 不要为了完成任务而编造不存在的库、API、文件或函数
- 代码要尽量简洁、可维护、有注释
- 适合使用 Git 进行版本管理，每完成一个稳定阶段就提醒我提交一次

现在我们从 Proposal 阶段开始。
```

---

## 三、Proposal 阶段：明确需求

**目标**：让 AI 先当产品经理和技术负责人，把项目边界、功能和风险讲清楚。

```text
现在进入 Proposal 阶段。

请你作为产品经理和技术负责人，帮我把这个项目需求整理清楚。

你需要输出以下内容：

1. 项目目标
   - 这个项目要解决什么问题
   - 用户是谁
   - 用户使用它完成什么事情

2. 核心功能
   - 必须有的功能（Must Have）
   - 可选功能（Nice to Have）
   - 暂时不做的功能（Won't Have）

3. 页面或模块
   - 有哪些页面
   - 每个页面负责什么
   - 页面之间如何跳转

4. 数据结构
   - 需要存储哪些数据
   - 每个数据包含哪些字段
   - 数据之间有什么关系

5. 交互流程
   - 用户从进入项目到完成主要操作的完整流程

6. 技术限制
   - 使用什么框架（参考项目规则文件中的技术栈）
   - 是否需要后端 / 数据库 / 登录 / 适配移动端

7. 风险点
   - 哪些地方可能比较难
   - 哪些地方容易出 bug
   - 哪些地方需要我提前确认

最后请你生成一个 proposal.md 的内容草稿。

注意：现在不要写代码，只做需求分析。
如果有不确定的地方，请先问我。
```

---

## 四、Design 阶段：技术设计

**目标**：基于需求文档做架构设计、目录设计、模块设计和数据模型设计。

```text
现在进入 Design 阶段。

请你基于刚才的 proposal.md，帮我完成技术设计。

你需要输出以下内容：

1. 项目整体架构
   - 前端结构
   - 后端结构
   - 数据流向
   - 页面和模块之间的关系

2. 技术选型
   - 前端：React + Vite + Tailwind CSS
   - 后端：NestJS + Prisma ORM
   - Monorepo 管理：pnpm workspace + Turborepo
   - 代码质量：ESLint + Prettier + Husky + lint-staged + commitlint
   - 公共方法：packages/utils/ 跨包复用
   - 为什么这样选（说明理由）

3. 文件目录设计
   本项目使用 Monorepo 架构，请按以下结构规划：
   - apps/web/ — 前端应用
   - apps/api/ — NestJS 后端应用
   - packages/utils/ — 跨包公共方法（所有可复用逻辑放这里）
   - packages/types/ — 共享类型定义
   - packages/config/ — ESLint / TSConfig 等统一配置
   给出每个子包内部的具体文件清单。

4. 核心模块设计
   每个模块都要说明：
   - 模块名称 / 作用 / 输入输出 / 关键函数 / 可能的异常

5. 数据模型设计
   每个字段都要说明：
   - 字段名 / 类型 / 是否必填 / 说明

6. 页面设计
   每个页面都要说明：
   - 页面功能 / 布局 / 用户操作 / 需要的数据 / 可能的状态（加载中、空数据、错误、正常）

7. 开发顺序建议
   告诉我应该先做什么，再做什么。

最后请你生成一个 design.md 的内容草稿。

注意：现在仍然不要写代码，只做设计。
```

---

## 五、Tasks 阶段：拆分任务

**目标**：把大项目拆成一个个可以稳定执行、可以测试的小任务。

> **核心原则：宁可拆得太细，不要拆得太粗。** 一个大阶段如果执行时间过长，AI 的上下文窗口会被压缩，早期对话内容会被"遗忘"，导致前后逻辑不一致、重复修改甚至严重返工。正确做法是把大阶段拆成可在 **10-15 分钟内完成** 的小步骤，每完成一个小步骤就 commit 一次，用 Git 历史代替记忆。

```text
现在进入 Tasks 阶段。

请你基于 proposal.md 和 design.md，把整个项目拆成可以逐步执行的开发任务。

任务拆分要求：

1. 两级拆分：大阶段 → 小步骤
   - 大阶段（Phase）：按功能模块划分，如"用户认证"、"首页布局"
   - 小步骤（Step）：每个大阶段内部再拆成 10-15 分钟可完成的最小执行单元
   - 每个小步骤必须足够小，做到"改完就能跑、跑完就能提交"
   - 禁止出现一个步骤需要 30 分钟以上才能完成的情况

2. 每个小步骤都要包含：
   - 步骤编号（格式：Phase.Step，如 2.3 表示第 2 阶段第 3 步）
   - 步骤名称
   - 步骤目标（一句话说明要做什么）
   - 涉及文件（明确到具体路径）
   - 完成标准（怎么算做完）
   - 自测方法（怎么验证做对了）

3. 任务顺序要合理
   - 先初始化 Monorepo 结构（pnpm workspace + Turborepo + Husky）
   - 再搭各子包基础配置（ESLint、TSConfig）
   - 再做基础组件和公共方法（packages/utils/）
   - 再做核心功能
   - 再做页面联动
   - 最后做测试和优化

4. 任务格式请使用 Markdown checklist，例如：

   ## Phase 2：用户认证模块

   - [ ] Step 2.1：搭建 auth 模块基础结构（NestJS Module + Controller + Service）
     - 目标：创建 auth 模块骨架代码
     - 涉及文件：apps/api/src/modules/auth/*
     - 完成标准：模块能被 NestJS 正确加载
     - 自测方法：pnpm --filter api start:dev 不报错

   - [ ] Step 2.2：实现注册接口
     - 目标：POST /api/auth/register 可用
     - 涉及文件：apps/api/src/modules/auth/auth.service.ts, auth.controller.ts
     - 完成标准：调用接口能成功创建用户
     - 自测方法：curl 或 Postman 测试注册接口

   - [ ] Step 2.3：实现登录接口 + JWT 签发
     ...

5. 每个小步骤完成后立即 Git commit，commit message 格式为：
   feat(大阶段名): 小步骤描述
   例如：
   feat(用户认证): 搭建 auth 模块基础结构
   feat(用户认证): 实现注册接口
   feat(用户认证): 实现登录接口和 JWT 签发

最后请你生成一个 tasks.md 的内容草稿。

注意：现在不要写代码，只拆任务。
```

---

## 六、Implement 阶段：分步写代码

**目标**：一次只执行一个任务，避免 AI 一次性改太多导致项目崩掉。

### 6.1 执行单个步骤

```text
现在进入 Implement 阶段。

请你只执行 tasks.md 里面的 Step 1.1。

执行规则：

1. 先阅读当前 Monorepo 项目结构和规则文件（注意 apps/、packages/ 的划分）
2. 判断这个步骤需要修改哪些文件、属于哪个子包
3. 如果需要新增公共方法，检查 packages/utils/ 中是否已有类似实现，避免重复
4. 先告诉我你的修改计划
5. 然后再开始写代码
6. 代码修改完成后，告诉我：
   - 新增了哪些文件（标注所属子包）
   - 修改了哪些文件
   - 每个文件的作用
   - 这个步骤是否完成
   - 我应该如何运行或测试（如 pnpm --filter web dev 或 pnpm --filter api start:dev）
7. 测试通过后，立即执行 Git commit，格式为 feat(大阶段名): 小步骤描述

注意：
- 只做当前步骤，不要提前做后面的步骤
- 不要大范围重构
- 不要删除已有功能
- 不确定的地方先问我
- 每个步骤完成后必须 commit，不要"攒几个一起提"
```

### 6.2 继续下一个步骤

每完成一个步骤后，用下面这段继续推进：

```text
继续执行 tasks.md 里面的下一个 Step。

要求：
1. 先总结上一个步骤完成情况（一句话）
2. 再说明当前步骤目标
3. 只修改当前步骤相关代码
4. 完成后给出测试方法
5. 立即执行 Git commit，格式为 feat(大阶段名): 小步骤描述
```

---

## 七、Debug 阶段：测试和报错修复

**目标**：让 AI 先分析报错类型和原因，再做最小范围修复。

```text
现在进入 Debug 阶段。

下面是我运行项目时遇到的报错：

【把报错粘贴在这里】

请你按照以下步骤处理：

1. 先判断报错类型
   - 语法错误 / 依赖错误 / 路径错误
   - 数据错误 / 逻辑错误 / 环境错误

2. 找出最可能的原因
3. 告诉我需要检查哪些文件
4. 给出最小修改方案
5. 不要重写整个项目
6. 修改后告诉我如何重新测试

注意：
不要直接猜答案。
如果需要查看某个文件，请先读取项目文件再分析。
```

> **实战技巧**：如果同一个错误反复出现，把这次的原因和解决方案记录到规则文件中，避免 AI 下次重蹈覆辙。

---

## 八、Review 阶段：最终检查

**目标**：检查需求是否完成、代码是否稳定、体验是否合理、还有哪些优化。

```text
现在进入 Review 阶段。

请你帮我对整个项目进行最终检查。

请检查以下内容：

1. 功能完整性
   - proposal.md 里的需求是否都实现了
   - 有没有遗漏或多做不必要的功能

2. 代码质量
   - 是否有重复代码 / 命名混乱 / 结构不清晰
   - 是否有可以抽成组件或函数的地方

3. Bug 风险
   - 空数据 / 网络失败 / 用户输入异常 / 页面跳转异常 / 数据保存失败

4. 性能问题
   - 不必要的重复渲染 / 重复请求 / 大文件或大图片

5. 用户体验
   - 加载状态 / 错误提示 / 空状态提示 / 操作流畅度

6. 安全性
   - 用户输入校验 / 敏感数据暴露 / 危险操作

最后请你输出：
- 当前项目完成度
- 还需要修复的问题（按优先级排序）
- 推荐的优化任务列表
```

---

## 九、完整使用节奏

实际操作时，建议严格按照下面的顺序来：

| 步骤 | 动作 | 产出 |
|------|------|------|
| 0 | 初始化 Monorepo 项目结构 | `pnpm-workspace.yaml` + `turbo.json` + `.husky/` |
| 1 | 创建项目规则文件 | `.cursorrules` / `CLAUDE.md` |
| 2 | 让 AI 生成 `proposal.md` | 需求文档 |
| 3 | 人工确认需求没问题 | — |
| 4 | 让 AI 生成 `design.md` | 技术设计文档 |
| 5 | 人工确认架构没问题 | — |
| 6 | 让 AI 生成 `tasks.md` | 任务清单 |
| 7 | 让 AI 从 Step 1.1 开始执行 | 代码 |
| 8 | 每完成一个 Step 就运行一次项目 | 验证 |
| 9 | 有报错就进入 Debug | 修复 |
| 10 | 测试通过后立即 Git commit | 版本快照 |
| 11 | 继续下一个 Step | 循环 7-10 |
| 12 | 全部完成后 Review | 优化清单 |

---

## 十、日常开发总控句

后续开发过程中，可以随时用这句话把 AI 拉回正确轨道：

```text
请严格按照 proposal.md、design.md 和 tasks.md 进行开发。

每次只完成一个 Step（小步骤）。

开始前先说明计划，完成后说明修改内容、测试方法，然后立即 Git commit。

不要跳过步骤，不要擅自扩大范围，不要一次性重构整个项目。
不要"攒"多个步骤一起提交——每做完一个 Step 就必须 commit。

新增公共方法请统一放入 packages/utils/，通过 @repo/utils 引用。
不要绕过 Husky 的 Git hooks 检查。
```

---

## 十一、Git 配合工作流

> **核心原则：小步提交，频繁提交。** 每个 Step 完成后立即 commit，不要等大阶段结束才提交。这样做的好处是：Git 历史成为你的"外挂记忆"，即使 AI 上下文被压缩，也能通过 `git log` 快速回顾做了什么；同时出问题时可以精确回滚到某个步骤，而不是回退整个大阶段。

每完成一个步骤，就让 AI 生成 commit 信息：

```text
当前步骤已经完成，请帮我生成 Git commit 并执行。

commit message 格式要求：
feat(大阶段名): 小步骤描述

示例：
feat(项目初始化): 搭建 Monorepo 基础结构和 pnpm workspace
feat(项目初始化): 配置 ESLint + Prettier + Husky
feat(用户认证): 搭建 auth 模块基础结构
feat(用户认证): 实现注册接口
feat(首页布局): 完成顶部导航栏组件
fix(用户认证): 修复 JWT 过期时间计算错误
refactor(公共方法): 将日期格式化函数迁移到 packages/utils
```

**Git 分支策略建议（新增）**：

```text
在开始新任务前，请帮我规划 Git 分支：
- main：只接受稳定的合并
- develop：日常开发分支
- feature/xxx：每个大功能一个分支
- fix/xxx：修复专用分支
每完成一个 feature 或 fix，帮我生成合并建议和 PR 描述。
```

**Husky + commitlint 自动校验（新增）**：

项目已配置 Husky 和 lint-staged，在 `git commit` 时会自动执行：
- `pre-commit`：运行 ESLint + Prettier 检查变更文件（lint-staged）
- `commit-msg`：校验 commit message 是否符合 Conventional Commits 规范

如果 commit 被 Husky 拦截，让 AI 帮你分析原因并修复：

```text
我的 git commit 被 Husky 的 pre-commit hook 拦截了，报错信息如下：

【粘贴报错】

请分析是 ESLint 报错、Prettier 格式问题还是 commit message 不规范，
然后帮我修复。不要使用 --no-verify 跳过检查。
```

---

## 十二、常见反模式与避坑指南（新增）

> 这些是社区总结的高频踩坑经验，避开这些反模式能大幅提高 Vibe Coding 成功率。

### 不要这样问

```text
❌ "帮我做一个完整项目。"
❌ "帮我写一个电商网站。"
❌ "把所有代码重新写一遍。"
❌ "这个报错了，帮我看看。"（不给报错信息）
```

### 推荐这样问

```text
✅ "我们一步一步来。先做 Proposal，不写代码。"
✅ "继续做 Design，不写代码。"
✅ "继续拆 Tasks，不写代码。"
✅ "现在只执行 Step 1.1。"
✅ "这是报错信息：[粘贴完整报错]，请先分析原因再修复。"
✅ "这个 Step 完成了，请帮我 commit：feat(用户认证): 实现登录接口。"
```

### 高频踩坑清单

| 坑 | 说明 | 解决方式 |
|----|------|---------|
| 一次改太多 | AI 生成大量代码导致项目崩溃 | 严格一个 Step 一个 Step 来 |
| 上下文丢失 | 对话太长 AI "忘记"前面的规范 | 适时开新对话，规则放文件里 |
| commit 间隔太长 | 大阶段很久不提交，上下文压缩后出错无法回滚 | 每个 Step 完成立即 commit |
| AI 编造依赖 | AI 虚构不存在的库或 API | 要求 AI 只使用已安装的依赖 |
| 不验证就跑 | 写完不测试直接继续 | 每完成一个 Step 必须跑一遍项目 |
| 忽略规则文件 | 没有创建或维护规则文件 | 建立并持续更新规则文件 |
| 盲目信任 AI | 不 review AI 生成的代码 | 每次修改后人工过一遍关键逻辑 |

---

## 十三、进阶：Spec Coding 规范驱动开发（新增）

> Spec Coding 是 Vibe Coding 的进阶形态，核心思路是：**用结构化的规范文档（Spec）驱动 AI 开发，而不是靠口语化的提示词**。

### 工作流程

```
spec/init     → 初始化项目规范（技术栈、目录结构、代码风格）
spec/feature  → 为每个功能写一份 spec 文档
spec/task     → 基于 spec 拆解具体任务
spec/implement → AI 严格按照 spec 实现代码
spec/verify   → 对照 spec 验收实现
```

### Spec 文档模板

```markdown
# Feature Spec: 用户登录

## 概述
用户可以通过邮箱+密码登录系统。

## 技术要求
- NestJS 后端实现 JWT 鉴权（@nestjs/jwt + Passport）
- Token 有效期 7 天
- 密码使用 bcrypt 加密
- Prisma ORM 操作用户数据

## 接口定义
POST /api/auth/login（apps/api/src/modules/auth/auth.controller.ts）
  请求：{ email: string, password: string }
  响应：{ token: string, user: { id, name, email } }

## 公共方法
- validateEmail()、validatePassword() → packages/utils/src/validate.ts

## 验收标准
- [ ] 正确邮箱密码可登录
- [ ] 错误密码返回 401
- [ ] 未注册用户返回 404
- [ ] Token 过期后自动跳转登录页
- [ ] 输入框有格式校验和错误提示
```

---

## 总结

让 AI **先当产品经理，再当架构师，再当项目经理，最后才当程序员**。

核心口诀：

1. **规则先行**：先建好 Monorepo 工程规范和规则文件，再开始写代码
2. **文档驱动**：Proposal → Design → Tasks → Code，每一步都有文档
3. **小步快跑**：每次只做一个小任务，做完就测
4. **公共复用**：跨包逻辑统一放 `packages/utils/`，杜绝重复造轮子
5. **持续记录**：AI 犯的错写回规则文件，越用越聪明
6. **人机协作**：AI 负责写，人负责审，Husky 负责守门
