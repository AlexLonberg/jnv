import type {
  TPropertyName,
  TResult,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  TCustomValidate
} from './types.js'
import {
  // type TErrorLevel,
  type IErrorDetail as IErrorDetail_,
  type IErrorLike as IErrorLike_,
  type IErrorLikeCollection,
  // ErrorLikeProto,
  BaseError,
  // ErrorLikeCollection,
  // captureStackTrace,
  createErrorLike,
  // isErrorLike,
  // safeAnyToString,
  // safeGetStringOf,
  // errorDetailToList,
  // errorDetailToString,
  // nativeErrorToString,
  // errorToString,
  // errorDetailToJsonLike,
  // nativeErrorToJsonLike,
  // errorToJsonLike
} from 'js-base-error'
import { propertyNameToString } from './utils.js'

/**
 * Имя ошибки.
 */
type TErrorName = 'Jnv.UnknownError' | 'Jnv.ConfigureError' | 'Jnv.ModelIsFrozenError' | 'Jnv.RequiredPropertyError' | 'Jnv.FaultyValueError' | 'Jnv.NotConfiguredError' | 'Jnv.CombinedError'

/**
 * Проверяет, является ли имя ошибки допустимым.
 *
 * @param name Предполагаемое имя ошибки.
 */
function isErrorName (name: any): name is TErrorName {
  return name === 'Jnv.ConfigureError' ||
    name === 'Jnv.ModelIsFrozenError' ||
    name === 'Jnv.RequiredPropertyError' ||
    name === 'Jnv.FaultyValueError' ||
    name === 'Jnv.NotConfiguredError' ||
    name === 'Jnv.CombinedError' ||
    name === 'Jnv.UnknownError'
}

/**
 * Детали ошибки.
 *
 * Все нижеуказанные поля не являются обязательными и зависят от типа ошибки.
 */
interface IErrorDetail extends IErrorDetail_ {
  /**
   * Имя ошибки.
   */
  name: TErrorName
  /**
   * Строковое имя модели, если задано.
   *
   * Имя модели не гарантируется и будет установлено, только если ошибку получил контекст валидации.
   */
  model?: string
  /**
   * Строковое представление имени свойства на котором произошла ошибка.
   */
  propertyName?: string
  /**
   * Строковое представление пути к свойству на котором произошла ошибка.
   */
  propertyPath?: string
  /**
   * Имя обязательного свойства, которое не найдено в объекте.
   */
  requiredPropertyName?: string
  /**
   * Значение, не прошедшее проверку, в строковом представлении.
   */
  value?: string
  /**
   * Комбинированный результат предупреждений.
   *
   * Если результат валидации возвращает только `warning`, то `level:warning` и это поле будут свойствами
   * комбинированной ошибки. Массив предупреждений автоматически заворачивается в прототип с `toString()`, и не требует
   * явных преобразований.
   *
   * Если результат валидации ошибка, то это поле будет заполнено предупреждениями возникшими до ошибки.
   */
  warnings?: IErrorLikeCollection<IErrorLike>
  /**
   * Комбинированный результат ошибок.
   */
  errors?: IErrorLikeCollection<IErrorLike>
}

/**
 * Базовый интерфейс деталей ошибок.
 */
interface IErrorLike extends IErrorLike_, IErrorDetail {
  name: TErrorName
}

/**
 * Базовый класс всех ошибок валидатора.
 */
class JnvError extends BaseError<IErrorLike> { }

/**
 * Предопределенные описания ошибок. Все функции оборачивают объект в {@link IErrorLike}.
 */
const errorDetails = Object.freeze({
  UnknownError (propertyPath: string, message?: undefined | null | string, cause?: any): IErrorLike {
    return createErrorLike({
      name: 'Jnv.UnknownError',
      propertyPath,
      message,
      cause
    })
  },
  ConfigureError (propertyName: TPropertyName, message?: string): IErrorLike {
    return createErrorLike({
      name: 'Jnv.ConfigureError',
      propertyName: propertyNameToString(propertyName),
      message
    })
  },
  ModelIsFrozenError (propertyName: TPropertyName, message?: string): IErrorLike {
    return createErrorLike({
      name: 'Jnv.ModelIsFrozenError',
      propertyName: propertyNameToString(propertyName),
      message
    })
  },
  RequiredPropertyError (propertyPath: string, requiredPropertyName: TPropertyName, message?: string): IErrorLike {
    return createErrorLike({
      name: 'Jnv.RequiredPropertyError',
      propertyPath,
      requiredPropertyName: propertyNameToString(requiredPropertyName),
      message
    })
  },
  FaultyValueError (propertyPath: string, value: string, message?: string): IErrorLike {
    return createErrorLike({
      name: 'Jnv.FaultyValueError',
      propertyPath,
      value,
      message
    })
  },
  NotConfiguredError (propertyPath: string, value: string, message?: string): IErrorLike {
    return createErrorLike({
      name: 'Jnv.NotConfiguredError',
      propertyPath,
      value,
      message
    })
  },
  CombinedError (fieldName: 'errors' | 'warnings', items: IErrorLikeCollection<IErrorLike>): IErrorLike {
    return createErrorLike({
      name: 'Jnv.CombinedError',
      level: fieldName === 'warnings' ? 'warning' : 'error',
      [fieldName]: items
    })
  }
} as const)

/**
 * Вспомогательные функции приводящие сообщения к формату с ошибкой `{ok: false, value: null, error: JnvError}`.
 *
 * Используйте набор этих функций в пользовательском валидаторе {@link TCustomValidate}, который должен возвратить
 * унифицированный формат {@link TResult}.
 *
 * @example
 * ```ts
 * if(... error){
 *   return errorResults.FaultyValueError(path, value, message)
 * }
 * ```
 */
const errorResults = Object.freeze({
  UnknownError<T = unknown> (propertyPath: string, message?: undefined | null | string, cause?: any): TResult<T> {
    return { ok: false, value: null, error: new UnknownError(errorDetails.UnknownError(propertyPath, message, cause)) }
  },
  RequiredPropertyError<T = unknown> (propertyPath: string, requiredPropertyName: TPropertyName, message?: string): TResult<T> {
    return { ok: false, value: null, error: new RequiredPropertyError(errorDetails.RequiredPropertyError(propertyPath, requiredPropertyName, message)) }
  },
  FaultyValueError<T = unknown> (propertyPath: string, value: string, message?: string): TResult<T> {
    return { ok: false, value: null, error: new FaultyValueError(errorDetails.FaultyValueError(propertyPath, value, message)) }
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
 *
 * Дальнейшая конфигурация свойства запрещена.
 */
class ModelIsFrozenError extends JnvError { }

/**
 * Ошибка валидации.
 *
 * В объекте отсутствует обязательное свойство.
 */
class RequiredPropertyError extends JnvError { }

/**
 * Ошибка валидации.
 *
 * Тип или значение свойства недопустимы.
 */
class FaultyValueError extends JnvError { }

/**
 * Ошибка валидации.
 *
 * Этот тип не был сконфигурирован из-за недопустимости типа значения.
 */
class NotConfiguredError extends JnvError { }

/**
 * Контейнер для несколько ошибок.
 *
 * Может применяться для агрегации предупреждений.
 */
class CombinedError extends JnvError { }

/**
 * Возвращает один из конструкторов {@link JnvError}.
 */
function errorClassByName (name: string): typeof JnvError {
  switch (name) {
    case 'Jnv.ConfigureError': return ConfigureError
    case 'Jnv.ModelIsFrozenError': return ModelIsFrozenError
    case 'Jnv.RequiredPropertyError': return RequiredPropertyError
    case 'Jnv.FaultyValueError': return FaultyValueError
    case 'Jnv.NotConfiguredError': return NotConfiguredError
    case 'Jnv.CombinedError': return CombinedError
  }
  return UnknownError
}

export {
  type IErrorDetail,
  type IErrorLike,
  //
  type TErrorName,
  isErrorName,
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
  errorClassByName
}
