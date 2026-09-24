// 沙箱用例：死循环
// 期望：被判 TLE，且不会拖死评测机（沙箱必须能强杀）
int main() {
    volatile long long x = 0;
    for (;;) x++;
    return 0;
}
