import { type TEmptyValue, type TModelOptions, EMPTY_VALUE } from './types.js'
import { isPlainObject, plainCopy, mergeBoolOrUIntProperties } from './utils.js'

const _extendMarker = Symbol()

type TModelOptionsPartial = { [K in keyof TModelOptions]?: undefined | null | TModelOptions[K] }

const defaultSettings: TModelOptions = Object.freeze({
  stopIfError: false,
  removeFaulty: false,
  optional: false
} as const)

class Options<T> {
  // NOTE Параметры _readonlyFrozen и _readonlyModelName должны устанавливаться только в одной централизованной функции.
  // При копировании объекта они сбрасываются.
  protected _readonlyFrozen: boolean = false
  protected _readonlyModelName: null | string = null
  protected readonly _options: TModelOptions
  protected readonly _defaultValue: TEmptyValue | null | T

  /**
   * @param options      Опциональные параметры.
   * @param defaultValue Значение по умолчанию может быть передано, только в обертке `{value: T}`.
   * @param marker       Маркер не доступен для пользовательского ввода и используется совместно с методом {@link extend()}.
   */
  constructor(
    options?: undefined | null | TModelOptionsPartial,
    defaultValue?: undefined | null | { value: T },
    marker?: undefined | null | typeof _extendMarker
  ) {
    this._options = marker === _extendMarker
      ? options as TModelOptions
      : isPlainObject(options) ? mergeBoolOrUIntProperties(plainCopy(defaultSettings), options) : plainCopy(defaultSettings)
    this._defaultValue = defaultValue ? plainCopy(defaultValue.value) : EMPTY_VALUE
  }

  get readonlyFrozen (): boolean {
    return this._readonlyFrozen
  }

  get readonlyModelName (): null | string {
    return this._readonlyModelName
  }

  /**
   * Устанавливает флаг заморозки и имя модели.
   *
   * Должен вызываться только один раз при замороке модели. Внутри этого метода проверки {@link readonlyFrozen} не
   * проводится. Предполагается, что метод вызывается централизованно в функции заморозки модели.
   *
   * @param name Имя модели или `null`.
   */
  _freeze (name: null | string): void {
    this._readonlyFrozen = true
    this._readonlyModelName = name
  }

  get stopIfError (): boolean {
    return this._options.stopIfError
  }

  get removeFaulty (): boolean {
    return this._options.removeFaulty
  }

  get optional (): boolean {
    return this._options.optional
  }

  /**
   * Проверяет было ли установлено любое значение по умолчанию.
   */
  hasDefaultValue (): boolean {
    return this._defaultValue !== EMPTY_VALUE
  }

  /**
   * Сравнивает значение по умолчанию строгим равенством.
   */
  isEqualDefaultValue (value: any): boolean {
    return this._defaultValue === value
  }

  /**
   * Возвращает значение по умолчанию или `null`.
   *
   * **Note:** Значением по умолчанию может быть `null`. Перед вызовом этой функции следует проверить {@link hasDefaultValue()}.
   */
  getDefaultValue (): unknown {
    return this._defaultValue === EMPTY_VALUE ? null : plainCopy(this._defaultValue)
  }

  /**
   * Копия параметров с расширением опциями `options` и без установки {@link readonlyFrozen} и {@link readonlyModelName}.
   *
   * @param options      Опции для слияния.
   * @param defaultValue Значение по умолчанию может быть передано, только в обертке `{value: T}`.
   */
  extend<N = T> (
    options?: undefined | null | TModelOptionsPartial,
    defaultValue?: undefined | null | { value: N }
  ): Options<N> {
    const selfOptions = plainCopy(this._options)
    const customOptions = isPlainObject(options) ? mergeBoolOrUIntProperties(selfOptions, options) : selfOptions
    const def = defaultValue ?? (this.hasDefaultValue() ? { value: this._defaultValue as N } : null)
    return new Options(customOptions, def, _extendMarker)
  }
}

export {
  Options
}
