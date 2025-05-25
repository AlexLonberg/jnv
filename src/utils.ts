import {
  defaultRootName,
  type TDefaultRootName,
  unknownPropertyName,
  type TUnknownPropertyName,
  unknownValue,
  type TUnknownValue,
  type TPropertyName
} from './types.js'

const _hasOwn = ('hasOwn' in Object && typeof Object.hasOwn === 'function')
  ? Object.hasOwn
  : (obj: any, key: string | number | symbol) => Object.prototype.hasOwnProperty.call(obj, key)

/**
 * Значение `undefined`.
 */
function isUndefined (value: any): value is undefined {
  return typeof value === 'undefined'
}

/**
 * Значение `boolean`.
 */
function isBoolean (value: any): value is boolean {
  return typeof value === 'boolean'
}

/**
 * Является ли аргумент `value` числом исключая `NaN` и `Infinity`.
 */
function isNumber (value: any): value is number {
  return Number.isFinite(value)
}

/**
 * Является ли аргумент `value` целым числом.
 */
function isInt (value: any): value is number {
  return Number.isInteger(value)
}

/**
 * Является ли аргумент `value` целым неотрицательным числом.
 */
function isIntNonnegative (value: any): value is number {
  return Number.isInteger(value) && value >= 0
}

/**
 * Является ли аргумент `value` строкой.
 */
function isString (value: any): value is string {
  return typeof value === 'string'
}

/**
 * Является ли аргумент `value` непустой строкой.
 */
function isNonemptyString (value: any): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * Является ли аргумент `value` допустимым Json-примитивом.
 */
function isJsonPrimitive<T extends (null | boolean | number | string)> (value: any): value is T {
  return value === null || isBoolean(value) || isNumber(value) || isString(value)
}

/**
 * Является ли значение `value` объектом `[]|{}`.
 */
function isObject<T> (value: T): value is (object & T) {
  return value !== null && typeof value === 'object'
}

/**
 * Является ли значение `value` структуроподобным объектом `{...}` исключая массивы `[]`.
 */
function isPlainObject<T> (value: T): value is (object & T) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Является ли значение `value` массивом.
 */
function isArray<T> (value: T): value is (any[] & T) {
  return Array.isArray(value)
}

/**
 * Является ли значение `value` функцией.
 */
function isFunction (value: any): value is ((..._: any[]) => any) {
  return typeof value === 'function'
}

/**
 * Наличие собственного `enumerable` свойства объекта.
 *
 * @param obj Целевой объект.
 * @param key Искомое имя свойства.
 */
function hasOwn<T extends object, K extends string | number | symbol> (obj: T, key: K):
  obj is (T & { [_ in K]: K extends keyof T ? T[K] : never }) {
  return _hasOwn(obj, key)
}

/**
 * Копия регулярного выражения.
 */
function copyRegExp (re: RegExp): RegExp {
  const { source, flags } = re
  return new RegExp(source, flags)
}

/**
 * Глубокая копия собственных перечислимых свойств.
 */
function plainCopy<T> (value: T): T {
  const cache = new WeakMap<object, object>()
  const recursive = (val: any): any => {
    if (!isObject(val)) {
      return val
    }
    let target = cache.get(val) as any
    if (target) {
      return target
    }
    if (isArray(val)) {
      target = []
      cache.set(val, target)
      for (const item of val) {
        target.push(recursive(item))
      }
    }
    else {
      target = {} as any
      cache.set(val, target)
      for (const [key, v] of Object.entries(val)) {
        target[key] = recursive(v)
      }
    }
    return target
  }
  return recursive(value) as T
}

/**
 * Сливает только `boolean` и `number` свойства, которые есть у обоих объектов.
 *
 * @param target Целевой объект на который копируются свойства.
 * @param source Источник.
 */
function mergeBoolOrIntProperties<T extends Record<string, boolean | number>> (target: T, source: { [_ in keyof T]?: undefined | null | boolean | number }): T {
  for (const key of Object.keys(target)) {
    if (hasOwn(source, key) && (isBoolean(source[key]) || isIntNonnegative(source[key]))) {
      (target as any)[key] = source[key]
    }
  }
  return target
}

/**
 * Поверхностное равенство ключей и значений двух объектов.
 */
function shallowEquals (obj1: object, obj2: object): boolean {
  if (obj1 === obj2) {
    return true
  }
  const keys1 = Object.keys(obj1)
  const keys2 = Object.keys(obj2)
  if (keys1.length !== keys2.length) {
    return false
  }
  for (const key of keys1) {
    if (!keys2.includes(key) || (obj1 as any)[key] !== (obj2 as any)[key]) {
      return false
    }
  }
  return true
}

/**
 * Наличие объекта в массиве используя поверхностное равенство {@link shallowEquals()}.
 *
 * @param array Массив.
 * @param value Искомый объект.
 */
function objInArray<T extends object> (array: T[], value: T): boolean {
  for (const item of array) {
    if (shallowEquals(value, item)) {
      return true
    }
  }
  return false
}

/**
 * Возвращает строковое представление ключа `string|number|null` или специальное значение {@link TUnknownPropertyName}.
 * Для ключа `null` возвращается корневой неименованный идентификатор {@link TDefaultRootName}.
 */
function propertyNameToString (value: any): string {
  if (value === null) {
    return defaultRootName
  }
  if (isString(value)) {
    return value
  }
  if (isIntNonnegative(value)) {
    try {
      return `[${value.toString()}]`
    } catch (_) { /* */ }
  }
  return unknownPropertyName
}

/**
 * Возвращает строковое представление пути {@link TPropertyName}`[]`.
 */
function propertyPathToString (propertyPath: TPropertyName[]): string {
  return isArray(propertyPath) ? propertyPath.map((name) => propertyNameToString(name)).join('.') : unknownPropertyName
}

/**
 * Приводит `value` к Json или возвращает специальное значение {@link TUnknownValue}.
 */
function safeToJson (value: any): string {
  try {
    if (isString(value)) {
      return value
    }
    return JSON.stringify(value)
  } catch (_) {
    return unknownValue
  }
}

export {
  isUndefined,
  isBoolean,
  isNumber,
  isInt,
  isIntNonnegative,
  isString,
  isNonemptyString,
  isJsonPrimitive,
  isObject,
  isPlainObject,
  isArray,
  isFunction,
  hasOwn,
  copyRegExp,
  plainCopy,
  mergeBoolOrIntProperties,
  shallowEquals,
  objInArray,
  propertyNameToString,
  propertyPathToString,
  safeToJson
}
