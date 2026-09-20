// 预期结果：Wrong Answer（输出 a - b）
#include <cstdio>

int main() {
    long long a, b;
    while (scanf("%lld %lld", &a, &b) == 2) printf("%lld\n", a - b);
    return 0;
}
