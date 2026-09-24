// 预期结果：Runtime Error（整数除以零 / 越界解引用，视平台而定）
#include <cstdio>

int main() {
    int n;
    scanf("%d", &n);
    int* p = nullptr;
    printf("%d\n", 100 / n);
    printf("%d\n", *p);
    return 0;
}
