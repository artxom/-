# 莫知其味 - DWS 数据智能工作台

这是一个基于 React + FastAPI + SQLite + SQLAlchemy/DWS 构建的内网智能造数工具。支持自动探查 DWS 数据表外键关联、双表对齐造数，以及与 DeepSeek 大模型协同工作的 AI 造数 Agent。

---

## 💻 macOS 开发机日常调试指南

既然你现在在 macOS 开发机上进行日常开发修改，请使用以下命令启动开发环境（而不是打包）：

### 1. 启动前端开发服务器 (带热更新)
新开一个终端窗口：
```bash
cd frontend
npm run dev
```
*(前端将运行在 `http://localhost:5173`)*

### 2. 启动后端 API 服务器
再新开一个终端窗口：
```bash
cd backend
source venv/bin/activate  # 激活虚拟环境 (可选)
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
*(后端将运行在 `http://127.0.0.1:8000`)*

> **开发时请在浏览器访问前端的地址：`http://localhost:5173`** 
> (它会自动将 API 请求代理到后端的 8000 端口)。

---

## 🚀 Windows 系统下终极防踩坑打包指南 (给最终内网用户的)

如果你需要将此工具搬运至无网络的内网运行，请严格按照以下步骤，在一台**能连通外网且与内网系统一致的 Windows 电脑上**进行打包：

### 1. 准备基础环境 (如果尚未安装)
- 去 [Node.js 官网](https://nodejs.org/) 下载安装长期支持版 (LTS)。**安装时必须勾选 `Add to PATH`。**
- 去 [Python 官网](https://www.python.org/downloads/) 下载安装 Python 3.10 或 3.11。**安装界面第一页最底部，务必勾选 `Add Python.exe to PATH`。**
- 安装完毕后，请**重启电脑**或**重新打开全新的 CMD 命令行窗口**。

### 2. 第一步：打包前端静态资源
打开 CMD 命令行窗口，进入项目的 `frontend` 目录：
```cmd
cd frontend
npm install
npm run build
```
*(这一步会将网页压缩为静态文件，存入 `frontend/dist` 目录下)*

### 3. 第二步：环境清理与打包后端为 .exe
因为 PyInstaller 有缓存机制，为了避免漏打依赖，我们必须强制清空历史缓存。

退回到项目根目录，然后进入 `backend` 目录，执行以下**防坑硬核命令序列**：
```cmd
cd ..\backend

:: 1. 强制删掉旧的缓存，防止之前失败的依赖检测残留
rmdir /s /q build
rmdir /s /q dist
del 造数工具.spec

:: 2. 安装所有项目依赖和打包工具
py -m pip install -r requirements.txt
py -m pip install pyinstaller

:: 3. 执行最终打包，带上 --clean 清理缓存 (注意打包入口改为 launcher.py)
py -m PyInstaller --clean --name 造数工具 --onefile --icon ..\OG.ico --add-data "..\frontend\dist;frontend\dist" --hidden-import uvicorn --hidden-import backend.main --hidden-import main --paths . ..\launcher.py
:: (或者您可以直接在根目录运行 python build_exe.py，它会自动执行上述所有操作)
```

### 4. 提取成果！
等屏幕滚动停止并提示成功后，前往 `backend\dist` 目录下，你会看到一个体积在二三十兆左右的 **`造数工具.exe`**。
把它用 U 盘拷贝进内网的任意机器，双击运行即可！

---

## 💡 内网运行与排障说明

- **如何访问界面？** 双击 `.exe` 后，会弹出一个**可视化的控制台面板**。您可以在上面自定义端口（默认8000），点击【启动服务】后，面板下方会实时滚动显示后台日志。此时打开浏览器访问 `http://127.0.0.1:端口号` 即可。
- **如果不小心关掉了？** 如果关闭了浏览器，重新打开网址即可；如果想关闭服务，点击面板上的【停止服务】或直接关闭控制台窗口。
- **AI 无法对话卡在 Thinking？** 去配置页面点击【测试连通性】。如果提示 500 报错，说明内网的 API 中转网关不支持 Agent(Tools) 解析，请联系网关管理员修复。

## 🎯 Next Milestone: RAG Knowledge Base (单机/内网版)

当前系统中的知识存储模式较为简陋。我们在下一阶段的重大里程碑中，将正式实施真正的 RAG (Retrieval-Augmented Generation) 机制。
考虑到系统必须在金融/政企等**纯内网单机**环境下运行，整体架构必须符合严苛的离线与轻量化约束。

### 核心约束与技术选型：
1. **纯离线 Embedding**：放弃调用任何公网 Embedding API。将在 Python 后端集成极轻量级的开源本地化 Embedding 库（如 `sentence-transformers` 的轻量模型），使其能够同代码一起被打入 `.exe` 单机包中运行。
2. **嵌入式向量数据库**：坚决不引入需要独立 Docker 部署的重型组件（如 Elasticsearch 或独立的 Milvus）。我们将使用完全嵌入式的 `ChromaDB` 或 `FAISS`。
3. **混合数据存储 (Hybrid Storage)**：
   - **自然语言口径**：业务逻辑、口径说明等文本打散并向量化存储于 ChromaDB 中，供 Agent 通过语义余弦相似度进行上下文检索。
   - **精确数据血缘**：由于血缘是严密的 DAG（有向无环图），单纯依靠大语言模型容易出现幻觉。这部分字段级的上下游映射表，将通过结构化的形式存入本地的 SQLite 数据库，由后台提供精准遍历接口。
