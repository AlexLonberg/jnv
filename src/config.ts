import type { TOptions, TModelOptions } from './types.js'
import { hasOwn, isPlainObject, plainCopy, mergeBoolOrIntProperties } from './utils.js'

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

class Config {
  protected readonly _options: TConfig

  constructor(options?: undefined | null | TOptions) {
    this._options = isPlainObject(options) ? mergeBoolOrIntProperties(plainCopy(defaultConfig), transformStringOptions(plainCopy(options))) : plainCopy(defaultConfig)
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

  getModelOptions (): Pick<TModelOptions, 'stopIfError' | 'removeFaulty'> {
    return {
      stopIfError: this._options.stopIfError,
      removeFaulty: this._options.removeFaulty
    }
  }
}

export {
  transformStringOptions,
  Config
}
