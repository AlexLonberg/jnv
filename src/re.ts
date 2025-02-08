import { copyRegExp } from './utils.js'

/**
 * Обертка над `RegExp`.
 */
class Re {
  private readonly _re: RegExp

  constructor(re: RegExp) {
    this._re = re
  }

  _regExp (): RegExp {
    return this._re
  }

  _isEquals (source: string, flags: string): boolean {
    return (this._re.source === source && this._re.flags === flags)
  }

  get re (): RegExp {
    this._re.lastIndex = 0
    return this._re
  }

  test (value: string): boolean {
    return this.re.test(value)
  }
}

/**
 * Вспомогательный кеш для `RegExp`.
 */
class RegExpCache {
  readonly _cache: Re[] = []

  getOf (re: RegExp): Re {
    const source = re.source
    const flags = re.flags
    for (const item of this._cache) {
      if (re === item._regExp() || item._isEquals(source, flags)) {
        return item
      }
    }
    const copy = copyRegExp(re)
    copy.lastIndex = 0
    const wrapper = new Re(copy)
    this._cache.push(wrapper)
    return wrapper
  }
}

export {
  Re,
  RegExpCache
}
