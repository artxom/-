import os
import subprocess
import sys
import platform
import datetime
import re

def main():
    print("==================================================")
    print(" 打包优化选项")
    print("==================================================")
    print("1. [极速打包] 单目录模式 + 仅增量构建前端 (推荐，速度最快)")
    print("2. [单文件模式] 单一可执行文件 + 仅增量构建前端 (较慢)")
    print("3. [完全构建] 重新拉取所有依赖 + 单文件生成 (最慢)")
    choice = input("请输入选项 [1/2/3] (默认 1): ").strip()
    if not choice: choice = '1'
    
    is_onedir = (choice == '1')
    skip_npm_install = choice in ('1', '2')
    skip_pyinstaller_upgrade = choice in ('1', '2')

    print("\n正在准备打包程序...")
    
    # 确保当前在项目根目录
    root_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root_dir)
    
    import shutil
    
    frontend_dir = os.path.join(root_dir, "frontend")
    dist_dir = os.path.join(frontend_dir, "dist")
    
    # 动态生成版本号 (不补零)
    now = datetime.datetime.now()
    version_str = f"v{now.strftime('%y')}.{now.month}.{now.day}.{now.hour}"
    print(f"当前打包版本号: {version_str}")
    
    # 1. 彻底清理前端旧缓存 (如果完全构建的话)
    if not skip_npm_install:
        print("正在清理前端构建缓存...")
        if os.path.exists(dist_dir):
            shutil.rmtree(dist_dir)
        
    # 2. 编译前端
    if skip_npm_install:
        print("正在增量编译前端代码 (npm run build)...")
        try:
            subprocess.check_call("npm run build", shell=True, cwd=frontend_dir)
        except subprocess.CalledProcessError:
            print("错误：前端构建失败，请检查代码。")
            sys.exit(1)
    else:
        print("正在全新编译前端代码 (npm install && npm run build)... 这可能需要一点时间。")
        try:
            subprocess.check_call("npm install && npm run build", shell=True, cwd=frontend_dir)
        except subprocess.CalledProcessError:
            print("错误：前端构建失败，请检查 npm 环境或代码。")
            sys.exit(1)
        
    backend_dir = os.path.join(root_dir, "backend")
    
    # 安装 pyinstaller 和后端依赖
    if skip_pyinstaller_upgrade:
        print("跳过 PyInstaller 依赖更新...")
    else:
        print("安装/更新 PyInstaller 及后端依赖...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller", "--upgrade"])
        req_path = os.path.join(backend_dir, "requirements.txt")
        if os.path.exists(req_path):
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"], cwd=backend_dir)
    
    # 离线环境支持：由于模型已经直接内置于 Git 仓库中 (models/all-MiniLM-L6-v2)，
    # 此处不需要再从 S3 下载，只需要确保它被打包进 exe 即可。
    model_dir = os.path.join(backend_dir, "models", "all-MiniLM-L6-v2")
    if not os.path.exists(model_dir):
        print(f"[警告] 离线模型文件夹不存在: {model_dir}，可能是拉取代码时缺失。")

    
    # 清理 PyInstaller 缓存
    build_dir = os.path.join(backend_dir, "build")
    if os.path.exists(build_dir):
        shutil.rmtree(build_dir)
    
    # 构建打包命令
    separator = ";" if platform.system() == "Windows" else ":"
    
    # [釜底抽薪] 读取 requirements.txt，自动为所有核心依赖加上 --copy-metadata 和 --hidden-import
    # 彻底杜绝类似 python-multipart 这种因为框架底层采用反射或动态检测 metadata 导致的“漏包”玄学问题
    req_path = os.path.join(backend_dir, "requirements.txt")
    auto_deps_args = []
    if os.path.exists(req_path):
        import importlib.metadata
        with open(req_path, "r", encoding="utf-8") as f:
            for line in f:
                pkg = line.strip().split("==")[0].strip()
                # 过滤掉注释、空行
                if pkg and not pkg.startswith("#"):
                    # 安全检查：只有当系统中真的存在该包的 metadata 时，才加入 --copy-metadata，防止 PyInstaller 报错崩溃
                    # 有些包名带中划线，系统里可能是下划线
                    pkg_names_to_try = [pkg, pkg.replace('-', '_')]
                    metadata_found = False
                    for p in pkg_names_to_try:
                        try:
                            importlib.metadata.distribution(p)
                            auto_deps_args.extend(["--copy-metadata", p])
                            metadata_found = True
                            break
                        except Exception:
                            pass
                    
                    if not metadata_found:
                        print(f"[警告] 无法找到包 {pkg} 的元数据，跳过 --copy-metadata")
                        
                    # 对于一些知名的 pip 包名和 import 模块名不一致的，PyInstaller 往往无法自动追踪
                    auto_deps_args.extend(["--hidden-import", pkg])
                    if '-' in pkg:
                        auto_deps_args.extend(["--hidden-import", pkg.replace('-', '_')])
    
    exe_name = f"DataOG_{version_str}"
    
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name", exe_name,
        "--onedir" if is_onedir else "--onefile",
        "--noconsole",
        "--clean",
        "--icon", "../OG.ico",
        "--add-data", f"../frontend/dist{separator}frontend/dist",
        "--add-data", f"../OG.ico{separator}.",
        "--add-data", f"models{separator}models",
        "--hidden-import", "uvicorn",
        "--hidden-import", "backend.main",
        "--hidden-import", "main",
        "--hidden-import", "multipart",
        "--hidden-import", "python_multipart",
        "--collect-all", "chromadb",
        "--paths", ".",
        "../launcher.py"
    ] + auto_deps_args
    
    print(f"执行命令: {' '.join(cmd)}")
    
    # 切换到 backend 目录执行打包
    backend_dir = os.path.join(root_dir, "backend")
    os.chdir(backend_dir)
    
    subprocess.check_call(cmd)
    
    print("\n" + "="*50)
    print("打包完成！")
    dist_path = os.path.join(backend_dir, "dist")
    
    if is_onedir:
        out_dir = os.path.join(dist_path, exe_name)
        print(f"你的独立可执行文件目录已生成在: {out_dir}")
        print(f"启动方式: 双击目录内的 {exe_name} 即可运行")
        print("注意: 拷贝给别人时，需要打包并发送整个目录 (不能仅发送 exe 文件)！")
    else:
        print(f"你的独立可执行文件已生成在: {dist_path}")
        print("只需把该可执行文件复制到内网任意一台电脑双击运行即可。")
    
    print("="*50)

if __name__ == "__main__":
    main()
