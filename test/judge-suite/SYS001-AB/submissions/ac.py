# 预期结果：Accepted（验证 Python 3 评测链路）
import sys

data = sys.stdin.read().split()
print("\n".join(str(int(data[i]) + int(data[i + 1])) for i in range(0, len(data) - 1, 2)))
