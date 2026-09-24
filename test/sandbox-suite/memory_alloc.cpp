// 沙箱用例：大量内存占用
// 期望：被判 MLE，评测机内存不被拖垮
#include <cstdio>
#include <cstdlib>
#include <cstring>

int main() {
    const size_t chunk = 16 * 1024 * 1024;
    for (int i = 0; i < 256; i++) {
        char* p = (char*)malloc(chunk);
        if (!p) { printf("malloc failed at %d\n", i); return 0; }
        memset(p, 0x5a, chunk);
    }
    printf("allocated 4GB\n");
    return 0;
}
