import json
import pandas as pd
from io import BytesIO
from typing import AsyncGenerator
from openai import OpenAI
from agent import agent_config
from rag import rag_manager
from analytics import analytics_manager
import time

TASK_STATES = {} # task_id -> 'running' | 'paused' | 'stopped'
FAILED_CHUNKS = {} # task_id -> list of failed items

def extract_lineage_stream(file_bytes: bytes, filename: str, user_prompt: str = None, task_id: str = None, items_override: list = None, is_sql_override: bool = False):
    try:
        if task_id:
            TASK_STATES[task_id] = 'running'
            
        is_sql = is_sql_override if items_override else filename.lower().endswith('.sql')
        file_type_name = 'SQL' if is_sql else 'CSV'
        yield f"data: {json.dumps({'type': 'status', 'message': f'正在读取 {file_type_name} 数据...', 'current': 0, 'total': 0})}\n\n"
        
        items_to_process = []
        if items_override is not None:
            items_to_process = items_override
        else:
            try:
                if is_sql:
                    text_content = file_bytes.decode('utf-8')
                    statements = [s.strip() for s in text_content.split(';') if s.strip()]
                    items_to_process = statements
                else:
                    df = pd.read_csv(BytesIO(file_bytes))
                    items_to_process = df.to_dict(orient='records')
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': f'解析 {file_type_name} 失败: {str(e)}', 'current': 0, 'total': 0})}\n\n"
                return
            return
            
        total_items = len(items_to_process)
        if total_items == 0:
            yield f"data: {json.dumps({'type': 'error', 'message': f'{file_type_name} 文件中没有有效数据/语句', 'current': 0, 'total': 0})}\n\n"
            return
            
        yield f"data: {json.dumps({'type': 'status', 'message': f'成功读取 {total_items} 条待处理内容，准备提炼...', 'current': 0, 'total': total_items})}\n\n"
        
        client = OpenAI(api_key=agent_config.api_key, base_url=agent_config.base_url)
        
        batch_size = 5 if not is_sql else 3  # SQL 块较大，缩小批次
        
        import queue
        from concurrent.futures import ThreadPoolExecutor
        import math
        
        msg_queue = queue.Queue()
        total_batches = math.ceil(total_items / batch_size)
        completed_batches = [0] # using list for mutable reference in closure
        success_count = [0]
        
        msg_queue.put(f"data: {json.dumps({'type': 'chunk_init', 'total_chunks': total_batches})}\n\n")
        
        def process_batch(batch, index):
            chunk_idx = index // batch_size
            # check early stop
            if task_id and TASK_STATES.get(task_id, 'running') == 'stopped':
                return
                
            msg_queue.put(f"data: {json.dumps({'type': 'chunk_update', 'chunk_index': chunk_idx, 'status': 'running'})}\n\n")
            msg_queue.put(f"data: {json.dumps({'type': 'status', 'message': f'正在并发提炼第 {index+1} - {min(index+batch_size, total_items)} 项内容...', 'current': index, 'total': total_items})}\n\n")
            
            batch_repr = json.dumps(batch, ensure_ascii=False, indent=2) if not is_sql else '\n\n---\n\n'.join(batch)
            user_context = f"\n\n【用户补充提示】：\n{user_prompt}\n(请在分析时重点参考以上用户的说明。)" if user_prompt else ""
            prompt = f"""你是一个高级数据血缘分析专家。以下是从系统中导出的带有加工逻辑的数据或 SQL 脚本片段（包含预警信号、变量或事件逻辑）。{user_context}
请逐条/逐段分析，提取结构化的数据血缘信息。

【输入内容】：
{batch_repr}

【输出要求】：
请务必返回一个合法的 JSON 数组，包含提取出来的所有对象的血缘信息，每个对象必须包含以下字段：
- target_variable: 目标加工变量/事件/信号名
- source_tables: 依赖的来源底层表（数组）
- logic_summary: 自然语言描述的核心加工逻辑与条件
- parameters: 逻辑中涉及的关键参数或变量（数组）

如果某条记录无法提取有效信息，可以忽略它。
请务必只输出 JSON，不要包含任何额外的描述。输出格式如：
{{
  "items": [
    {{
       "target_variable": "...",
       "source_tables": ["..."],
       "logic_summary": "...",
       "parameters": ["..."]
    }}
  ]
}}
"""
            max_retries = 3
            for attempt in range(max_retries):
                if task_id and TASK_STATES.get(task_id, 'running') == 'stopped':
                    return
                try:
                    response = client.chat.completions.create(
                        model=agent_config.model,
                        messages=[{"role": "user", "content": prompt}],
                        response_format={"type": "json_object"},
                        timeout=30.0
                    )
                    content = response.choices[0].message.content
                    
                    if hasattr(response, 'usage') and response.usage:
                        analytics_manager.log_session(
                            response.usage.prompt_tokens,
                            response.usage.completion_tokens
                        )
                        
                    import re
                    match = re.search(r'```(?:json)?\s*(\{.*\})\s*```', content, re.DOTALL)
                    if match:
                        content = match.group(1)
                    data = json.loads(content)
                    items = data.get("items", [])
                    
                    for item in items:
                        target = item.get("target_variable", "未知目标")
                        tables = ", ".join(item.get("source_tables", []))
                        logic = item.get("logic_summary", "无")
                        params = ", ".join(item.get("parameters", []))
                        markdown_knowledge = f"关于【{target}】的血缘与加工逻辑：\n- **来源表**: {tables}\n- **加工逻辑**: {logic}\n- **依赖参数/变量**: {params}"
                        rag_manager.add_knowledge([markdown_knowledge], metadatas=[{"target": target}])
                        success_count[0] += 1
                    
                    msg_queue.put(f"data: {json.dumps({'type': 'chunk_update', 'chunk_index': chunk_idx, 'status': 'done'})}\n\n")
                    msg_queue.put(f"data: {json.dumps({'type': 'status', 'message': f'批次提取成功 ({len(items)} 条)', 'current': min(index+batch_size, total_items), 'total': total_items})}\n\n")
                    break
                    
                except Exception as e:
                    if attempt == max_retries - 1:
                        if task_id:
                            FAILED_CHUNKS.setdefault(task_id, []).extend(batch)
                        msg_queue.put(f"data: {json.dumps({'type': 'chunk_update', 'chunk_index': chunk_idx, 'status': 'error'})}\n\n")
                        msg_queue.put(f"data: {json.dumps({'type': 'error', 'message': f'提炼失败，已重试 {max_retries} 次: {str(e)}', 'current': min(index+batch_size, total_items), 'total': total_items})}\n\n")
                    else:
                        msg_queue.put(f"data: {json.dumps({'type': 'status', 'message': f'第 {attempt+1} 次重试...', 'current': index, 'total': total_items})}\n\n")
            
            completed_batches[0] += 1
            msg_queue.put("BATCH_DONE")
            
        with ThreadPoolExecutor(max_workers=5) as executor:
            for i in range(0, total_items, batch_size):
                executor.submit(process_batch, items_to_process[i:i+batch_size], i)
                
            while completed_batches[0] < total_batches:
                if task_id:
                    state = TASK_STATES.get(task_id, 'running')
                    if state == 'stopped':
                        yield f"data: {json.dumps({'type': 'error', 'message': '任务已被用户手动停止', 'current': total_items, 'total': total_items})}\n\n"
                        break
                    elif state == 'paused':
                        time.sleep(1)
                        continue
                        
                try:
                    msg = msg_queue.get(timeout=0.5)
                    if msg == "BATCH_DONE":
                        continue
                    yield msg
                except queue.Empty:
                    continue
        
        if not (task_id and TASK_STATES.get(task_id) == 'stopped'):
            yield f"data: {json.dumps({'type': 'finished', 'message': f'提炼完成！共提取并保存了 {success_count[0]} 条数据血缘知识。', 'current': total_items, 'total': total_items})}\n\n"
        
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': f'系统错误: {str(e)}', 'current': 0, 'total': 0})}\n\n"
