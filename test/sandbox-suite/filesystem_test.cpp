// 沙箱用例：宿主敏感文件读取
// 期望：全部读不到。任何一项读到内容，Judge 都不允许上线（计划 §16 §64）
#include <cstdio>

int main() {
    const char* paths[] = {
        "/etc/passwd",
        "/etc/shadow",
        "/root/.ssh/id_rsa",
        "/root/.ssh/authorized_keys",
        "/root/.hydro/config.json",
        "/data/file",
        "/proc/1/environ",
        "/proc/self/environ",
    };
    for (const char* p : paths) {
        FILE* f = fopen(p, "rb");
        if (!f) { printf("blocked  %s\n", p); continue; }
        char buf[128] = {0};
        size_t n = fread(buf, 1, sizeof(buf) - 1, f);
        fclose(f);
        if (n > 0) printf("READ     %s  <-- 泄漏 %zu 字节，必须修复\n", p, n);
        else printf("empty    %s\n", p);
    }
    return 0;
}
