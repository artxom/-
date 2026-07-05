import json
import pandas as pd
from io import BytesIO
from typing import AsyncGenerator
from openai import OpenAI
from agent import agent_config
from rag import rag_manager

async def extract_lineage_stream(file_bytes: bytes) -> AsyncGenerator[str, None]:
    try:
        yield f"data: {json.dumps({'type': 'status', 'message': '正在读取 CSV 文件...'})}\n\n"
        
        try:
            df = pd.read_csv(BytesIO(file_bytes))
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'解析 CSV 失败: {str(e)}'})}\n\n"
            return
            
        total_rows = len(df)
        if total_rows == 0:
            yield f"data: {json.dumps({'type': 'error', 'message': 'CSV 文件为空'})}\n\n"
            return
            
        yield f"data: {json.dumps({'type': 'status', 'message': f'成功读取 {total_rows} 行数据，准备提炼...'})}\n\n"
        
        client = OpenAI(api_key=agent_config.api_key, base_url=agent_config.base_url)
        
        batch_size = 5
        success_count = 0
        
        for i in range(0, total_rows, batch_size):
            batch = df.iloc[i:i+batch_size]
            batch_dict = batch.to_dict(orient='records')
            
            yield f"data: {json.dumps({'type': 'status', 'message': f'正在提炼第 {i+1} - {min(i+batch_size, total_rows)} 行数据...'})}\n\n"
            
            prompt = f"""你是一个高级数据血缘分析专家。以下是 {len(batch_dict)} 条从系统中导出的带有加工逻辑的数据（包含预警信号、变量或事件逻辑）。
请逐条分析，提取结构化的数据血缘信息。

【输入数据】：
{json.dumps(batch_dict, ensure_ascii=False, indent=2)}

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
            try:
                response = client.chat.completions.create(
                    model=agent_config.model,
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"}
                )
                content = response.choices[0].message.content
                import re
                match = re.search(r'```(?:json)?\s*(\{.*\})\s*```', content, re.DOTALL)
                if match:
                    content = match.group(1)
                data = json.loads(content)
                items = data.get("items", [])
                
                # Format and save to ChromaDB
                for item in items:
                    target = item.get("target_variable", "未知目标")
                    tables = ", ".join(item.get("source_tables", []))
                    logic = item.get("logic_summary", "无")
                    params = ", ".join(item.get("parameters", []))
                    
                    markdown_knowledge = f"关于【{target}】的血缘与加工逻辑：\n- **来源表**: {tables}\n- **加工逻辑**: {logic}\n- **依赖参数/变量**: {params}"
                    
                    rag_manager.add_knowledge(markdown_knowledge)
                    success_count += 1
                
                yield f"data: {json.dumps({'type': 'status', 'message': f'该批次成功提取 {len(items)} 条知识'})}\n\n"
                
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': f'第 {i+1} 批次提炼出错: {str(e)}'})}\n\n"
                continue
                
        yield f"data: {json.dumps({'type': 'finished', 'message': f'提炼完成！共提取并保存了 {success_count} 条数据血缘知识。'})}\n\n"
        
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': f'系统错误: {str(e)}'})}\n\n"
