// 标准程序（§20）：必须 100% Accepted，否则禁止发布该题
#include <cstdio>

int main() {
    long long a, b;
    while (scanf("%lld %lld", &a, &b) == 2) {
        printf("%lld\n", a + b);
    }
    return 0;
}
