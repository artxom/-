import tkinter as tk
from tkinter import ttk, scrolledtext
import subprocess
import threading
import os
import signal
import sys
import time
import io

is_frozen = getattr(sys, 'frozen', False)

if is_frozen:
    # Need to import these so PyInstaller bundles them. We use local imports below,
    # but having them here guarantees PyInstaller's analyzer sees them.
    pass

class StreamRedirector(io.StringIO):
    def __init__(self, log_func, prefix, color):
        super().__init__()
        self.log_func = log_func
        self.prefix = prefix
        self.color = color

    def write(self, string):
        if not string.strip():
            return
        level = self.color
        lower_s = string.lower()
        if "error" in lower_s or "exception" in lower_s or "failed" in lower_s:
            level = "error"
        self.log_func(f"[{self.prefix}] {string.strip()}", level)

class LauncherApp:
    def __init__(self, root):
        self.root = root
        self.root.title("造数工具 - 一键启动器")
        self.root.geometry("900x650")
        self.root.configure(bg="#1e1e1e")
        
        self.processes = []
        self.is_running = False
        self.uvicorn_server = None
        self.uvicorn_thread = None

        style = ttk.Style()
        style.theme_use('default')
        style.configure('TFrame', background='#1e1e1e')
        style.configure('TLabel', background='#1e1e1e', foreground='white', font=('Helvetica', 12))
        style.configure('Dev.TButton', font=('Helvetica', 12, 'bold'), padding=10, background='#3b82f6', foreground='white')
        style.map('Dev.TButton', background=[('active', '#2563eb')])
        style.configure('Prod.TButton', font=('Helvetica', 12, 'bold'), padding=10, background='#10b981', foreground='white')
        style.map('Prod.TButton', background=[('active', '#059669')])
        style.configure('Stop.TButton', font=('Helvetica', 12, 'bold'), padding=10, background='#ef4444', foreground='white')
        style.map('Stop.TButton', background=[('active', '#dc2626')])

        # Header
        header_frame = ttk.Frame(self.root, padding=20)
        header_frame.pack(fill=tk.X)
        
        ttk.Label(header_frame, text="造数工具 控制台", font=('Helvetica', 18, 'bold')).pack(side=tk.LEFT)

        # Port Selection
        port_frame = ttk.Frame(header_frame)
        port_frame.pack(side=tk.RIGHT)
        ttk.Label(port_frame, text="端口:").pack(side=tk.LEFT, padx=5)
        self.port_var = tk.StringVar(value="8000")
        self.port_entry = ttk.Entry(port_frame, textvariable=self.port_var, width=6, font=('Helvetica', 12))
        self.port_entry.pack(side=tk.LEFT)

        # Control Buttons
        self.btn_frame = ttk.Frame(self.root, padding=20)
        self.btn_frame.pack(fill=tk.X)
        
        if not is_frozen:
            self.btn_dev = ttk.Button(self.btn_frame, text="🚀 启动开发模式 (Dev)", style='Dev.TButton', command=self.start_dev)
            self.btn_dev.pack(side=tk.LEFT, padx=10)
        
        self.btn_prod = ttk.Button(self.btn_frame, text="🔥 启动服务 (Prod)", style='Prod.TButton', command=self.start_prod)
        self.btn_prod.pack(side=tk.LEFT, padx=10)
        
        self.btn_stop = ttk.Button(self.btn_frame, text="⏹️ 停止服务", style='Stop.TButton', command=self.stop_all, state=tk.DISABLED)
        self.btn_stop.pack(side=tk.RIGHT, padx=10)

        # Status Label
        self.status_var = tk.StringVar()
        self.status_var.set("状态: 准备就绪")
        ttk.Label(self.root, textvariable=self.status_var, padding=(20, 0)).pack(anchor=tk.W)

        # Log Console
        log_frame = ttk.Frame(self.root, padding=20)
        log_frame.pack(fill=tk.BOTH, expand=True)
        
        self.log_area = scrolledtext.ScrolledText(log_frame, bg="#0d0d0d", fg="#d4d4d4", font=("Consolas", 12), wrap=tk.WORD)
        self.log_area.pack(fill=tk.BOTH, expand=True)
        
        self.log_area.tag_configure("error", foreground="#ef4444")
        self.log_area.tag_configure("success", foreground="#10b981")
        self.log_area.tag_configure("info", foreground="#3b82f6")

    def log(self, message, level="normal"):
        self.log_area.insert(tk.END, message + "\n", level)
        self.log_area.see(tk.END)

    def safe_log(self, message, level="normal"):
        self.root.after(0, self.log, message, level)

    def read_stream(self, stream, prefix, color):
        try:
            for line in iter(stream.readline, ''):
                if not line: break
                line = line.strip()
                if not line: continue
                level = color
                if "error" in line.lower() or "exception" in line.lower() or "failed" in line.lower():
                    level = "error"
                self.safe_log(f"[{prefix}] {line}", level)
        except Exception:
            pass

    def run_command(self, cmd, cwd, prefix, color):
        try:
            process = subprocess.Popen(
                cmd,
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                preexec_fn=os.setsid if os.name != 'nt' else None
            )
            self.processes.append(process)
            
            thread = threading.Thread(target=self.read_stream, args=(process.stdout, prefix, color), daemon=True)
            thread.start()
        except Exception as e:
            self.safe_log(f"[{prefix}] 无法启动进程: {str(e)}", "error")

    def start_dev(self):
        self._set_running_state(True)
        self.status_var.set("状态: 开发模式运行中...")
        self.log(">>> 正在启动开发模式...", "info")
        
        backend_python = os.path.abspath("backend/venv/bin/python")
        if not os.path.exists(backend_python):
            backend_python = "python3"
            
        port = self.port_var.get()
        self.run_command([backend_python, "-m", "uvicorn", "main:app", "--reload", "--port", port], os.path.abspath("backend"), "BACKEND", "success")
        self.run_command(["npm", "run", "dev"], os.path.abspath("frontend"), "FRONTEND", "info")

    def run_uvicorn_programmatically(self, port):
        try:
            import uvicorn
            from uvicorn.config import Config
            from uvicorn.server import Server
            
            # Since we are frozen, the main module from backend is accessible at the top level
            import main

            # Redirect stdout/stderr to GUI
            sys.stdout = StreamRedirector(self.safe_log, "BACKEND", "success")
            sys.stderr = StreamRedirector(self.safe_log, "BACKEND", "error")

            config = Config(app=main.app, host="0.0.0.0", port=int(port), log_level="info")
            self.uvicorn_server = Server(config=config)
            
            self.safe_log(f">>> FastAPI 服务启动在端口 {port}...", "success")
            self.uvicorn_server.run()
            self.safe_log(">>> FastAPI 服务已完全关闭。", "info")
        except Exception as e:
            self.safe_log(f">>> 启动服务异常: {str(e)}", "error")
            self._set_running_state(False)

    def start_prod(self):
        port = self.port_var.get()
        
        if not is_frozen:
            frontend_dist = os.path.abspath("frontend/dist")
            if not os.path.exists(frontend_dist):
                self.log(">>> 未检测到前端 dist 目录，正在为您自动构建...", "info")
                self.root.update()
                try:
                    subprocess.run(["npm", "install"], cwd=os.path.abspath("frontend"), check=True, stdout=subprocess.DEVNULL)
                    subprocess.run(["npm", "run", "build"], cwd=os.path.abspath("frontend"), check=True, stdout=subprocess.DEVNULL)
                    self.log(">>> 前端构建成功！", "success")
                except Exception as e:
                    self.log(f">>> 前端构建失败: {str(e)}", "error")
                    return

        self._set_running_state(True)
        self.status_var.set(f"状态: 运行中 (端口: {port})")
        self.log(f">>> 正在启动服务 (端口 {port})...", "info")
        
        if is_frozen:
            self.uvicorn_thread = threading.Thread(target=self.run_uvicorn_programmatically, args=(port,), daemon=True)
            self.uvicorn_thread.start()
        else:
            backend_python = os.path.abspath("backend/venv/bin/python")
            if not os.path.exists(backend_python):
                backend_python = sys.executable
            self.run_command([backend_python, "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", port], os.path.abspath("backend"), "BACKEND", "success")
            
        self.log(f">>> 请在浏览器访问: http://localhost:{port}", "success")

    def stop_all(self):
        self.log(">>> 正在停止所有服务...", "error")
        for p in self.processes:
            try:
                if os.name != 'nt':
                    os.killpg(os.getpgid(p.pid), signal.SIGTERM)
                else:
                    p.terminate()
            except Exception:
                pass
        self.processes.clear()

        if self.uvicorn_server:
            self.log(">>> 正在向内置 Uvicorn 发送终止信号...", "info")
            self.uvicorn_server.should_exit = True
            # Let it terminate naturally
            self.uvicorn_server = None
            
        self._set_running_state(False)
        self.status_var.set("状态: 准备就绪")
        self.log(">>> 停止指令已发出。\n", "normal")

    def _set_running_state(self, running):
        self.is_running = running
        self.port_entry.state(['disabled'] if running else ['!disabled'])
        
        if not is_frozen:
            if running:
                self.btn_dev.state(['disabled'])
            else:
                self.btn_dev.state(['!disabled'])

        if running:
            self.btn_prod.state(['disabled'])
            self.btn_stop.state(['!disabled'])
        else:
            self.btn_prod.state(['!disabled'])
            self.btn_stop.state(['disabled'])

    def on_closing(self):
        self.stop_all()
        # Give thread a bit of time to gracefully close ports
        if self.uvicorn_thread and self.uvicorn_thread.is_alive():
            self.uvicorn_thread.join(timeout=1.0)
        self.root.destroy()
        sys.exit(0)

if __name__ == "__main__":
    if is_frozen:
        # Essential paths for bundled execution
        sys.path.insert(0, sys._MEIPASS)

    root = tk.Tk()
    app = LauncherApp(root)
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    
    root.lift()
    root.attributes('-topmost', True)
    root.after_idle(root.attributes, '-topmost', False)
    
    root.mainloop()
