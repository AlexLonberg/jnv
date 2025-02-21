import type { TPropertyName } from './types.js'
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
  ValidatorError,
  UnknownError,
  ConfigureError,
  ModelIsFrozenError,
  RequiredPropertyError,
  FaultyValueError,
  NotConfiguredError,
  getClassErrorByCode
}
