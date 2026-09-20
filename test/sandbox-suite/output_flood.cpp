// 沙箱用例：输出洪泛
// 期望：输出量受限，被判 OLE，不会把磁盘写满
#include <cstdio>

int main() {
    for (;;) {
        for (int i = 0; i < 10000; i++) printf("SYLU-OJ-FLOOD-0123456789-0123456789-0123456789\n");
        fflush(stdout);
    }
    return 0;
}
