# 预期结果：Runtime Error（未捕获异常）
import sys

data = sys.stdin.read().split()
print(int(data[0]) + int(data[1]) + int(data[99]))
