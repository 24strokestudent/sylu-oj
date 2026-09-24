# 标准程序（Python 版）：用于交叉验证 Python 评测链路
import sys


def main():
    data = sys.stdin.read().split()
    out = []
    for i in range(0, len(data) - 1, 2):
        out.append(str(int(data[i]) + int(data[i + 1])))
    sys.stdout.write("\n".join(out) + "\n")


main()
