from openai import OpenAI
import json
from database import db_manager
from memory import memory_manager
from analytics import analytics_manager

class AgentConfig:
    api_key: str = ""
    base_url: str = "https://api.deepseek.com/v1"
    model: str = "deepseek-v4-pro"

agent_config = AgentConfig()

def get_client():
    return OpenAI(api_key=agent_config.api_key, base_url=agent_config.base_url)

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_table_schema",
            "description": "Get the schema of a specific table in the database.",
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
            "description": "Get the foreign key relations of a specific table in the database.",
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
            "description": "Execute a SQL query (SELECT only) to explore data.",
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
            "description": "Propose a SQL modification statement (INSERT, UPDATE) to generate or change data. This will NOT be executed immediately.",
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

def run_agent_loop_stream(user_prompt: str, chat_history: list = None, field_constraints: dict = None):
    if not agent_config.api_key:
        yield json.dumps({"type": "error", "message": "API Key is not configured."}) + "\n"
        return
        
    client = get_client()
    system_prompt = "You are an expert database agent helping users generate or modify data in a Huawei DWS (PostgreSQL compatible) database. Explore schema and data with tools, then use propose_modification to suggest data generation SQL."
    
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
    
    max_steps = 15
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
                        sql = args.get("sql")
                        if sql.strip().upper().startswith(("INSERT", "UPDATE", "DELETE", "DROP", "ALTER")):
                            result = "Error: execute_query is for SELECT only. Use propose_modification for changes."
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
                    result = f"Error executing tool: {str(e)}"
                
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
