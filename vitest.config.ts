import { defineConfig } from 'vitest/config'

// FSRS 单元测试：直接 import TS 源码（src/lib/fsrs.ts 无内部路径依赖，无需 alias）
export default defineConfig({
  test: {
    include: ['tests/fsrs/**/*.test.ts'],
    environment: 'node',
  },
})
