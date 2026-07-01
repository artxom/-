from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
import json
import os
from database import db_manager, DBConfig
from agent import agent_config, run_agent_loop_stream
from memory import memory_manager
from analytics import analytics_manager
import uvicorn
from security import encrypt_secret, decrypt_secret

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
    extract_knowledge: bool = True
    goal_mode: bool = False

@app.post("/api/agent/chat")
def agent_chat(req: ChatRequest):
    return StreamingResponse(
        run_agent_loop_stream(req.prompt, req.history, req.field_constraints, req.extract_knowledge, req.goal_mode),
        media_type="application/x-ndjson"
    )

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

class ApproveKnowledgeRequest(BaseModel):
    items: list[str]

@app.post("/api/knowledge/approve")
def approve_knowledge(req: ApproveKnowledgeRequest):
    try:
        memory_manager.add_knowledge(req.items)
        return {"status": "success", "message": f"Added {len(req.items)} knowledge items."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/knowledge")
def get_knowledge():
    try:
        return {"status": "success", "data": memory_manager.get_all_knowledge()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class UpdateKnowledgeRequest(BaseModel):
    content: str

@app.put("/api/knowledge/{knowledge_id}")
def update_knowledge(knowledge_id: int, req: UpdateKnowledgeRequest):
    try:
        memory_manager.update_knowledge(knowledge_id, req.content)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/knowledge/{knowledge_id}")
def delete_knowledge(knowledge_id: int):
    try:
        memory_manager.delete_knowledge(knowledge_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

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
    
    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        return FileResponse(os.path.join(frontend_dist, "index.html"))

if __name__ == "__main__":
    if getattr(sys, 'frozen', False):
        import multiprocessing
        multiprocessing.freeze_support()
        uvicorn.run(app, host="127.0.0.1", port=8000)
    else:
        # 开发模式下使用字符串并开启热更新
        uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
