// 当前内嵌 Sandbox 会把超限 malloc 失败报告为 Runtime Error，不能把它宣称为 MLE。
#include <cstdio>
#include <cstdlib>
#include <cstring>

int main() {
    const size_t chunk = 32 * 1024 * 1024;
    for (int i = 0; i < 64; i++) {
        char* p = (char*)malloc(chunk);
        if (!p) return 1;
        memset(p, i & 0xff, chunk);
        printf("%d\n", i);
        fflush(stdout);
    }
    return 0;
}
