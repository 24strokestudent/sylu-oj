// 预期结果：Compile Error（故意缺失分号与右括号）
#include <cstdio>

int main() {
    long long a, b
    scanf("%lld %lld", &a, &b)
    printf("%lld\n", a + b);
    return 0;
