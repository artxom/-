import json
import re
from openai import OpenAI
from main import load_saved_config
from agent import agent_config

saved_config = load_saved_config()
agent_config.api_key = saved_config.api_key
agent_config.base_url = saved_config.base_url
agent_config.model = saved_config.model

text_content = open("/Users/artxom/Library/CloudStorage/OneDrive-个人/CBHB-渤海银行/Take This/20260704/DWS-事件库加工/安硕司法事件表插入脚本.sql").read()
statements = [s.strip() for s in text_content.split(';') if s.strip()]
print(f"Total statements: {len(statements)}")

client = OpenAI(api_key=agent_config.api_key, base_url=agent_config.base_url)
batch = statements[:3]
batch_repr = '\n\n---\n\n'.join(batch)
prompt = f"""你是一个高级数据血缘分析专家。以下是从系统中导出的带有加工逻辑的数据或 SQL 脚本片段（包含预警信号、变量或事件逻辑）。
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

response = client.chat.completions.create(
    model=agent_config.model,
    messages=[{"role": "user", "content": prompt}],
    response_format={"type": "json_object"}
)
content = response.choices[0].message.content
print("=== LLM RAW CONTENT ===")
print(content)

match = re.search(r'```(?:json)?\s*(\{.*\})\s*```', content, re.DOTALL)
if match:
    content = match.group(1)
try:
    data = json.loads(content)
    print("Parsed JSON successfully:", len(data.get("items", [])))
except Exception as e:
    print("JSON Decode Error:", e)

