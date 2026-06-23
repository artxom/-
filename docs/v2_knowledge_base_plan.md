# [DONE] DWS 造数工具 V2.0 规划书：Agent 知识库与长效记忆

## 1. 业务目标与背景
当前的 1.0 版本（Milestone 1）已经实现了从 0 到 1 的 DWS 数据库连通与 DeepSeek Agent 复杂 SQL 自动生成功能，并具备了高级现代化的交互 UI 以及流式反馈机制。

**V2.0 目标**：为了减少 Token 消耗、降低每次会话 Agent 反复试探数据库元数据的延迟，我们计划引入**持久化知识库 (Knowledge Base) 与长效记忆 (Long-term Memory)** 机制。

## 2. 知识类型定义
在下一次会话中，我们需要让 Agent 能够总结并保留以下类型的知识：
1. **元数据与业务语义 (Schema Semantics)**：例如 “`users` 表的 `status` 为 1 代表正常，2 代表封禁”。
2. **用户操作习惯 (User Habits)**：例如 “用户总是希望生成的金额字段精确到小数点后两位”。
3. **造数场景与案例 (Scenario Patterns)**：通过用户曾经审核执行过的优秀 SQL 案例，归纳出特定场景（如“双十一大促造数”）的标准模板代码。

## 3. 架构设计与实现思路

### 3.1 后端知识存储层 (Backend)
- **存储介质**：可以使用本地轻量级数据库（如 `sqlite3`）或结构化 JSON 文件 (`knowledge.json`)，如果涉及大量文本甚至可以引入轻量级向量库（如 ChromaDB）。
- **知识注入 (RAG)**：在每一次开启新的 `run_agent_loop_stream` 时，根据用户的 prompt 检索出最相关的几条“记忆”，动态注入到 DeepSeek 的 `system` 角色提示词中，从而直接免去 Agent 第一步盲目查询表结构的动作。

### 3.2 知识提炼与反刍机制 (Refined Extraction)
- **触发时机**：当一次连续的造数对话结束，或用户成功执行了一条复杂的造数 SQL 后，触发后台的“总结 Agent”。
- **提炼逻辑**：总结 Agent 会独立读取这段对话历史，提炼出上述的三种知识片段。

### 3.3 前端人工审核流 (Human-in-the-loop)
- **交互设计**：不能让大模型将错误的幻觉直接污染知识库。因此，在会话末尾（或专门的“知识沉淀”面板中），前端会弹出一个 **【新知识发现】确认框**。
- **UI 呈现**：将 Agent 提炼出的多条规则以 Checklist 的形式列出。用户可以勾选认为正确、有价值的经验，点击“保存入库”。只有被勾选的条目才会被真正写入后端的持久化存储中。

## 4. 给下一次 AntiGravity 会话的指引 (Handover Note)
如果你（下一个 AI Agent）看到了这份文档，说明你正在着手开发 V2.0 版本。
1. 请先浏览 `backend/agent.py` 了解当前的 ReAct 流式架构。
2. 你需要新建一个 `backend/memory.py` 用于管理 SQLite/JSON 的知识 CRUD 操作。
3. 在 `frontend/src/pages/AgentChatPage.tsx` 中增加一个新的状态组件或独立弹窗，用于在造数任务完成后，接收后端的 `type: "knowledge_discovery"` 流事件，并展示 Checklist 供用户 Review。
4. 确保在 `main.py` 提供对应的 `/api/knowledge/approve` 接口保存用户确认的知识。
