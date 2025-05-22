import type { TPropertyName, TCustomValidate, TResult } from './types.js'
import {
  type TErrorLevel,
  type IErrorDetail as IErrorDetail_,
  type IErrorLike as IErrorLike_,
  ErrorLikeProto,
  BaseError as BaseError_,
  captureStackTrace,
  createErrorLike,
  isErrorLike,
  safeAnyToString,
  getStringOf,
  errorDetailToList,
  errorDetailToString,
  nativeErrorToString,
  errorToString
} from 'js-base-error'
import { propertyNameToString } from './utils.js'

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

const code2Name = Object.freeze(new Map(Object.entries(errorCodes).map(([name, code]) => [code, name])))
function errorNameByCode (code: TErrorCode): string {
  const name = code2Name.get(code)
  return `Jnv.${name ?? ''}`
}

/**
 * Детали ошибки с кодом и описанием.
 * Все нижеуказанные поля не являются обязательными и зависят от типа ошибки.
 */
interface IErrorDetail extends IErrorDetail_<TErrorCode> {
  /**
   * Строковое представление имени свойства на котором произошла ошибка.
   */
  propertyName?: string
  /**
   * Строковое представление пути свойства на котором произошла ошибка.
   */
  propertyPath?: string
  /**
   * Имя обязательного свойства.
   */
  requiredPropertyName?: string
  /**
   * Тип или значение не прошедшего проверку свойства(значения).
   */
  valueOrType?: string
}

/**
 * Базовый интерфейс деталей ошибок.
 */
interface IErrorLike extends IErrorLike_<TErrorCode>, IErrorDetail { }

/**
 * Базовый `abstract` класс ошибок валидатора.
 */
class JnvError extends BaseError_<IErrorLike> { }

/**
 * Предопределенные описания ошибок.
 */
const errorDetails = Object.freeze({
  ConfigureError (propertyName: TPropertyName, message?: string): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.ConfigureError),
      code: errorCodes.ConfigureError,
      propertyName: propertyNameToString(propertyName),
      message
    })
  },
  ModelIsFrozenError (propertyName: TPropertyName, message?: string): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.ModelIsFrozenError),
      code: errorCodes.ModelIsFrozenError,
      propertyName: propertyNameToString(propertyName),
      message
    })
  },
  RequiredPropertyError (propertyPath: string, requiredPropertyName: TPropertyName, message?: string): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.RequiredPropertyError),
      code: errorCodes.RequiredPropertyError,
      propertyPath,
      requiredPropertyName: propertyNameToString(requiredPropertyName),
      message
    })
  },
  FaultyValueError (propertyPath: string, valueOrType: string, message?: string): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.FaultyValueError),
      code: errorCodes.FaultyValueError,
      propertyPath,
      valueOrType,
      message
    })
  },
  NotConfiguredError (propertyPath: string, valueOrType: string, message?: string): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.NotConfiguredError),
      code: errorCodes.NotConfiguredError,
      propertyPath,
      valueOrType,
      message
    })
  },
  UnknownError (propertyPath: string, message?: undefined | null | string, cause?: any): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.UnknownError),
      code: errorCodes.UnknownError,
      propertyPath,
      message,
      cause
    })
  }
} as const)

/**
 * Вспомогательные функции приводящие сообщения к формату `{ok: false, value: null, details: {error: IErrorLike[]}}`.
 * Функции могут установить только одно свойство `error` и массив с одной ошибкой `error: [IErrorLike]`.
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
    return { ok: false, value: null, details: { errors: [errorDetails.ConfigureError(propertyName, message)] } }
  },
  ModelIsFrozenError<T = unknown> (propertyName: TPropertyName, message?: string): TResult<T> {
    return { ok: false, value: null, details: { errors: [errorDetails.ModelIsFrozenError(propertyName, message)] } }
  },
  RequiredPropertyError<T = unknown> (propertyPath: string, requiredPropertyName: TPropertyName, message?: string): TResult<T> {
    return { ok: false, value: null, details: { errors: [errorDetails.RequiredPropertyError(propertyPath, requiredPropertyName, message)] } }
  },
  FaultyValueError<T = unknown> (propertyPath: string, valueOrType: string, message?: string): TResult<T> {
    return { ok: false, value: null, details: { errors: [errorDetails.FaultyValueError(propertyPath, valueOrType, message)] } }
  },
  NotConfiguredError<T = unknown> (propertyPath: string, valueOrType: string, message?: string): TResult<T> {
    return { ok: false, value: null, details: { errors: [errorDetails.NotConfiguredError(propertyPath, valueOrType, message)] } }
  },
  UnknownError<T = unknown> (propertyPath: string, message?: undefined | null | string): TResult<T> {
    return { ok: false, value: null, details: { errors: [errorDetails.UnknownError(propertyPath, message)] } }
  }
} as const)

/**
 * Неопределенная ошибка вызванная внешними факторами не предусмотренными валидатором.
 */
class UnknownError extends JnvError { }

/**
 * Ошибки конфигурации.
 */
class ConfigureError extends JnvError { }

/**
 * Ошибки конфигурации.
 * Дальнейшая конфигурация свойства запрещена.
 */
class ModelIsFrozenError extends JnvError { }

/**
 * Ошибка валидации.
 * В объекте отсутствует обязательное свойство.
 */
class RequiredPropertyError extends JnvError { }

/**
 * Ошибка валидации.
 * Тип или значение свойства недопустимы.
 */
class FaultyValueError extends JnvError { }

/**
 * Ошибка валидации.
 * Этот тип не был  сконфигурирован из-за недопустимости типа значения..
 */
class NotConfiguredError extends JnvError { }

/**
 * Возвращает один из конструкторов {@link JnvError}.
 */
function getErrorClassByCode (code: TErrorCode): typeof JnvError {
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
 * Оборачивает ошибку в тип {@link IErrorLike}, если она еще не обернута и проверяет или устанавливает свойство {@link IErrorDetail.code}.
 *
 * @param errorOrDetail Один из вариантов {@link IErrorDetail} или {@link IErrorLike}.
 *
 * Эта функция применяется для пользовательских валидаторов возвращающих ошибки, которые могут быть простыми объектами.
 */
function insureErrorLike (errorOrDetail: IErrorDetail | IErrorLike): IErrorLike {
  const err = isErrorLike(errorOrDetail) ? errorOrDetail : createErrorLike(errorOrDetail)
  if (!code2Name.has(err.code)) {
    err.code = 0
  }
  return err
}

export {
  type TErrorLevel,
  type IErrorDetail,
  type IErrorLike,
  ErrorLikeProto,
  captureStackTrace,
  createErrorLike,
  isErrorLike,
  safeAnyToString,
  getStringOf,
  errorDetailToList,
  errorDetailToString,
  nativeErrorToString,
  errorToString,
  //
  errorCodes,
  type TErrorCodes,
  type TErrorCode,
  errorDetails,
  errorResults,
  JnvError,
  UnknownError,
  ConfigureError,
  ModelIsFrozenError,
  RequiredPropertyError,
  FaultyValueError,
  NotConfiguredError,
  getErrorClassByCode,
  insureErrorLike
}
