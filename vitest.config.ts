/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import type { BrowserProviderOptions } from 'vitest/node'
// Здесь можно найти описание некоторых типов настроек playwright
// import { } from '@vitest/browser/providers/playwright'

const providerOptions: BrowserProviderOptions = {
  launch: {
    // devtools: true,
    args: [
      '--remote-debugging-port=9222'
    ]
  }
}

// Конфигурация для тестирования в Chromium
export default defineConfig({
  test: {
    include: [
      'src/**/*.test.ts'
    ],
    browser: {
      enabled: true,
      name: 'chromium',
      provider: 'playwright',
      // viewport: { height: 100, width: 100 },
      // headless: true,
      providerOptions
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
        'examples/**/*.bench.ts',
      ]
    }
  }
})

// // Конфигурация для тестирования в NodeJS
// export default defineConfig({
//   test: {
//     // https://vitest.dev/config/#setupfiles
//     setupFiles: ['vitest_test_extends/index.ts'],
//     include: [
//       'src/**/*.test.ts',
//       'vitest_test_extends/**/*.test.ts'
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
