/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
// Здесь можно найти описание некоторых типов настроек playwright
// import { } from '@vitest/browser/providers/playwright'

// Конфигурация для тестирования в Chromium
export default defineConfig({
  test: {
    include: [
      'src/**/*.test.ts'
    ],
    browser: {
      enabled: true,
      provider: 'playwright',
      // viewport: { height: 100, width: 100 },
      // headless: true
      instances: [{ browser: 'chromium' }]
    },
    coverage: {
      enabled: true,
      include: ['src/**/*.ts'],
      provider: 'istanbul',
      reportsDirectory: '.temp/coverage'
    },
    // Config https://vitest.dev/config/#benchmark
    benchmark: {
      include: [
        'src/**/*.bench.ts',
      ]
    }
  }
})

// // Конфигурация для тестирования в NodeJS
// export default defineConfig({
//   test: {
//     include: [
//       'src/**/*.test.ts'
//     ],
//     // https://vitest.dev/guide/coverage.html
//     coverage: {
//       enabled: true,
//       // Без этой опции использует корень проекта.
//       include: ['src/**/*.ts'],
//       provider: 'v8',
//       reportsDirectory: '.temp/coverage'
//     },
//   }
// })
