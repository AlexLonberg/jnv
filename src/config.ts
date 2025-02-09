import type { TOptions, TValidateSettings } from './types.js'
import { hasOwn, isString, isPlainObject, plainCopy } from './utils.js'
import { mergeBoolOrNumOptions, BoolOrNumOptions } from './options.js'

type TConfig = { [K in keyof TOptions]-?: Exclude<TOptions[K], undefined | null | string> }

/**
 * Преобразует строковые значения параметров к числовым флагам.
 */
function transformStringOptions (options: TOptions): { [K in keyof TOptions]-?: Exclude<TOptions[K], string> } {
  if (options && hasOwn(options, 'createMode')) {
    if (options.createMode === 'obj' || options.createMode === 1) {
      options.createMode = 1
    }
    else if (options.createMode === 'arr' || options.createMode === 2) {
      options.createMode = 2
    }
    else if (options.createMode === 'none' || options.createMode === 3) {
      options.createMode = 3
    }
    else {
      options.createMode = 0
    }
  }
  return options as any
}

// NOTE: Этот тип должен соответствовать всем глобальным параметрам конфигурации
const defaultConfig: TConfig = Object.freeze({
  throwIfConfigureError: false,
  createMode: 0,
  throwIfError: false,
  stopIfError: false,
  removeFaulty: false
} as const)

class Config extends BoolOrNumOptions<TConfig> {
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

  get modeCopyObj (): boolean {
    return this._options.createMode === 0 || this._options.createMode === 1
  }

  get modeCopyArr (): boolean {
    return this._options.createMode === 0 || this._options.createMode === 2
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
    const config = this._mergeOrCopyOptions(options ? transformStringOptions(options) : null)
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
    super(isPlainObject(options) ? mergeBoolOrNumOptions(plainCopy(defaultConfig), transformStringOptions(options)) : plainCopy(defaultConfig))
  }
}

export {
  transformStringOptions,
  Config,
  DefaultConfig
}
