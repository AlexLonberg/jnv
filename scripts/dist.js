import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { rwModify, clearDir, copyDir } from 'nodejs-pkg-tools'

const ws = dirname(dirname(fileURLToPath(import.meta.url)))
const distFolder = 'dist'
const dist = join(ws, distFolder)

if (clearDir(dist) === false) {
  throw new Error('Ошибка очистки "dist" каталога.')
}

const { errors } = rwModify({
  mode: 'over_error',
  exclude: [
    'scripts',
    'devDependencies',
    'private'
  ],
  sample: {
    main: './index.js',
    types: './index.d.ts',
    exports: {
      '.': {
        import: './index.js',
        types: './index.d.ts'
      }
    }
  }
}, join(ws, 'package.json'), join(dist, 'package.json'))

if (errors.isFatalError) {
  throw new Error(errors.errors.join('\n\n'))
}

if (copyDir(ws, dist, ['LICENSE.md', 'README.md']) !== true) {
  throw new Error('Ошибка копирования файлов.')
}
