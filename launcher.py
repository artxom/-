import tkinter as tk
from tkinter import scrolledtext
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

def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, relative_path)

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

class HoverButton(tk.Button):
    def __init__(self, master, **kw):
        self.default_bg = kw.get('bg', kw.get('background', '#2c2c2e'))
        self.hover_bg = kw.pop('hover_bg', '#3a3a3c')
        self.disabled_bg = "#444444"
        kw['relief'] = 'flat'
        kw['bd'] = 0
        kw['cursor'] = 'hand2'
        kw['activebackground'] = self.hover_bg
        kw['activeforeground'] = kw.get('fg', 'white')
        super().__init__(master, **kw)
        self.bind("<Enter>", self.on_enter)
        self.bind("<Leave>", self.on_leave)

    def on_enter(self, e):
        if self['state'] != tk.DISABLED:
            self['bg'] = self.hover_bg

    def on_leave(self, e):
        if self['state'] != tk.DISABLED:
            self['bg'] = self.default_bg
            
    def set_state(self, state):
        if state == tk.NORMAL:
            self.config(state=tk.NORMAL, bg=self.default_bg)
        else:
            self.config(state=tk.DISABLED, bg=self.disabled_bg)

class LauncherApp:
    def __init__(self, root):
        self.root = root
        self.root.title("DataOG - 智能控制台")
        self.root.geometry("960x720")
        
        # Color Palette - Modern Dark Theme
        self.colors = {
            "bg": "#121212",           # Main background
            "panel": "#1e1e1e",        # Panel background
            "border": "#333333",       # Subtle borders
            "text": "#ffffff",         # Primary text
            "text_muted": "#a0a0a0",   # Secondary text
            "accent": "#6366f1",       # Indigo primary
            "accent_hover": "#4f46e5", 
            "success": "#10b981",      # Emerald success
            "success_hover": "#059669",
            "danger": "#ef4444",       # Red danger
            "danger_hover": "#dc2626",
            "input_bg": "#2d2d2d",
            "log_bg": "#0a0a0a",
            "log_text": "#d4d4d4"
        }
        
        self.root.configure(bg=self.colors["bg"])
        
        # Load custom icon
        try:
            icon_path = resource_path("OG.ico")
            if os.path.exists(icon_path):
                if sys.platform == 'win32':
                    self.root.iconbitmap(icon_path)
                else:
                    img = tk.PhotoImage(file=icon_path)
                    self.root.iconphoto(True, img)
        except Exception:
            pass
            
        self.processes = []
        self.is_running = False
        self.uvicorn_server = None
        self.uvicorn_thread = None

        self._build_ui()

    def _build_ui(self):
        # Top Header Area
        header_frame = tk.Frame(self.root, bg=self.colors["panel"], height=85)
        header_frame.pack(fill=tk.X, side=tk.TOP)
        header_frame.pack_propagate(False)
        
        title_lbl = tk.Label(header_frame, text="DataOG 智能造数平台", font=('Microsoft YaHei', 18, 'bold'), 
                             bg=self.colors["panel"], fg=self.colors["text"])
        title_lbl.pack(side=tk.LEFT, padx=30, pady=25)
        
        # Status Badge
        self.status_var = tk.StringVar(value="● 准备就绪")
        self.status_lbl = tk.Label(header_frame, textvariable=self.status_var, font=('Microsoft YaHei', 12, 'bold'),
                                   bg=self.colors["panel"], fg=self.colors["text_muted"])
        self.status_lbl.pack(side=tk.LEFT, padx=10, pady=28)

        # Port Configuration
        port_frame = tk.Frame(header_frame, bg=self.colors["panel"])
        port_frame.pack(side=tk.RIGHT, padx=30, pady=25)
        
        tk.Label(port_frame, text="运行端口:", font=('Microsoft YaHei', 11), 
                 bg=self.colors["panel"], fg=self.colors["text_muted"]).pack(side=tk.LEFT, padx=(0, 10))
                 
        self.port_var = tk.StringVar(value="8000")
        self.port_entry = tk.Entry(port_frame, textvariable=self.port_var, width=8, font=('Consolas', 13),
                                   bg=self.colors["input_bg"], fg=self.colors["text"], bd=0, 
                                   insertbackground=self.colors["text"], justify="center")
        self.port_entry.pack(side=tk.LEFT, ipady=5)

        # Control Panel (Buttons)
        control_frame = tk.Frame(self.root, bg=self.colors["bg"])
        control_frame.pack(fill=tk.X, padx=30, pady=(25, 15))
        
        btn_font = ('Microsoft YaHei', 11, 'bold')
        
        if not is_frozen:
            self.btn_dev = HoverButton(control_frame, text="👨‍💻 开发模式 (Dev)", font=btn_font,
                                      bg=self.colors["accent"], fg="white", hover_bg=self.colors["accent_hover"],
                                      command=self.start_dev, padx=20, pady=10)
            self.btn_dev.pack(side=tk.LEFT, padx=(0, 15))
            
        self.btn_prod = HoverButton(control_frame, text="🚀 启动服务 (Prod)", font=btn_font,
                                   bg=self.colors["success"], fg="white", hover_bg=self.colors["success_hover"],
                                   command=self.start_prod, padx=25, pady=10)
        self.btn_prod.pack(side=tk.LEFT)
        
        self.btn_stop = HoverButton(control_frame, text="⏹️ 停止服务", font=btn_font,
                                   bg=self.colors["danger"], fg="white", hover_bg=self.colors["danger_hover"],
                                   command=self.stop_all, padx=25, pady=10)
        self.btn_stop.pack(side=tk.RIGHT)
        self.btn_stop.set_state(tk.DISABLED)

        # Log Output Area
        log_container = tk.Frame(self.root, bg=self.colors["border"])
        log_container.pack(fill=tk.BOTH, expand=True, padx=30, pady=(0, 30))
        
        # Inner frame for 1px border simulation
        log_inner = tk.Frame(log_container, bg=self.colors["log_bg"])
        log_inner.pack(fill=tk.BOTH, expand=True, padx=1, pady=1)
        
        self.log_area = scrolledtext.ScrolledText(log_inner, bg=self.colors["log_bg"], fg=self.colors["log_text"], 
                                                  font=("Consolas", 11), wrap=tk.WORD, bd=0, padx=15, pady=15, 
                                                  insertbackground=self.colors["log_text"])
        self.log_area.pack(fill=tk.BOTH, expand=True)
        
        # Tags for colored logs
        self.log_area.tag_configure("error", foreground="#ff6b6b")
        self.log_area.tag_configure("success", foreground="#51cf66")
        self.log_area.tag_configure("info", foreground="#339af0")
        self.log_area.tag_configure("system", foreground="#fcc419")

        self.log("=== DataOG 智能控制台初始化完成 ===", "system")
        self.log(">>> 等待启动指令...\n", "system")

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
        self.log(">>> 停止指令已发出。\n", "system")

    def _set_running_state(self, running):
        self.is_running = running
        self.port_entry.config(state=tk.DISABLED if running else tk.NORMAL)
        
        if not is_frozen:
            self.btn_dev.set_state(tk.DISABLED if running else tk.NORMAL)

        if running:
            self.btn_prod.set_state(tk.DISABLED)
            self.btn_stop.set_state(tk.NORMAL)
            
            port = self.port_var.get()
            self.status_var.set(f"● 运行中 (端口: {port})")
            self.status_lbl.config(fg=self.colors["success"])
        else:
            self.btn_prod.set_state(tk.NORMAL)
            self.btn_stop.set_state(tk.DISABLED)
            
            self.status_var.set("● 准备就绪")
            self.status_lbl.config(fg=self.colors["text_muted"])

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
    
    # Hide default tk root to avoid flickering before styling
    root.withdraw()
    app = LauncherApp(root)
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    
    # Show main window
    root.deiconify()
    root.lift()
    root.attributes('-topmost', True)
    root.after_idle(root.attributes, '-topmost', False)
    
    root.mainloop()
