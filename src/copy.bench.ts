import { bench } from 'vitest'
import { plainCopy } from './utils.js'
import { Factory } from './models.js'

// NOTE: Этот тест производительности направлен на выявление разницы в скорости создания нового объекта/массива или
//       перезаписи элементов исходного.
//       Как видно: Создание занимает значительное время, а результат ничем не отличается от режима createMode:'obj'

const vAll = new Factory({ createMode: 'all' }) // default
const vObj = new Factory({ createMode: 'obj' })
const vArr = new Factory({ createMode: 'arr' })
const vNone = new Factory({ createMode: 'none' })

const arrModel1 = vAll.arr([vAll.obj({ foo: 0 })]).removeFaulty()
const arrModel2 = vObj.arr([vObj.obj({ foo: 0 })]).removeFaulty()
const arrModel3 = vArr.arr([vArr.obj({ foo: 0 })]).removeFaulty()
const arrModel4 = vNone.arr([vNone.obj({ foo: 0 })]).removeFaulty()
const objModel1 = vAll.obj({
  foo: arrModel1,
  bar: arrModel1
})
const objModel2 = vObj.obj({
  foo: arrModel2,
  bar: arrModel2
})
const objModel3 = vArr.obj({
  foo: arrModel3,
  bar: arrModel3
})
const objModel4 = vNone.obj({
  foo: arrModel4,
  bar: arrModel4
})

const rndArray = (length: number) => {
  const arr: { foo: number | string }[] = []
  for (let i = 0; i < length; ++i) {
    arr.push(((i + 1) % 10 === 0) ? { foo: 'error' } : { foo: 123 })
  }
  return arr
}

const data1 = {
  foo: rndArray(300),
  bar: rndArray(300),
  box: rndArray(300),
}
const data2 = plainCopy(data1)
const data3 = plainCopy(data1)
const data4 = plainCopy(data1)

bench('all', () => {
  objModel1.validate(data1) // полностью пересоздает объекты/массивы (по умолчанию)
})
bench('obj', () => {
  objModel2.validate(data2) // оптимально, гарантирует свойства определенные в модели, так как объекты создаются, а
  //                           массивы фильтруются(removeFaulty()), и не сильно проседает в скорости сравнительно с none
})
bench('arr', () => {
  objModel3.validate(data3) // абсолютно бесполезная настройка - создает массивы, но не трогает объекты у которых могут
  //                           оказаться лишние свойства
})
bench('none', () => {
  objModel4.validate(data4) // хороший вариант, когда не нужно проверять все свойства, а оставить объект как есть с
  //                           частичной валидацией
})

// ✓  chromium  src/copy.bench.ts 2458ms
// name         hz     min     max    mean     p75     p99    p995    p999     rme  samples
// · all    4,184.33  0.1000  0.7000  0.2390  0.3000  0.5000  0.6000  0.6000  ±1.37%     2093   slowest
// · obj   16,872.63  0.0000  0.6000  0.0593  0.1000  0.2000  0.2000  0.3000  ±2.22%     8438
// · arr   20,933.81  0.0000  0.7000  0.0478  0.1000  0.2000  0.2000  0.3000  ±2.34%    10469
// · none  22,068.00  0.0000  0.4000  0.0453  0.1000  0.2000  0.2000  0.3000  ±2.33%    11034   fastest

// BENCH  Summary

// chromium  none - src/copy.bench.ts
// 1.05x faster than arr
// 1.31x faster than obj
// 5.27x faster than all

// Здесь не приводится более реальный пример, когда нет так много элементов массива и столько объектов.
// Разница становится несущественной и вполне можно использовать любой подходящий режим.
