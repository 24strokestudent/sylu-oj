# 预期结果：Wrong Answer
import sys

data = sys.stdin.read().split()
print("\n".join(str(int(data[i]) * int(data[i + 1])) for i in range(0, len(data) - 1, 2)))
