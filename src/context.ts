import {
  type TRes,
  type TRelease,
  type TPropertyName,
  type TResult,
  type TOptions,
  defaultRootName
} from './types.js'
import {
  type IErrorLike,
  ErrorLikeCollection,
  ensureErrorLike,
  errorDetails,
  RequiredPropertyError,
  FaultyValueError,
  NotConfiguredError,
  errorClassByCode
} from './errors.js'
import type { Config } from './config.js'
import type { Options } from './options.js'
import type { NoneModel, Model } from './models.js'
import { SafeStack, PathTracker } from './stack.js'
import { objInArray, safeToJson } from './utils.js'

/**
 * Контекст процесса валидации.
 *
 * + Все функции `throw*()` вызываются валидаторами значений.
 */
class Context {
  protected readonly _errorDetails = new ErrorLikeCollection<IErrorLike>('errors')
  protected readonly _warnDetails = new ErrorLikeCollection<IErrorLike>('warnings')
  protected readonly _typeMatchingFlag = new SafeStack<null>()
  protected readonly _warningFlag = new SafeStack<null>()
  protected readonly _stopErrorFlag = new SafeStack<null>()
  protected readonly _pathTracker = new PathTracker()
  protected readonly _modelTracker = new SafeStack<Options<any>>()
  protected readonly _config: Config
  protected readonly _options: Options<any>

  constructor(config: Config, options: Options<any>) {
    this._config = config
    this._options = options
  }

  /**
   * Отключить регистрацию ошибок. Регистрация отключается на время подбора значений.
   * Пользователи обязаны своевременно вызывать {@link TRelease} используя `try/finally`.
   */
  enterTypeMatching (): TRelease {
    // null здесь ни к чему, просто этого требует класс SafeStack
    return this._typeMatchingFlag.enter(null)
  }

  /**
   * Регистрировать только предупреждения.
   * Эту функцию использует массив при включении опции {@link Options.removeFaulty}, для временной регистрации
   * предупреждений при ошибках и получения `{ok: false}` во внутреннем валидаторе.
   */
  enterOnlyWarning (): TRelease {
    return this._warningFlag.enter(null)
  }

  /**
   * Находится ли процесс валидации в области позволяющей поднять исключение.
   */
  isThrowEnabled (): boolean {
    if (
      this._typeMatchingFlag.isAny() ||
      this._warningFlag.isAny() ||
      this._stopErrorFlag.isAny() ||
      // эта опция копируется из конфига или устанавливается явно, поэтому _config.stopIfError проверять нет смысла,
      // к тому же она установиться в _stopErrorFlag при входе в модель enterModel()
      this._options.stopIfError
    ) {
      return false
    }
    return this._config.throwIfError
  }

  /**
   * Добавить сегмент пути.
   * Пользователи обязаны своевременно вызывать `TRelease` используя try/finally.
   *
   * @param key Имя свойства или индекс массива.
   */
  enterKey (key: TPropertyName): TRelease {
    return this._pathTracker.enter(key)
  }

  /**
   * Возвращает путь к свойству в виде массива.
   */
  getPath (): TPropertyName[] {
    return this._pathTracker.getPath()
  }

  /**
   * Возвращает строковое представление пути от корня до текущего свойства.
   * В основном это для регистрации ошибок.
   */
  getPathAsStr (): string {
    return this._pathTracker.toString()
  }

  /**
   * Вызывается при входе в валидатор модели.
   * Этот метод позволяет видеть в какой точке дерева находится валидатор и какие параметры применяются к этой ветке.
   * Пользователи обязаны своевременно вызывать `TRelease` используя try/finally.
   *
   * @param options - Настройки.
   */
  enterModel (options: Options<any>): TRelease {
    const exitModel = this._modelTracker.enter(options)
    if (options.stopIfError) {
      const exitStopError = this._stopErrorFlag.enter(null)
      return (() => {
        exitModel()
        exitStopError()
      })
    }
    return exitModel
  }

  /**
   * Текущее имя модели, если задано через freeze(name).
   */
  getModelName (): null | string {
    return (this._modelTracker.top() ?? this._options)?.readonlyModelName ?? null
  }

  /**
   * Этот метод используется для регистрации предупреждений попадающих в результат валидации:
   *
   *  + Массивами, через {@link arrayFaultyValueError()}, при включенной настроке {@link TOptions.removeFaulty}.
   *  + Пользовательским валидатором.
   */
  addWarning (detail: IErrorLike): void {
    if (this._typeMatchingFlag.isEmpty() && !objInArray(this._warnDetails, detail)) {
      const model = this.getModelName()
      if (model) {
        detail.model = model
      }
      detail.level = 'warning'
      this._warnDetails.push(detail)
    }
  }

  /**
   * Регистрирует ошибку.
   */
  addError (detail: IErrorLike): void {
    if (this._typeMatchingFlag.isEmpty()) {
      if (this._stopErrorFlag.isEmpty() && this._warningFlag.isEmpty()) {
        if (!objInArray(this._errorDetails, detail)) {
          const model = this.getModelName()
          if (model) {
            detail.model = model
          }
          this._errorDetails.push(detail)
        }
      }
      else if (!objInArray(this._warnDetails, detail)) {
        detail.level = 'warning'
        const model = this.getModelName()
        if (model) {
          detail.model = model
        }
        this._warnDetails.push(detail)
      }
    }
  }

  attachErrorDetails (error: IErrorLike): void {
    if (this._errorDetails.length > 0) {
      if (!(error.errors instanceof ErrorLikeCollection)) {
        error.errors = this._errorDetails
      }
      else if (error.errors !== this._errorDetails) {
        error.errors = new ErrorLikeCollection('errors', new Set([...error.errors, ...this._errorDetails]))
      }
    }
  }

  attachWarningDetails (error: IErrorLike): void {
    if (this._warnDetails.length > 0) {
      if (!(error.warnings instanceof ErrorLikeCollection)) {
        error.warnings = this._warnDetails
      }
      else if (error.warnings !== this._warnDetails) {
        error.warnings = new ErrorLikeCollection('warnings', new Set([...error.warnings, ...this._warnDetails]))
      }
    }
  }

  /**
   * Присоединяет или сливает все ошибки и предупреждения к полям {@link IErrorLike.errors} и {@link IErrorLike.warnings}.
   *
   * Этот метод не копирует списки ошибок, а передает ссылки на внутренние свойства {@link ErrorLikeCollection},
   * и должен быть вызван в конце валидации или при поднятии исключения.
   *
   * @param error Объект ошибки.
   */
  attachErrors (error: IErrorLike): void {
    this.attachErrorDetails(error)
    this.attachWarningDetails(error)
  }

  /**
   * Регистрирует ошибку и вызывает исключение или возвращает результат.
   */
  protected _throwOrResult (detail: IErrorLike, cls: (new (detail: IErrorLike) => any)): TRes<any> {
    const options = this._modelTracker.top() ?? this._options
    if (options.readonlyModelName) {
      detail.model = options.readonlyModelName
    }
    if (this.isThrowEnabled()) {
      this.attachErrors(detail)
      throw new cls(detail)
    }
    this.addError(detail)
    // Проверяем только текущий уровень, если на вложенных свойствах ошибка допустима, она будет подниматься до границы stopIfError
    return options.stopIfError
      ? { ok: true, value: options.getDefaultValue() }
      : { ok: false, value: null }
  }

  /**
   * Вызывается только объектами при отсутствии обязательного свойства.
   */
  throwRequiredPropertyError (requiredPropertyName: string): TRes<any> {
    const detail = errorDetails.RequiredPropertyError(this.getPathAsStr(), requiredPropertyName)
    return this._throwOrResult(detail, RequiredPropertyError)
  }

  /**
   * Вызывается для любого значения(исключая подбор) не прошедшего валидацию.
   */
  throwFaultyValueError (valueOrType: any, message?: string): TRes<any> {
    const detail = errorDetails.FaultyValueError(this.getPathAsStr(), safeToJson(valueOrType), message)
    return this._throwOrResult(detail, FaultyValueError)
  }

  /**
   * Вызывается на типе который не был сконфигурирован {@link NoneModel}.
   */
  throwNotConfiguredError (valueOrType: any, message?: string): TRes<any> {
    const detail = errorDetails.NotConfiguredError(this.getPathAsStr(), safeToJson(valueOrType), message)
    return this._throwOrResult(detail, NotConfiguredError)
  }

  /**
   * Вызывается с параметрами любой ошибки. В основном это для пользовательских валидаторов, для которых ошибки не
   * определены и функция может возвратить неопределенный результат.
   */
  throwCustomError (detail: any | IErrorLike): TRes<any> {
    const errorLike = ensureErrorLike(detail)
    const cls = errorClassByCode(errorLike.code)
    return this._throwOrResult(errorLike, cls)
  }

  /**
   * Вызывается только массивами при установленной опции {@link TOptions.removeFaulty}.
   */
  arrayFaultyValueError (valueOrType: any, message: string): void {
    const detail = errorDetails.FaultyValueError(this.getPathAsStr(), safeToJson(valueOrType), message)
    this.addWarning(detail)
  }

  protected _combineResultWithErrors<T> (result: TResult<T>): void {
    result.ok = false
    if (this._errorDetails.length === 1) {
      result.error = this._errorDetails[0]!
      this.attachWarningDetails(result.error)
    }
    else {
      result.error = errorDetails.FaultyValueError(defaultRootName, safeToJson(result.value), 'Комбинированный результат ошибки неудачной валидации.')
      this.attachErrors(result.error)
    }
  }

  protected _unclearResultWithError<T> (result: TResult<T>): void {
    result.ok = false
    result.error = errorDetails.FaultyValueError(defaultRootName, safeToJson(result.value), 'Результат не вернул причину ошибки.')
    this.attachWarningDetails(result.error)
  }

  /**
   * Вызывается в основной {@link Model.validate()} и возвращает целевой результат с объектом или ошибкой.
   *
   * @param result Результат валидации.
   */
  returnResult<T> (result: TRes<T>): TResult<T> {
    // Если есть ошибки, комбинируем предупреждения в общую ошибку
    if (this._errorDetails.length > 0) {
      this._combineResultWithErrors(result as TResult<T>)
    }
    else if (!result.ok) {
      this._unclearResultWithError(result as TResult<T>)
    }
    else {
      result.ok = true
      if (this._warnDetails.length > 0) {
        (result as TResult<T>).warning = errorDetails.CombinedError('warnings', this._warnDetails)
      }
    }
    return result as TResult<T>
  }
}

export {
  Context
}
