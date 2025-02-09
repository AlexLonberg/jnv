import { hasOwn, isBoolean, isIntNonnegative, isPlainObject, plainCopy } from './utils.js'

function mergeBoolOrNumOptions<T extends Record<string, boolean | number>> (target: T, source: { [_ in keyof T]?: undefined | null | boolean | number }): T {
  for (const key of Object.keys(target)) {
    if (hasOwn(source, key) && (isBoolean(source[key]) || isIntNonnegative(source[key]))) {
      (target as any)[key] = source[key]
    }
  }
  return target
}

class BoolOrNumOptions<T extends Record<string, boolean | number>> {
  protected readonly _options: T

  constructor(options: T) {
    this._options = options
  }

  protected _mergeOrCopyOptions (options?: undefined | null | { [_ in keyof T]?: undefined | null | boolean | number }): T {
    const copy = plainCopy(this._options)
    return isPlainObject(options) ? mergeBoolOrNumOptions(copy, options) : copy
  }
}

export {
  mergeBoolOrNumOptions,
  BoolOrNumOptions
}
