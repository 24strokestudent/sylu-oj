// 预期结果：Time Limit Exceeded（非阻塞式死循环，不能被当成 RE 蒙混过去）
int main() {
    volatile long long x = 0;
    for (long long i = 0; i < 100000000000LL; i++) x += i;
    return (int)(x & 1);
}
