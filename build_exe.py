import os
import subprocess
import sys
import platform
import datetime
import re

def main():
    print("正在准备打包成单文件可执行程序...")
    
    # 确保当前在项目根目录
    root_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root_dir)
    
    import shutil
    
    frontend_dir = os.path.join(root_dir, "frontend")
    dist_dir = os.path.join(frontend_dir, "dist")
    
    # 动态生成版本号
    now = datetime.datetime.now()
    version_str = f"v{now.strftime('%y.%m.%d.%H')}"
    print(f"当前打包版本号: {version_str}")
    
    # 修改前端页面标题
    index_path = os.path.join(frontend_dir, "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        html_content = f.read()
    html_content = re.sub(r'<title>Data\.OG 造数工具 v[\d\.]+</title>', f'<title>Data.OG 造数工具 {version_str}</title>', html_content)
    with open(index_path, "w", encoding="utf-8") as f:
        f.write(html_content)
    
    # 1. 彻底清理前端旧缓存
    print("正在清理前端构建缓存...")
    if os.path.exists(dist_dir):
        shutil.rmtree(dist_dir)
        
    # 2. 强制重新编译前端
    print("正在全新编译前端代码 (npm install && npm run build)... 这可能需要一点时间。")
    try:
        subprocess.check_call("npm install && npm run build", shell=True, cwd=frontend_dir)
    except subprocess.CalledProcessError:
        print("错误：前端构建失败，请检查 npm 环境或代码。")
        sys.exit(1)
        
    # 安装 pyinstaller
    print("安装/更新 PyInstaller...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller", "--upgrade"])
    
    # 清理 PyInstaller 缓存
    backend_dir = os.path.join(root_dir, "backend")
    build_dir = os.path.join(backend_dir, "build")
    if os.path.exists(build_dir):
        shutil.rmtree(build_dir)
    
    # 构建打包命令
    separator = ";" if platform.system() == "Windows" else ":"
    
    exe_name = f"DataOG_{version_str}"
    
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name", exe_name,
        "--onefile",
        "--noconsole",
        "--clean",
        "--icon", "../OG.ico",
        "--add-data", f"../frontend/dist{separator}frontend/dist",
        "--add-data", f"../OG.ico{separator}.",
        "--hidden-import", "uvicorn",
        "--hidden-import", "backend.main",
        "--hidden-import", "main",
        "--collect-all", "chromadb",
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
