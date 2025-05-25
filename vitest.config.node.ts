/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
// Здесь можно найти описание некоторых типов настроек playwright
// import { } from '@vitest/browser/providers/playwright'

// Конфигурация для тестирования в NodeJS
export default defineConfig({
  test: {
    include: [
      'src/**/*.test.ts'
    ],
    environment: 'node',
    testTimeout: 0,
    fileParallelism: false,

    // https://vitest.dev/guide/coverage.html
    // coverage: {
    //   enabled: true,
    //   // Без этой опции использует корень проекта.
    //   include: ['src/**/*.ts'],
    //   provider: 'v8',
    //   reportsDirectory: '.temp/coverage'
    // },
  }
})
