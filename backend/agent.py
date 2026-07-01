from openai import OpenAI
import json
from database import db_manager
from memory import memory_manager
from analytics import analytics_manager

class AgentConfig:
    api_key: str = ""
    base_url: str = "https://api.deepseek.com/v1"
    model: str = "deepseek-flash"

agent_config = AgentConfig()

def get_client():
    return OpenAI(api_key=agent_config.api_key, base_url=agent_config.base_url)

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_table_schema",
            "description": "必须调用此工具来获取数据库表的字段结构信息。",
            "parameters": {
                "type": "object",
                "properties": {
                    "schema": {
                        "type": "string",
                        "description": "The schema name of the table"
                    },
                    "table_name": {
                        "type": "string",
                        "description": "The name of the table"
                    }
                },
                "required": ["table_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_table_relations",
            "description": "必须调用此工具来获取表的外键关联信息。",
            "parameters": {
                "type": "object",
                "properties": {
                    "schema": {
                        "type": "string",
                        "description": "The schema name of the table"
                    },
                    "table_name": {
                        "type": "string",
                        "description": "The name of the table"
                    }
                },
                "required": ["table_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "execute_query",
            "description": "执行纯 SELECT 查询以探索数据。严禁在此执行 INSERT/UPDATE/DELETE。",
            "parameters": {
                "type": "object",
                "properties": {
                    "sql": {
                        "type": "string",
                        "description": "The SQL query to execute"
                    }
                },
                "required": ["sql"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "propose_modification",
            "description": "提交最终的造数 SQL（INSERT/UPDATE）提案。提交前必须确认已了解表结构。",
            "parameters": {
                "type": "object",
                "properties": {
                    "sql": {
                        "type": "string",
                        "description": "The SQL statement to propose"
                    },
                    "reasoning": {
                        "type": "string",
                        "description": "Explanation of why this SQL was generated"
                    }
                },
                "required": ["sql", "reasoning"]
            }
        }
    }
]

def run_agent_loop_stream(user_prompt: str, chat_history: list = None, field_constraints: dict = None, extract_knowledge: bool = True, goal_mode: bool = False):
    if not agent_config.api_key:
        yield json.dumps({"type": "error", "message": "API Key is not configured."}) + "\n"
        return
        
    client = get_client()
    system_prompt = """你是一个专业的数据库智能体，主要任务是帮助用户在 Huawei DWS (兼容 PostgreSQL) 中生成测试数据或修改数据。
请严格遵循以下思维链（Chain of Thought）流程工作以保证效率：
1. 分析：阅读用户的造数需求。
2. 探索：如果不清楚表结构，请调用 `get_table_schema` 和 `get_table_relations` 获取。若系统上下文中已提供表结构或用户已描述足够清晰，**请直接跳过此探查步骤**以提升效率！严禁凭空臆造表名或字段名。
3. 验证：你可以视情况使用 `execute_query` 执行 SELECT 语句查看现有数据格式。**严禁在 execute_query 中执行 INSERT/UPDATE 等写操作！**
4. 提交：根据掌握的真实表结构，生成准确的造数 SQL。如果目标表已存在数据，**请优先使用 UPDATE 语句**进行修改，**并且在 UPDATE 语句后紧跟一段 SELECT 语句**（让用户能查出被你 UPDATE 影响的数据，方便他们导出为 INSERT VALUES）。将这两条语句一起通过 `propose_modification` 提交你的提案。

注意事项：
- 字段类型和拼写必须与数据库严格一致，绝不臆造字段。
- 只有当目标表确实是空表或用户明确要求新增时，才可以使用 INSERT 语句生成数据。
- **请严格遵守：你的思考过程（Reasoning/Thinking）可以是英文，但最终的回复（Response）内容必须 100% 强制使用中文！绝对不要在回复中使用英文句子。**"""
    
    try:
        knowledge_list = memory_manager.get_all_knowledge()
        if knowledge_list:
            knowledge_texts = "\n- ".join([k["content"] for k in knowledge_list])
            system_prompt += f"\n\nHere is the accumulated knowledge base about the database:\n- {knowledge_texts}\n\nPlease strictly follow these rules/patterns when generating SQL."
    except Exception as e:
        print(f"Failed to load knowledge: {e}")

    if field_constraints:
        system_prompt += f"\n\nHere are the field-level constraints specified by the user. You MUST strictly follow them when generating data for these fields:\n{json.dumps(field_constraints, ensure_ascii=False, indent=2)}\n"

    messages = [
        {"role": "system", "content": system_prompt}
    ]
    
    if chat_history:
        messages.extend(chat_history)
        
    messages.append({"role": "user", "content": user_prompt})
    
    max_steps = 50 if goal_mode else 15
    step = 0
    final_proposals = []
    
    session_prompt_tokens = 0
    session_completion_tokens = 0
    
    try:
        while step < max_steps:
            try:
                yield json.dumps({"type": "status", "message": f"Thinking (Step {step+1}/{max_steps})..."}) + "\n"
                response = client.chat.completions.create(
                    model=agent_config.model,
                    messages=messages,
                    tools=tools,
                    tool_choice="auto",
                    stream=True
                )
            except Exception as e:
                yield json.dumps({"type": "error", "message": str(e)}) + "\n"
                return
            
            current_content = ""
            tool_calls = {}
        
            for chunk in response:
                if hasattr(chunk, 'usage') and chunk.usage:
                    session_prompt_tokens += getattr(chunk.usage, 'prompt_tokens', 0)
                    session_completion_tokens += getattr(chunk.usage, 'completion_tokens', 0)
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if delta.content:
                    current_content += delta.content
                    yield json.dumps({"type": "content_chunk", "chunk": delta.content}) + "\n"
                
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        if tc.index not in tool_calls:
                            tool_calls[tc.index] = {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": ""}}
                        if hasattr(tc, 'function') and tc.function and tc.function.arguments:
                            tool_calls[tc.index]["function"]["arguments"] += tc.function.arguments

            message_to_append = {"role": "assistant", "content": current_content}
        
            if not tool_calls:
                # Done
                messages.append(message_to_append)
            
                if extract_knowledge:
                    yield json.dumps({"type": "status", "message": "Extracting new knowledge..."}) + "\n"
                    try:
                        extract_prompt = """请基于之前的对话历史，提取有价值的新知识，以便在未来的会话中记住。
        重点关注：
        1. Schema 语义（例如：status=1 表示正常，status=2 表示封禁）
        2. 用户习惯（例如：生成的金额字段总是保留两位小数）
        3. 场景模板规律（例如：特定造数场景下的标准 SQL 结构）

        请务必使用**中文**进行总结。
        只返回一个包含 'items' 键的 JSON 对象，值为字符串列表。如果没有新知识需要记忆，请返回 {"items": []}。"""
                    
                        extract_messages = messages.copy()
                        extract_messages.append({"role": "user", "content": extract_prompt})
                    
                        ext_response = client.chat.completions.create(
                            model=agent_config.model,
                            messages=extract_messages,
                            response_format={"type": "json_object"}
                        )
                    
                        if hasattr(ext_response, 'usage') and ext_response.usage:
                            session_prompt_tokens += getattr(ext_response.usage, 'prompt_tokens', 0)
                            session_completion_tokens += getattr(ext_response.usage, 'completion_tokens', 0)
                    
                        ext_content = ext_response.choices[0].message.content
                        
                        import re
                        match = re.search(r'```(?:json)?\s*(\{.*\})\s*```', ext_content, re.DOTALL)
                        if match:
                            ext_content = match.group(1)
                            
                        extracted_data = json.loads(ext_content)
                        extracted_items = extracted_data.get("items", [])
                    
                        if extracted_items:
                            yield json.dumps({
                                "type": "knowledge_discovery",
                                "items": extracted_items
                            }) + "\n"
                    except Exception as e:
                        print(f"Knowledge extraction error: {e}")
                
                yield json.dumps({
                    "type": "finished", 
                    "proposals": final_proposals, 
                    "messages": messages
                }) + "\n"
                return
            
            message_to_append["tool_calls"] = [tc for tc in tool_calls.values()]
            messages.append(message_to_append)
        
            for tc in tool_calls.values():
                tool_name = tc["function"]["name"]
                args_str = tc["function"]["arguments"]
            
                yield json.dumps({"type": "tool_call", "name": tool_name, "arguments": args_str}) + "\n"
            
                try:
                    args = json.loads(args_str)
                    result = ""
                
                    if tool_name == "get_table_schema":
                        schema = db_manager.get_table_schema(args.get("table_name"), schema=args.get("schema"))
                        result = json.dumps(schema) if schema else "Table not found."
                    elif tool_name == "get_table_relations":
                        relations = db_manager.get_table_relations(args.get("table_name"), schema=args.get("schema"))
                        result = json.dumps(relations) if relations else "Table not found."
                    elif tool_name == "execute_query":
                        sql = args.get("sql", "")
                        if sql.strip().upper().startswith(("INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE")):
                            result = "Error: execute_query 只能执行 SELECT 语句。请将造数用的 SQL（如 INSERT）作为参数传递给 propose_modification 工具提交。"
                        else:
                            query_result = db_manager.execute_query(sql)
                            result = json.dumps(query_result)[:2000]
                    elif tool_name == "propose_modification":
                        final_proposals.append({
                            "sql": args.get("sql"),
                            "reasoning": args.get("reasoning")
                        })
                        result = "Proposal accepted."
                except Exception as e:
                    result = f"Error executing tool: {str(e)}. 提示：请检查 JSON 参数格式，或确保表名（区分大小写）、字段名真实存在。"
                
                yield json.dumps({"type": "tool_result", "name": tool_name, "result": result}) + "\n"
            
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "name": tool_name,
                    "content": result
                })
            
            step += 1
        
        yield json.dumps({"type": "error", "message": "Max steps reached."}) + "\n"
    finally:
        if step > 0:
            if session_prompt_tokens == 0 and session_completion_tokens == 0:
                chars = sum(len(m.get("content") or "") for m in messages if isinstance(m, dict))
                session_prompt_tokens = int(chars * 1.2)
                session_completion_tokens = 200
            analytics_manager.log_session(session_prompt_tokens, session_completion_tokens)
