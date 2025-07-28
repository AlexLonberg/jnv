import type { TPropertyName, TCustomValidate, TResult } from './types.js'
import {
  type TErrorLevel,
  type IErrorDetail as IErrorDetail_,
  type IErrorLike as IErrorLike_,
  type IErrorLikeCollection as IErrorLikeCollection_,
  ErrorLikeProto,
  BaseError,
  ErrorLikeCollection,
  captureStackTrace,
  createErrorLike,
  ensureErrorLike as ensureErrorLike_,
  isErrorLike,
  safeAnyToString,
  safeGetStringOf,
  errorDetailToList,
  errorDetailToString,
  nativeErrorToString,
  errorToString,
  errorDetailToJsonLike,
  nativeErrorToJsonLike,
  errorToJsonLike
} from 'js-base-error'
import { propertyNameToString } from './utils.js'

/** Коды ошибок. */
const errorCodes = Object.freeze({
  UnknownError: 0,
  ConfigureError: 1,
  ModelIsFrozenError: 2,
  RequiredPropertyError: 3,
  FaultyValueError: 4,
  NotConfiguredError: 5,
  CombinedError: 6
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
 * Оборачивает ошибку в тип {@link IErrorLike}, если она еще не обернута и проверяет или устанавливает допустимый код
 * {@link IErrorDetail.code}.
 *
 * @param maybeError Один из вариантов {@link JnvError} или {@link IErrorDetail} или {@link IErrorLike}.
 *
 * Эта функция применяется для пользовательских валидаторов возвращающих ошибки, которые могут быть простыми объектами
 * или недопустимыми типами.
 */
function ensureErrorLike<T extends IErrorLike> (maybeError: any): T {
  const err = ensureErrorLike_(maybeError)
  if (!code2Name.has(err.code)) {
    err.code = 0
  }
  const name = errorNameByCode(err.code)
  if (err.name !== name) {
    err.name = name
  }
  return err as T
}

/**
 * Детали ошибки с кодом и описанием.
 * Все нижеуказанные поля не являются обязательными и зависят от типа ошибки.
 */
interface IErrorDetail extends IErrorDetail_<TErrorCode> {
  code: TErrorCode
  /**
   * @experimental
   *
   * Строковое имя модели, если задано.
   * Имя модели не гарантируется и будет установлено, только если ошибку получил контекст валидации.
   */
  model?: string
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
  /**
   * Комбинированный результат предупреждений.
   *
   * Если результат валидации возвращает только `warning`, то `level:warning` и это поле будут свойствами
   * комбинированной ошибки. Массив предупреждений автоматически заворачивается в прототип с `toString()`, и не требует
   * явных преобразований.
   *
   * Если результат валидации ошибка, то это поле будет заполнено предупреждениями возникшими до ошибки.
   */
  warnings?: IErrorLikeCollection
  /**
   * Комбинированный результат ошибок.
   */
  errors?: IErrorLikeCollection
}

/**
 * Базовый интерфейс деталей ошибок.
 */
interface IErrorLike extends IErrorLike_<TErrorCode>, IErrorDetail {
  code: TErrorCode
}

/**
 * Массив ошибок с методом автоматического преобразования `toString()` всех вложенных {@link IErrorLike} к строке или
 * `toJSON()` к объекту `{errors: Record<string, any>[]}`.
 */
interface IErrorLikeCollection extends IErrorLikeCollection_<IErrorLike> { }

/**
 * Базовый `abstract` класс ошибок валидатора.
 */
class JnvError extends BaseError<IErrorLike> { }

/**
 * Предопределенные описания ошибок.
 */
const errorDetails = Object.freeze({
  UnknownError (propertyPath: string, message?: undefined | null | string, cause?: any): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.UnknownError),
      code: errorCodes.UnknownError,
      propertyPath,
      message,
      cause
    })
  },
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
  CombinedError (fieldName: 'errors' | 'warnings', items: IErrorLikeCollection): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.CombinedError),
      code: errorCodes.CombinedError,
      level: fieldName === 'warnings' ? 'warning' : 'error',
      [fieldName]: items
    })
  }
} as const)

/**
 * Вспомогательные функции приводящие сообщения к формату `{ok: false, value: null, error: IErrorLike}`.
 * Функции могут установить только одно свойство `error`.
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
  UnknownError<T = unknown> (propertyPath: string, message?: undefined | null | string): TResult<T> {
    return { ok: false, value: null, error: errorDetails.UnknownError(propertyPath, message) }
  },
  RequiredPropertyError<T = unknown> (propertyPath: string, requiredPropertyName: TPropertyName, message?: string): TResult<T> {
    return { ok: false, value: null, error: errorDetails.RequiredPropertyError(propertyPath, requiredPropertyName, message) }
  },
  FaultyValueError<T = unknown> (propertyPath: string, valueOrType: string, message?: string): TResult<T> {
    return { ok: false, value: null, error: errorDetails.FaultyValueError(propertyPath, valueOrType, message) }
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
 * Этот тип не был сконфигурирован из-за недопустимости типа значения.
 */
class NotConfiguredError extends JnvError { }

/**
 * Несколько ошибок.
 */
class CombinedError extends JnvError { }

/**
 * Возвращает один из конструкторов {@link JnvError}.
 */
function errorClassByCode (code: TErrorCode): typeof JnvError {
  switch (code) {
    case 1: return ConfigureError
    case 2: return ModelIsFrozenError
    case 3: return RequiredPropertyError
    case 4: return FaultyValueError
    case 5: return NotConfiguredError
    case 6: return CombinedError
  }
  return UnknownError
}

export {
  type TErrorLevel,
  type IErrorDetail,
  type IErrorLike,
  type IErrorLikeCollection,
  ErrorLikeProto,
  BaseError,
  ErrorLikeCollection,
  captureStackTrace,
  createErrorLike,
  ensureErrorLike,
  isErrorLike,
  safeAnyToString,
  safeGetStringOf,
  errorDetailToList,
  errorDetailToString,
  nativeErrorToString,
  errorToString,
  errorDetailToJsonLike,
  nativeErrorToJsonLike,
  errorToJsonLike,
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
  CombinedError,
  errorNameByCode,
  errorClassByCode
}
