import os
import subprocess
import sys
import platform

def main():
    print("正在准备打包成单文件可执行程序...")
    
    # 确保当前在项目根目录
    root_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root_dir)
    
    # 检查前端是否已构建
    if not os.path.exists(os.path.join(root_dir, "frontend", "dist")):
        print("错误：未找到 frontend/dist 目录。请先在 frontend 目录下运行 npm install && npm run build")
        sys.exit(1)
        
    # 安装 pyinstaller
    print("安装 PyInstaller...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])
    
    # 构建打包命令
    separator = ";" if platform.system() == "Windows" else ":"
    
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name", "造数工具",
        "--onefile",
        "--icon", "../OG.ico",
        "--add-data", f"../frontend/dist{separator}frontend/dist",
        "--hidden-import", "uvicorn",
        "--hidden-import", "backend.main",
        "--hidden-import", "main",
        "--collect-all", "chromadb",
        "--collect-all", "sentence_transformers",
        "--paths", ".",
        "../launcher.py"
    ]
    
    print(f"执行命令: {' '.join(cmd)}")
    
    # 切换到 backend 目录执行打包
    backend_dir = os.path.join(root_dir, "backend")
    os.chdir(backend_dir)
    
    subprocess.check_call(cmd)
    
    print("\n" + "="*50)
    print("打包完成！")
    dist_path = os.path.join(backend_dir, "dist")
    print(f"你的独立可执行文件已生成在: {dist_path}")
    print("由于已经内嵌了前端静态资源，你只需要把该可执行文件复制到内网任意一台电脑双击运行即可。")
    print("="*50)

if __name__ == "__main__":
    main()
