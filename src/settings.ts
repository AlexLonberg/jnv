import { type TEmptyValue, type TValidateSettings, emptyValue } from './types.js'
import { isPlainObject, plainCopy } from './utils.js'
import { mergeBoolOrNumOptions, BoolOrNumOptions } from './options.js'

type TSettings = TValidateSettings & { optional: boolean }
type TSettingsPartial = { [K in keyof TSettings]?: undefined | null | TSettings[K] }

const defaultSettings: TSettings = Object.freeze({
  stopIfError: false,
  removeFaulty: false,
  optional: false
} as const)

class Settings<T> extends BoolOrNumOptions<TSettings> {
  // NOTE Этот параметр должен устанавливаться только в одной централизованной функции. При копировании объекта он сбрасывается.
  protected _readonlyFrozen: boolean = false
  protected _defaultValue: TEmptyValue | null | T

  protected constructor(options: TSettings, defaultValue: null | { value: T }) {
    super(options)
    this._defaultValue = defaultValue ? plainCopy(defaultValue.value) : emptyValue
  }

  get readonlyFrozen (): boolean {
    return this._readonlyFrozen
  }

  _freeze (): void {
    this._readonlyFrozen = true
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
  getDefaultValue (): any {
    return this._defaultValue === emptyValue ? null : plainCopy(this._defaultValue)
  }

  /**
   * Глубокая копия без установки readonlyFrozen.
   */
  copy<N = T> (
    options?: undefined | null | TSettingsPartial,
    defaultValue?: undefined | null | { value: N }
  ): Settings<N> {
    const settings = this._mergeOrCopyOptions(options)
    const def = defaultValue ?? (this.hasDefaultValue() ? { value: this._defaultValue as N } : null)
    return new Settings(settings, def)
  }
}

class DefaultSettings<T> extends Settings<T> {
  constructor(
    options?: undefined | null | TSettingsPartial,
    defaultValue?: undefined | null | { value: T }
  ) {
    super(
      isPlainObject(options) ? mergeBoolOrNumOptions(plainCopy(defaultSettings), options) : plainCopy(defaultSettings),
      defaultValue ?? null
    )
  }
}

export {
  Settings,
  DefaultSettings
}
