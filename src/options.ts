import { type TEmptyValue, type TModelOptions, emptyValue } from './types.js'
import { isPlainObject, plainCopy, mergeBoolOrIntProperties } from './utils.js'

const extendMarker = Symbol()

type TModelOptionsPartial = { [K in keyof TModelOptions]?: undefined | null | TModelOptions[K] }

const defaultSettings: TModelOptions = Object.freeze({
  stopIfError: false,
  removeFaulty: false,
  optional: false
} as const)

class Options<T> {
  // NOTE Этот параметр должен устанавливаться только в одной централизованной функции. При копировании объекта он сбрасывается.
  protected _readonlyFrozen: boolean = false
  protected _readonlyModelName: null | string = null
  protected readonly _options: TModelOptions
  protected _defaultValue: TEmptyValue | null | T

  constructor(
    options?: undefined | null | TModelOptionsPartial,
    defaultValue?: undefined | null | { value: T },
    marker?: undefined | null | typeof extendMarker
  ) {
    this._options = marker === extendMarker
      ? options as TModelOptions
      : isPlainObject(options) ? mergeBoolOrIntProperties(plainCopy(defaultSettings), options) : plainCopy(defaultSettings)
    this._defaultValue = defaultValue ? plainCopy(defaultValue.value) : emptyValue
  }

  get readonlyFrozen (): boolean {
    return this._readonlyFrozen
  }

  get readonlyModelName (): null | string {
    return this._readonlyModelName
  }

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
    return this._defaultValue !== emptyValue
  }

  /**
   * Сравнимает значение по умолчанию строгим равенством.
   */
  isEqualDefaultValue (value: any): boolean {
    return this._defaultValue === value
  }

  /**
   * Перед вызовом этого метода стоит проверит {@link hasDefaultValue()}.
   * Функция возвратит `null`, если значение по умолчанию не определено.
   */
  getDefaultValue (): unknown {
    return this._defaultValue === emptyValue ? null : plainCopy(this._defaultValue)
  }

  /**
   * Глубокая копия без установки {@link readonlyFrozen}.
   */
  extend<N = T> (
    options?: undefined | null | TModelOptionsPartial,
    defaultValue?: undefined | null | { value: N }
  ): Options<N> {
    const selfOptions = plainCopy(this._options)
    const customOptions = isPlainObject(options) ? mergeBoolOrIntProperties(selfOptions, options) : selfOptions
    const def = defaultValue ?? (this.hasDefaultValue() ? { value: this._defaultValue as N } : null)
    return new Options(customOptions, def, extendMarker)
  }
}

export {
  Options
}
