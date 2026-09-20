// 预期结果：Memory Limit Exceeded（持续申请并写入，避免被优化掉）
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
