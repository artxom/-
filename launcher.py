import tkinter as tk
from tkinter import ttk, scrolledtext
import subprocess
import threading
import os
import signal
import sys
import time

# Ensure we're in the right directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class LauncherApp:
    def __init__(self, root):
        self.root = root
        self.root.title("造数工具 - 一键启动器")
        self.root.geometry("900x650")
        self.root.configure(bg="#1e1e1e")
        
        self.processes = []
        self.is_running = False

        # Apply dark theme styles
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
        
        ttk.Label(header_frame, text="造数工具 (Data Generation Tool) 控制台", font=('Helvetica', 18, 'bold')).pack(side=tk.LEFT)

        # Control Buttons
        self.btn_frame = ttk.Frame(self.root, padding=20)
        self.btn_frame.pack(fill=tk.X)
        
        self.btn_dev = ttk.Button(self.btn_frame, text="🚀 启动开发模式 (Dev)", style='Dev.TButton', command=self.start_dev)
        self.btn_dev.pack(side=tk.LEFT, padx=10)
        
        self.btn_prod = ttk.Button(self.btn_frame, text="🔥 启动生产模式 (Prod)", style='Prod.TButton', command=self.start_prod)
        self.btn_prod.pack(side=tk.LEFT, padx=10)
        
        self.btn_stop = ttk.Button(self.btn_frame, text="⏹️ 停止所有服务", style='Stop.TButton', command=self.stop_all, state=tk.DISABLED)
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
        
        # Configure text tags for highlighting
        self.log_area.tag_configure("error", foreground="#ef4444")
        self.log_area.tag_configure("success", foreground="#10b981")
        self.log_area.tag_configure("info", foreground="#3b82f6")

    def log(self, message, level="normal"):
        self.log_area.insert(tk.END, message + "\n", level)
        self.log_area.see(tk.END)

    def read_stream(self, stream, prefix, color):
        try:
            for line in iter(stream.readline, ''):
                if not line: break
                line = line.strip()
                if not line: continue
                
                # Check for error keywords
                level = color
                if "error" in line.lower() or "exception" in line.lower() or "failed" in line.lower():
                    level = "error"
                
                # Schedule GUI update in main thread
                self.root.after(0, self.log, f"[{prefix}] {line}", level)
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
                preexec_fn=os.setsid # To allow killing process group
            )
            self.processes.append(process)
            
            thread = threading.Thread(target=self.read_stream, args=(process.stdout, prefix, color), daemon=True)
            thread.start()
        except Exception as e:
            self.root.after(0, self.log, f"[{prefix}] 无法启动进程: {str(e)}", "error")

    def start_dev(self):
        self._set_running_state(True)
        self.status_var.set("状态: 开发模式运行中...")
        self.log(">>> 正在启动开发模式...", "info")
        
        # Start backend
        backend_python = os.path.abspath("backend/venv/bin/python")
        if not os.path.exists(backend_python):
            backend_python = "python3" # Fallback if no venv
            
        self.run_command([backend_python, "-m", "uvicorn", "main:app", "--reload"], os.path.abspath("backend"), "BACKEND", "success")
        
        # Start frontend
        self.run_command(["npm", "run", "dev"], os.path.abspath("frontend"), "FRONTEND", "info")

    def start_prod(self):
        # Build frontend if needed
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
                self._set_running_state(False)
                return

        self._set_running_state(True)
        self.status_var.set("状态: 生产模式运行中 (已挂载 dist)...")
        self.log(">>> 正在启动生产模式...", "info")
        
        # Start backend
        backend_python = os.path.abspath("backend/venv/bin/python")
        if not os.path.exists(backend_python):
            backend_python = "python3"
            
        self.run_command([backend_python, "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"], os.path.abspath("backend"), "BACKEND", "success")
        self.log(">>> 服务已启动！请在浏览器访问: http://localhost:8000", "success")

    def stop_all(self):
        self.log(">>> 正在停止所有服务...", "error")
        for p in self.processes:
            try:
                os.killpg(os.getpgid(p.pid), signal.SIGTERM)
            except Exception:
                pass
        self.processes.clear()
        self._set_running_state(False)
        self.status_var.set("状态: 准备就绪")
        self.log(">>> 服务已停止。\n", "normal")

    def _set_running_state(self, running):
        self.is_running = running
        if running:
            self.btn_dev.state(['disabled'])
            self.btn_prod.state(['disabled'])
            self.btn_stop.state(['!disabled'])
        else:
            self.btn_dev.state(['!disabled'])
            self.btn_prod.state(['!disabled'])
            self.btn_stop.state(['disabled'])

    def on_closing(self):
        self.stop_all()
        self.root.destroy()

if __name__ == "__main__":
    root = tk.Tk()
    app = LauncherApp(root)
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    
    # Ensure window appears on top when launched
    root.lift()
    root.attributes('-topmost', True)
    root.after_idle(root.attributes, '-topmost', False)
    
    root.mainloop()
