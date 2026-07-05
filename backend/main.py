from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, Response
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import json
import os
from database import db_manager, DBConfig
from agent import agent_config, run_agent_loop_stream
from rag import rag_manager
from sessions import session_manager
from analytics import analytics_manager
import uvicorn
from security import encrypt_secret, decrypt_secret

# 为了防止 PyInstaller 打包时漏掉 FastAPI 动态引用的表单解析库
try:
    import multipart
except ImportError:
    pass
try:
    import python_multipart
except ImportError:
    pass


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AppConfig(BaseModel):
    db_config: DBConfig
    api_key: str
    base_url: str = "https://api.deepseek.com/v1"
    model: str = "deepseek-flash"

CONFIG_FILE = "app_config.json"

def load_saved_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                data = json.load(f)
                config = AppConfig(**data)
                config.db_config.password = decrypt_secret(config.db_config.password)
                config.api_key = decrypt_secret(config.api_key)
                return config
        except Exception:
            pass
    return None

def save_config_to_disk(config: AppConfig):
    config_copy = config.model_copy(deep=True)
    config_copy.db_config.password = encrypt_secret(config_copy.db_config.password)
    config_copy.api_key = encrypt_secret(config_copy.api_key)
    with open(CONFIG_FILE, 'w') as f:
        f.write(config_copy.model_dump_json(indent=2))

saved_config = load_saved_config()
if saved_config:
    db_manager.connect(saved_config.db_config)
    agent_config.api_key = saved_config.api_key
    agent_config.base_url = saved_config.base_url
    agent_config.model = saved_config.model

@app.get("/api/config")
def get_config():
    if saved_config:
        return saved_config.model_dump()
    return {}

@app.post("/api/config")
def set_config(config: AppConfig):
    success, msg = db_manager.connect(config.db_config)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    
    agent_config.api_key = config.api_key
    agent_config.base_url = config.base_url
    agent_config.model = config.model
    
    save_config_to_disk(config)
    global saved_config
    saved_config = config
    
    return {"status": "success", "message": "Configuration applied successfully."}

@app.post("/api/config/test_api")
def test_api_connection(config: AppConfig):
    try:
        from openai import OpenAI
        client = OpenAI(api_key=config.api_key, base_url=config.base_url, timeout=10.0)
        
        tools = [{
            "type": "function",
            "function": {
                "name": "ping",
                "description": "Ping tool for testing",
                "parameters": {
                    "type": "object",
                    "properties": {"test": {"type": "string"}}
                }
            }
        }]
        
        response = client.chat.completions.create(
            model=config.model,
            messages=[{"role": "user", "content": "Hello, ping me."}],
            tools=tools,
            tool_choice="auto",
            max_tokens=10
        )
        return {"status": "success", "message": "API 连通性与 Agent 能力测试成功！模型响应正常。"}
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        raise HTTPException(status_code=400, detail=f"API 测试失败: {str(e)}\n\n详情:\n{error_details}")

class ChatRequest(BaseModel):
    prompt: str
    history: list = []
    field_constraints: dict = {}
    goal_mode: bool = False

@app.post("/api/agent/chat")
def agent_chat(req: ChatRequest):
    return StreamingResponse(
        run_agent_loop_stream(req.prompt, req.history, req.field_constraints, req.goal_mode),
        media_type="application/x-ndjson"
    )

class ExtractKnowledgeRequest(BaseModel):
    history: list

@app.post("/api/agent/extract_knowledge")
def extract_knowledge(req: ExtractKnowledgeRequest):
    try:
        from openai import OpenAI
        client = OpenAI(api_key=agent_config.api_key, base_url=agent_config.base_url)
        extract_prompt = """请基于以下多轮对话历史，提取有价值的新知识，以便在未来的会话中记住。
        重点关注：
        1. Schema 语义（例如：status=1 表示正常，status=2 表示封禁）
        2. 用户习惯（例如：生成的金额字段总是保留两位小数）
        3. 场景模板规律（例如：特定造数场景下的标准 SQL 结构）

        请务必使用**中文**进行总结。
        只返回一个包含 'items' 键的 JSON 对象，值为字符串列表。如果没有新知识需要记忆，请返回 {"items": []}。"""
        
        messages = req.history.copy()
        messages.append({"role": "user", "content": extract_prompt})
        
        response = client.chat.completions.create(
            model=agent_config.model,
            messages=messages,
            response_format={"type": "json_object"}
        )
        content = response.choices[0].message.content
        import re
        match = re.search(r'```(?:json)?\s*(\{.*\})\s*```', content, re.DOTALL)
        if match:
            content = match.group(1)
        data = json.loads(content)
        return {"status": "success", "items": data.get("items", [])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SaveSessionRequest(BaseModel):
    id: Optional[str] = None
    title: str
    history: list

@app.post("/api/sessions")
def save_session(req: SaveSessionRequest):
    try:
        session_id = session_manager.create_or_update_session(req.id, req.title, req.history)
        return {"status": "success", "id": session_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sessions")
def get_sessions():
    try:
        return {"status": "success", "data": session_manager.get_all_sessions()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sessions/{session_id}")
def get_session(session_id: str):
    try:
        data = session_manager.get_session(session_id)
        if not data:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"status": "success", "data": data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: str):
    try:
        session_manager.delete_session(session_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ExecuteRequest(BaseModel):
    sql: str

@app.post("/api/db/execute")
def execute_sql(req: ExecuteRequest):
    try:
        res = db_manager.execute_query(req.sql)
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/db/schemas")
def get_schemas():
    try:
        return {"status": "success", "data": db_manager.get_schemas()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/db/schema/{schema_name}/tables")
def get_tables(schema_name: str):
    try:
        return {"status": "success", "data": db_manager.get_tables(schema_name)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/db/schema/{schema_name}/{table_name}/fields")
def get_table_fields(schema_name: str, table_name: str):
    try:
        schema_data = db_manager.get_table_schema(table_name, schema=schema_name)
        if not schema_data:
            raise HTTPException(status_code=404, detail="Table not found")
        return {"status": "success", "data": schema_data["columns"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from typing import Union, Optional

class KnowledgeItem(BaseModel):
    content: str
    target: Optional[str] = ""

class ApproveKnowledgeRequest(BaseModel):
    items: list[Union[str, KnowledgeItem]]

@app.post("/api/knowledge/approve")
def approve_knowledge(req: ApproveKnowledgeRequest):
    try:
        contents = []
        metadatas = []
        for item in req.items:
            if isinstance(item, str):
                contents.append(item)
                metadatas.append({"target": ""})
            else:
                contents.append(item.content)
                metadatas.append({"target": item.target})
        rag_manager.add_knowledge(contents, metadatas=metadatas)
        return {"status": "success", "message": f"Added {len(req.items)} knowledge items."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/knowledge")
def get_knowledge():
    try:
        return {"status": "success", "data": rag_manager.get_all_knowledge()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/knowledge/export")
def export_knowledge():
    try:
        data = rag_manager.get_all_knowledge()
        return Response(content=json.dumps(data, ensure_ascii=False, indent=2), media_type="application/json", headers={"Content-Disposition": "attachment; filename=knowledge_export.json"})
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/knowledge/import_preview")
async def import_preview(file: UploadFile = File(...)):
    try:
        content = await file.read()
        items = json.loads(content)
        
        existing = rag_manager.get_all_knowledge()
        existing_contents = {item['content']: item for item in existing}
        existing_targets = {item['target']: item for item in existing if item.get('target')}
        
        diff = []
        for index, item in enumerate(items):
            content_val = item.get('content', '')
            target_val = item.get('target') or item.get('metadata', {}).get('target', '')
            
            provided_id = item.get('id')
            matched_by_id = next((x for x in existing if x['id'] == provided_id), None) if provided_id else None
            
            if matched_by_id:
                if matched_by_id['content'] == content_val:
                    diff.append({"action": "skip", "reason": "identical content", "item": item})
                else:
                    diff.append({"action": "update", "existing_id": matched_by_id['id'], "old_content": matched_by_id['content'], "new_content": content_val, "target": target_val, "item": item})
            elif content_val in existing_contents:
                diff.append({"action": "skip", "reason": "content already exists", "item": item})
            elif target_val and target_val in existing_targets:
                existing_item = existing_targets[target_val]
                diff.append({"action": "update", "existing_id": existing_item['id'], "old_content": existing_item['content'], "new_content": content_val, "target": target_val, "item": item})
            else:
                diff.append({"action": "add", "content": content_val, "target": target_val, "item": item})
                
        return {"status": "success", "diff": diff}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class ImportConfirmRequest(BaseModel):
    updates: List[Dict[str, Any]]
    adds: List[Dict[str, Any]]

@app.post("/api/knowledge/import_confirm")
def import_confirm(req: ImportConfirmRequest):
    try:
        for update in req.updates:
            item = update['item']
            target = item.get('target') or item.get('metadata', {}).get('target', '')
            rag_manager.update_knowledge(update['existing_id'], item['content'], metadata={"target": target})
            
        contents = []
        metadatas = []
        for add in req.adds:
            item = add['item']
            target = item.get('target') or item.get('metadata', {}).get('target', '')
            contents.append(item['content'])
            metadatas.append({"target": target})
            
        if contents:
            rag_manager.add_knowledge(contents, metadatas=metadatas)
            
        return {"status": "success", "message": f"Updated {len(req.updates)} items, added {len(req.adds)} items."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class UpdateKnowledgeRequest(BaseModel):
    content: str
    target: Optional[str] = None

@app.put("/api/knowledge/{knowledge_id}")
def update_knowledge(knowledge_id: str, req: UpdateKnowledgeRequest):
    try:
        metadata = {}
        if req.target is not None:
            metadata["target"] = req.target
        rag_manager.update_knowledge(knowledge_id, req.content, metadata=metadata if metadata else None)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/knowledge/{knowledge_id}")
def delete_knowledge(knowledge_id: str):
    try:
        rag_manager.delete_knowledge(knowledge_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


from lineage_extractor import extract_lineage_stream

@app.post("/api/knowledge/extract_from_csv")
async def extract_knowledge_from_csv(file: UploadFile = File(...), prompt: Optional[str] = Form(None), task_id: Optional[str] = Form(None)):
    try:
        file_bytes = await file.read()
        return StreamingResponse(
            extract_lineage_stream(file_bytes, file.filename, user_prompt=prompt, task_id=task_id),
            media_type="text/event-stream"
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class RetryFailedRequest(BaseModel):
    task_id: str
    new_task_id: str
    prompt: Optional[str] = None
    is_sql: bool = False

@app.post("/api/knowledge/retry_failed")
def retry_failed(req: RetryFailedRequest):
    from lineage_extractor import FAILED_CHUNKS, extract_lineage_stream
    if req.task_id not in FAILED_CHUNKS or not FAILED_CHUNKS[req.task_id]:
        raise HTTPException(status_code=404, detail="No failed chunks found for this task")
        
    failed_items = FAILED_CHUNKS[req.task_id]
    
    # Do not clear immediately in case the new connection drops, but we can rely on the new task to collect its own failures
    # Let's just clear it from the old task ID
    del FAILED_CHUNKS[req.task_id]
    
    return StreamingResponse(
        extract_lineage_stream(b'', "", user_prompt=req.prompt, task_id=req.new_task_id, items_override=failed_items, is_sql_override=req.is_sql),
        media_type="text/event-stream"
    )

@app.post("/api/task/{task_id}/{action}")
def control_task(task_id: str, action: str):
    from lineage_extractor import TASK_STATES
    if action not in ["pause", "resume", "stop"]:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    if task_id in TASK_STATES:
        if action == "resume":
            TASK_STATES[task_id] = "running"
        elif action == "pause":
            TASK_STATES[task_id] = "paused"
        elif action == "stop":
            TASK_STATES[task_id] = "stopped"
        return {"status": "success", "state": TASK_STATES[task_id]}
    else:
        raise HTTPException(status_code=404, detail="Task not found")

@app.get("/api/analytics")
def get_analytics():
    try:
        return {
            "status": "success",
            "data": {
                "daily": analytics_manager.get_daily_stats(),
                "today": analytics_manager.get_today_hourly_stats()
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
# Serve static files in production
import sys
if getattr(sys, 'frozen', False):
    # If running as PyInstaller bundled executable
    base_dir = sys._MEIPASS
    frontend_dist = os.path.join(base_dir, "frontend", "dist")
else:
    # If running normally
    frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")

if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")
    
    @app.get("/OG.ico")
    def serve_favicon():
        return FileResponse(os.path.join(frontend_dist, "OG.ico"))
        
    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        return FileResponse(os.path.join(frontend_dist, "index.html"))

if __name__ == "__main__":
    if getattr(sys, 'frozen', False):
        import multiprocessing
        import socket
        import webbrowser
        import threading
        import time

        multiprocessing.freeze_support()
        
        def get_user_port():
            while True:
                try:
                    user_input = input("⚠️  默认端口 8000 已被占用，请手动输入一个新的可用端口号 (例如 8080): ")
                    port = int(user_input.strip())
                    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                        if s.connect_ex(('127.0.0.1', port)) == 0:
                            print(f"❌ 端口 {port} 也被占用了，请换一个。")
                            continue
                    return port
                except ValueError:
                    print("❌ 请输入纯数字组成的有效端口号。")

        # Check if 8000 is free
        free_port = 8000
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', 8000)) == 0:
                free_port = get_user_port()
        
        def open_browser():
            time.sleep(1.5)
            print(f"\n🚀 服务已启动！如果在行内环境无法自动弹窗，请手动在浏览器访问: http://127.0.0.1:{free_port}\n")
            webbrowser.open(f"http://127.0.0.1:{free_port}")
            
        threading.Thread(target=open_browser, daemon=True).start()
        
        uvicorn.run(app, host="127.0.0.1", port=free_port)
    else:
        # 开发模式下使用字符串并开启热更新，排除 json 避免修改配置时触发重启导致前端 502
        uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True, reload_excludes=["*.json"])
