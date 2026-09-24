// 沙箱用例：大量子进程
// 期望：沙箱对进程数/线程数设限，不能把宿主机拖垮
// 说明：这里上限写死 200，避免在没有沙箱保护的环境上真的把机器打挂。
#include <cstdio>
#include <unistd.h>
#include <sys/wait.h>

int main() {
    for (int i = 0; i < 200; i++) {
        pid_t p = fork();
        if (p == 0) { 
            for (volatile long long x = 0; x < 100000000LL; x++);
            _exit(0);
        }
        if (p < 0) { printf("fork failed at %d\n", i); break; }
    }
    while (wait(nullptr) > 0);
    printf("done\n");
    return 0;
}
