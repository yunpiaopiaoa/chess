import subprocess
import sys
import os

def run():
    # 确保在项目根目录运行
    root_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root_dir)
    
    print("Starting Chess Server on http://localhost:8000 ...")
    try:
        # 使用 uv run 启动 uvicorn
        # 如果 8000 被占用，可以尝试其他端口
        subprocess.run(["uv", "run", "uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000", "--reload"])
    except KeyboardInterrupt:
        print("\nServer stopped.")
    except Exception as e:
        print(f"Error starting server: {e}")

if __name__ == "__main__":
    run()
