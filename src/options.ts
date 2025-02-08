import { hasOwn, isBoolean, isPlainObject, plainCopy } from './utils.js'

function mergeBoolOptions<T extends Record<string, boolean>> (target: T, source: { [_ in keyof T]?: undefined | null | boolean }): T {
  for (const key of Object.keys(target)) {
    if (hasOwn(source, key) && isBoolean(source[key])) {
      (target as any)[key] = source[key]
    }
  }
  return target
}

class BoolOptions<T extends Record<string, boolean>> {
  protected readonly _options: T

  constructor(options: T) {
    this._options = options
  }

  protected _mergeOrCopyOptions (options?: undefined | null | { [_ in keyof T]?: undefined | null | boolean }): T {
    const copy = plainCopy(this._options)
    return isPlainObject(options) ? mergeBoolOptions(copy, options) : copy
  }
}

export {
  mergeBoolOptions,
  BoolOptions
}
