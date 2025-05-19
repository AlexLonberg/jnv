import type { TPropertyName, TCustomValidate, TResult } from './types.js'
import { isPlainObject, isIntNonnegative, isNonemptyString, propertyNameToString } from './utils.js'

/** Коды ошибок. */
const errorCodes = Object.freeze({
  UnknownError: 0,
  ConfigureError: 1,
  ModelIsFrozenError: 2,
  RequiredPropertyError: 3,
  FaultyValueError: 4,
  NotConfiguredError: 5
} as const)

/** Коды ошибок. */
type TErrorCodes = typeof errorCodes
/** Коды ошибок. */
type TErrorCode = TErrorCodes[keyof TErrorCodes]

/**
 * Детали ошибки с кодом и описанием.
 */
type TErrorDetail = {
  code: TErrorCode
  message: string
  path: string
}

/**
 * Предопределенные описания ошибок.
 */
const errorMessages = Object.freeze({
  ConfigureError (propertyName: TPropertyName, message?: string): TErrorDetail {
    const msg = isNonemptyString(message) ? `\n${message}` : ''
    const path = propertyNameToString(propertyName)
    return {
      code: errorCodes.ConfigureError,
      path,
      message: `Configure error, property name: '${path}'.${msg}`
    }
  },
  ModelIsFrozenError (propertyName: TPropertyName, message?: string): TErrorDetail {
    const msg = isNonemptyString(message) ? `\n${message}` : ''
    const path = propertyNameToString(propertyName)
    return {
      code: errorCodes.ModelIsFrozenError,
      path,
      message: `Model is frozen error, property name: '${path}'.${msg}`
    }
  },
  RequiredPropertyError (propertyPath: string, requiredPropertyName: TPropertyName, message?: string): TErrorDetail {
    const msg = isNonemptyString(message) ? `\n${message}` : ''
    return {
      code: errorCodes.RequiredPropertyError,
      path: propertyPath,
      message: `The type does not have a required property, property path: '${propertyPath}', required property name: '${propertyNameToString(requiredPropertyName)}'.${msg}`
    }
  },
  FaultyValueError (propertyPath: string, valueOrType: string, message?: string): TErrorDetail {
    const msg = isNonemptyString(message) ? `\n${message}` : ''
    return {
      code: errorCodes.FaultyValueError,
      path: propertyPath,
      message: `The value has an faulty type, property path: '${propertyPath}', value or type '${valueOrType}'.${msg}`
    }
  },
  NotConfiguredError (propertyPath: string, valueOrType: string, message?: string): TErrorDetail {
    const msg = isNonemptyString(message) ? `\n${message}` : ''
    return {
      code: errorCodes.NotConfiguredError,
      path: propertyPath,
      message: `The value has not been configured, property path: '${propertyPath}', value or type '${valueOrType}'.${msg}`
    }
  },
  UnknownError (propertyPath: string, message?: undefined | null | string): TErrorDetail {
    const msg = isNonemptyString(message) ? `\n${message}` : ''
    return {
      code: errorCodes.UnknownError,
      path: propertyPath,
      message: `Unknown error, property path: '${propertyPath}'.${msg}`
    }
  }
} as const)

/**
 * Вспомогательные функции приводящие сообщения к формату `{ok: false, value: null, details: {error: TErrorDetail[]}}`.
 * Функции могут установить только одно свойство `error` и массив с одной ошибкой `error: [TErrorDetail]`.
 *
 * Используйте набор этих функций в пользовательском валидаторе {@link TCustomValidate}, который должен возвратить
 * унифицированный формат{@link TResult}.
 *
 * @example
 * ```ts
 * if(... error){
 *   return errorResults.FaultyValueError(path, value, message)
 * }
 * ```
 */
const errorResults = Object.freeze({
  ConfigureError (propertyName: TPropertyName, message?: string): TResult<unknown> {
    return { ok: false, value: null, details: { errors: [errorMessages.ConfigureError(propertyName, message)] } }
  },
  ModelIsFrozenError<T = unknown> (propertyName: TPropertyName, message?: string): TResult<T> {
    return { ok: false, value: null, details: { errors: [errorMessages.ModelIsFrozenError(propertyName, message)] } }
  },
  RequiredPropertyError<T = unknown> (propertyPath: string, requiredPropertyName: TPropertyName, message?: string): TResult<T> {
    return { ok: false, value: null, details: { errors: [errorMessages.RequiredPropertyError(propertyPath, requiredPropertyName, message)] } }
  },
  FaultyValueError<T = unknown> (propertyPath: string, valueOrType: string, message?: string): TResult<T> {
    return { ok: false, value: null, details: { errors: [errorMessages.FaultyValueError(propertyPath, valueOrType, message)] } }
  },
  NotConfiguredError<T = unknown> (propertyPath: string, valueOrType: string, message?: string): TResult<T> {
    return { ok: false, value: null, details: { errors: [errorMessages.NotConfiguredError(propertyPath, valueOrType, message)] } }
  },
  UnknownError<T = unknown> (propertyPath: string, message?: undefined | null | string): TResult<T> {
    return { ok: false, value: null, details: { errors: [errorMessages.UnknownError(propertyPath, message)] } }
  }
} as const)

/**
 * Базовый класс ошибок валидатора.
 */
class ValidatorError extends Error {
  readonly detail: TErrorDetail

  constructor(detail: TErrorDetail) {
    super(detail.message)
    this.detail = detail
  }

  get code (): TErrorCode {
    return this.detail.code
  }

  override toString (): string {
    return errorToString(this)
  }
}

/**
 * Неопределенная ошибка вызванная внешними факторами не предусмотренными валидатором.
 */
class UnknownError extends ValidatorError { }

/**
 * Ошибки конфигурации.
 */
class ConfigureError extends ValidatorError { }

/**
 * Ошибки конфигурации.
 * Дальнейшая конфигурация свойства запрещена.
 */
class ModelIsFrozenError extends ValidatorError { }

/**
 * Ошибка валидации.
 * В объекте отсутствует обязательное свойство.
 */
class RequiredPropertyError extends ValidatorError { }

/**
 * Ошибка валидации.
 * Тип или значение свойства недопустимы.
 */
class FaultyValueError extends ValidatorError { }

/**
 * Ошибка валидации.
 * Этот тип не был  сконфигурирован из-за недопустимости типа значения..
 */
class NotConfiguredError extends ValidatorError { }

/**
 * Возвращает один из конструкторов {@link ValidatorError}.
 */
function getClassErrorByCode (code: TErrorCode): typeof ValidatorError {
  switch (code) {
    case 1: return ConfigureError
    case 2: return ModelIsFrozenError
    case 3: return RequiredPropertyError
    case 4: return FaultyValueError
    case 5: return NotConfiguredError
  }
  return UnknownError
}

/**
 * Возвращает имя ошибки по коду.
 */
function getClassNameErrorByCode (code: TErrorCode): keyof TErrorCodes {
  switch (code) {
    case 1: return 'ConfigureError'
    case 2: return 'ModelIsFrozenError'
    case 3: return 'RequiredPropertyError'
    case 4: return 'FaultyValueError'
    case 5: return 'NotConfiguredError'
  }
  return 'UnknownError'
}

function _tryAnyToString (value: any): null | string {
  try {
    const text = value.toString()
    if (isNonemptyString(text)) {
      return text
    }
  } catch (_) { /**/ }
  return null
}

function _getStrValueOf<T extends null | string> (obj: object, property: string, defaultValue: T): string | T {
  try {
    const value = Reflect.get(obj, property)
    if (value) {
      return (_tryAnyToString(value) ?? defaultValue) as T
    }
  } catch (_) { /**/ }
  return defaultValue as T
}

function _getClassNameError (obj: object, property: string): keyof TErrorCodes {
  try {
    const value = Reflect.get(obj, property)
    if (isIntNonnegative(value)) {
      return getClassNameErrorByCode(value as TErrorCode)
    }
  } catch (_) { /**/ }
  return 'UnknownError'
}

function _detailToList (detail: TErrorDetail & Record<string, any>): string[] {
  const keys = new Set(Object.keys(detail))
  let cause: null | string = null
  const msg = []

  // Сперва извлекаем ожидаемые значения.
  if (keys.has('code')) {
    keys.delete('code')
    msg.push(`${_getClassNameError(detail, 'code')}:`)
    msg.push(`code: ${_getStrValueOf(detail, 'code', '0')}`)
  }
  if (keys.has('message')) {
    keys.delete('message')
    const value = _getStrValueOf(detail, 'message', null)
    if (value) {
      msg.push(`message:\n${value}`)
    }
  }
  if (keys.has('cause')) {
    keys.delete('cause')
    try {
      const prop = Reflect.get(detail, 'cause')
      const value = errorToString(prop)
      if (isNonemptyString(value)) {
        cause = value
      }
    } catch (_) { /**/ }
  }

  // Далее проходимся по всем свойствам
  for (const key of keys) {
    const value = _getStrValueOf(detail, key, null)
    if (value) {
      msg.push(`${key}:\n${value}`)
    }
  }

  if (cause) {
    msg.push(`cause:\n${cause}`)
  }
  return msg
}

function errorToString (value: any): string {
  if (value instanceof ValidatorError) {
    const list = _detailToList(value.detail)
    const stack = _getStrValueOf(value, 'stack', null)
    if (stack) {
      list.push(stack)
    }
    return list.join('\n')
  }
  if (value instanceof Error) {
    const base = _tryAnyToString(value)
    const stack = _getStrValueOf(value, 'stack', null)
    if (!base) {
      return stack ?? ''
    }
    if (stack) {
      return `${base}\n${stack}`
    }
    return base
  }
  if (isPlainObject(value)) {
    return _detailToList(value).join('\n')
  }
  if (value) {
    return _tryAnyToString(value) ?? ''
  }
  return ''
}

export {
  errorCodes,
  type TErrorCodes,
  type TErrorCode,
  type TErrorDetail,
  errorMessages,
  errorResults,
  ValidatorError,
  UnknownError,
  ConfigureError,
  ModelIsFrozenError,
  RequiredPropertyError,
  FaultyValueError,
  NotConfiguredError,
  getClassErrorByCode,
  getClassNameErrorByCode,
  errorToString
}
