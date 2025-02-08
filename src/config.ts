import type { TOptions, TValidateSettings } from './types.js'
import { isString, isPlainObject, plainCopy } from './utils.js'
import { mergeBoolOptions, BoolOptions } from './options.js'

type TConfig = { [K in keyof TOptions]-?: Exclude<TOptions[K], undefined | null> }

// NOTE: Этот тип должен соответствовать всем глобальным параметрам конфигурации
const defaultConfig: TConfig = Object.freeze({
  throwIfConfigureError: false,
  throwIfError: false,
  stopIfError: false,
  removeFaulty: false
} as const)

class Config extends BoolOptions<TConfig> {
  protected readonly _isScope: boolean
  protected readonly _scopeName: string | null = null

  protected constructor(config: TConfig, scopeName?: undefined | null | string) {
    super(config)
    this._isScope = isString(scopeName)
    this._scopeName = this._isScope ? scopeName! : null
  }

  get isScope (): boolean {
    return this._isScope
  }

  get scopeName (): null | string {
    return this._scopeName
  }

  get throwIfConfigureError (): boolean {
    return this._options.throwIfConfigureError
  }

  get throwIfError (): boolean {
    return this._options.throwIfError
  }

  get stopIfError (): boolean {
    return this._options.stopIfError
  }

  get removeFaulty (): boolean {
    return this._options.removeFaulty
  }

  getValidateOptions (): TValidateSettings {
    return {
      stopIfError: this._options.stopIfError,
      removeFaulty: this._options.removeFaulty
    }
  }

  /**
   * Сливает текущие установки с `options`, переименовывает, если установлен `scopeName` и возвращает копию.
   */
  extends (options?: undefined | null | TOptions, scopeName?: undefined | null | string): Config {
    const config = this._mergeOrCopyOptions(options)
    const name = isString(scopeName) ? scopeName : this._scopeName
    return new Config(config, name)
  }

  /**
   * Копия.
   */
  copy (): Config {
    return new Config(plainCopy(this._options), this._scopeName)
  }
}

class DefaultConfig extends Config {
  constructor(options?: undefined | null | TOptions) {
    super(isPlainObject(options) ? mergeBoolOptions(plainCopy(defaultConfig), options) : plainCopy(defaultConfig))
  }
}

export {
  Config,
  DefaultConfig
}
