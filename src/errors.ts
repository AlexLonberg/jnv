import type { TPropertyName, TCustomValidate, TResult } from './types.js'
import { isNonemptyString, propertyNameToString } from './utils.js'

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
  path: string
  message: string
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
  getClassErrorByCode
}
