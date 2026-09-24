// 预期结果：Memory Limit Exceeded（触碰超过题目限制的静态内存，避免 malloc 失败被误判为 RE）
#include <cstddef>

static volatile unsigned char memory[512ULL * 1024 * 1024];

int main() {
    for (std::size_t i = 0; i < sizeof(memory); i += 4096) memory[i] = static_cast<unsigned char>(i);
    return 0;
}
