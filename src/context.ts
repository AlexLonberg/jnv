import type {
  TRes,
  TRelease,
  TPropertyName,
  TResult,
  TValidateOptions,
  TOptions
} from './types.js'
import {
  type IErrorLike,
  errorDetails,
  RequiredPropertyError,
  FaultyValueError,
  NotConfiguredError,
  getErrorClassByCode
} from './errors.js'
import type { Config } from './config.js'
import type { Settings } from './settings.js'
import type { NoneModel, Model } from './models.js'
import { SafeStack, PathTracker } from './stack.js'
import { objInArray, valueToString } from './utils.js'

/**
 * Контекст процесса валидации.
 *
 * + Все функции `throw*()` вызываются валидаторами значений.
 */
class Context {
  protected readonly _errorDetails: IErrorLike[] = []
  protected readonly _warnDetails: IErrorLike[] = []
  protected readonly _typeMatchingControl = new SafeStack()
  protected readonly _warningControl = new SafeStack()
  protected readonly _stopErrorControl = new SafeStack()
  protected readonly _pathTracker = new PathTracker()
  protected readonly _modelTracker = new SafeStack<{ config: Config, settings: Settings<any> }>()
  protected readonly _config: Config
  protected readonly _settings: Settings<any>

  constructor(config: Config, settings: Settings<any>) {
    this._config = config
    this._settings = settings
  }

  /**
   * Отключить регистрацию ошибок. Регистрация отключается на время подбора значений.
   * Пользователи обязаны своевременно вызывать {@link TRelease} используя `try/finally`.
   */
  enterTypeMatching (): TRelease {
    return this._typeMatchingControl.push(null) // null ничего не означает, это реализация стека требует значения
  }

  /**
   * Регистрировать только предупреждения.
   * Эту функцию использует массив при включении опции {@link Settings.removeFaulty}, для временной регистрации
   * предупреждений при ошибках и получения `{ok: false}` во внутреннем валидаторе.
   */
  enterOnlyWarning (): TRelease {
    return this._warningControl.push(null)
  }

  /**
   * Находится ли процесс валидации в области позволяющей поднять исключение.
   */
  isThrowEnabled (): boolean {
    if (
      !this._typeMatchingControl.isEmpty() ||
      !this._stopErrorControl.isEmpty() ||
      !this._warningControl.isEmpty() ||
      this._settings.stopIfError
    ) {
      return false
    }
    return this._modelTracker.top()?.config.throwIfError ?? this._config.throwIfError
  }

  /**
   * Добавить сегмент пути.
   * Пользователи обязаны своевременно вызывать `TRelease` используя try/finally.
   *
   * @param key Имя свойства или индекс массива.
   */
  pushKey (key: TPropertyName): TRelease {
    return this._pathTracker.push(key)
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
   * @param config   - Конфиг типа.
   * @param settings - Настройки.
   */
  enterModel (config: Config, settings: Settings<any>): TRelease {
    const exitModel = this._modelTracker.push({ config, settings })
    if (settings.stopIfError) {
      const exitScope = this._stopErrorControl.push(null)
      return (() => {
        exitModel()
        exitScope()
      })
    }
    return exitModel
  }

  /**
   * Этот метод используется для регистрации предупреждений попадающих в результат валидации:
   *
   *  + Массивами, через {@link arrayFaultyValueError()}, при включенной настроке {@link TValidateOptions.removeFaulty}.
   *  + Пользовательским валидатором.
   */
  addWarning (detail: IErrorLike): void {
    if (this._typeMatchingControl.isEmpty() && !objInArray(this._warnDetails, detail)) {
      this._warnDetails.push(detail)
    }
  }

  /**
   * Регистрирует ошибку.
   */
  addError (detail: IErrorLike): void {
    if (this._typeMatchingControl.isEmpty()) {
      if (this._stopErrorControl.isEmpty() && this._warningControl.isEmpty()) {
        if (!objInArray(this._errorDetails, detail)) {
          this._errorDetails.push(detail)
        }
      }
      else if (!objInArray(this._warnDetails, detail)) {
        this._warnDetails.push(detail)
      }
    }
  }

  /**
   * Регистрирует ошибку и вызывает исключение или возвращает результат.
   */
  protected _throwOrResult (detail: IErrorLike, cls: (new (detail: IErrorLike) => any)): TRes<any> {
    this.addError(detail)
    if (this.isThrowEnabled()) {
      throw new cls(detail)
    }
    const settings = this._modelTracker.top()?.settings ?? this._settings
    return settings.stopIfError
      ? { ok: true, value: settings.getDefaultValue() }
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
    const detail = errorDetails.FaultyValueError(this.getPathAsStr(), valueToString(valueOrType), message)
    return this._throwOrResult(detail, FaultyValueError)
  }

  /**
   * Вызывается на типе который не был сконфигурирован {@link NoneModel}.
   */
  throwNotConfiguredError (valueOrType: any, message?: string): TRes<any> {
    const detail = errorDetails.NotConfiguredError(this.getPathAsStr(), valueToString(valueOrType), message)
    return this._throwOrResult(detail, NotConfiguredError)
  }

  /**
   * Вызывается с параметрами любой ошибки. В основном это для пользовательских валидаторов, для которых ошибки не определены.
   */
  throwCustomError (detail: null | IErrorLike): TRes<any> {
    if (!detail) {
      detail = errorDetails.UnknownError(this.getPathAsStr())
    }
    const cls = getErrorClassByCode(detail.code)
    return this._throwOrResult(detail, cls)
  }

  /**
   * Вызывается только массивами при установленной опции {@link TOptions.removeFaulty}.
   */
  arrayFaultyValueError (valueOrType: any): void {
    const detail = errorDetails.FaultyValueError(this.getPathAsStr(), valueToString(valueOrType), 'Элемент массива проигнорирован.')
    this.addWarning(detail)
  }

  collectErrors (): null | { errors?: IErrorLike[], warnings?: IErrorLike[] } {
    let details: null | { errors?: IErrorLike[], warnings?: IErrorLike[] } = null
    if (this._errorDetails.length > 0) {
      details = { errors: this._errorDetails }
    }
    if (this._warnDetails.length > 0) {
      if (details) {
        details.warnings = this._warnDetails
      }
      else {
        details = { warnings: this._warnDetails }
      }
    }
    return details
  }

  protected _unclearResult<T extends ({ ok: true, details: { errors: IErrorLike[], warnings?: IErrorLike[] } } | { ok: false, details?: { errors?: IErrorLike[], warnings?: IErrorLike[] } })> (result: T): void {
    if (result.ok) {
      const warnings = [errorDetails.UnknownError('', "Неожиданное наличие ошибок в 'details.errors'")]
      warnings.push(...result.details.errors)
      if (result.details.warnings) {
        warnings.push(...(result as any).details.warnings)
      }
      (result as any).details = { warnings }
    }
    else {
      if (!result.details) {
        result.details = { errors: [] }
      }
      result.details!.errors!.unshift(errorDetails.UnknownError('', "Неожиданное отсутствие ошибки в 'details.errors'"))
    }
  }

  /**
   * Вызывается в основной {@link Model.validate()} и возвращает целевой результат с объектом или ошибкой.
   *
   * @param result Результат последней операции валидации.
   */
  returnResult<T> (result: TRes<T>): TResult<T> {
    const details = this.collectErrors()
    if (details) {
      // @ts-expect-error
      result.details = details
    }
    // TODO Систему регистрации ошибок следует хорошо перепроверить на всех сценариях.
    //      Важно, чтобы при ok:true, здесь не было ни одно details.errors
    if ((result.ok && (result as any).details?.errors) || (!result.ok && !(result as any).details?.errors)) {
      this._unclearResult(result as any)
    }
    return result as TResult<T>
  }
}

export {
  Context
}
