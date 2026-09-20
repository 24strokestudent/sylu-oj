# 沙箱用例：网络访问
# 期望：程序无法随意访问网络 —— 不应成功连上外网、不应读到响应
import socket
import sys

targets = [
    ("8.8.8.8", 53),
    ("1.1.1.1", 80),
    ("127.0.0.1", 27017),   # 本机 MongoDB，绝不能连上
    ("127.0.0.1", 8888),    # Hydro 自身
]

for host, port in targets:
    s = socket.socket()
    s.settimeout(3)
    try:
        s.connect((host, port))
        print(f"CONNECTED {host}:{port}  <-- 沙箱未隔离网络，必须修复")
    except Exception as e:
        print(f"blocked  {host}:{port} ({type(e).__name__})")
    finally:
        s.close()

sys.exit(0)
