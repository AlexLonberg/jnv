import type { TPropertyName, TRelease } from './types.js'
import { propertyNameToString } from './utils.js'

type TStackNode<T> = {
  value: T,
  prev: null | TStackNode<T>
}

class SafeStack<T> {
  protected prev: null | TStackNode<T> = null

  /**
   * Добавляет значение в стек и возвращает функцию освобождения.
   *
   * Пользователи стека необязательно должны вызвать {@link TRelease}.
   * Если произошла ошибка, то нижестоящий пользователь высвободит всю ветку над ним.
   *
   * @param value Любое значение.
   */
  push (value: T): TRelease {
    const node: TStackNode<T> = { value, prev: this.prev }
    this.prev = node
    return (() => {
      if (this.prev === node) {
        this.prev = node.prev
      }
      else {
        let current = this.prev?.prev
        while (current) {
          if (current === node) {
            this.prev = current.prev
            return
          }
          current = current.prev
        }
      }
    })
  }

  top (): null | T {
    return this.prev ? this.prev.value : null
  }

  /**
   * Возвращает итератор значений стека в порядке от последнего к первому.
   */
  *values (): Iterable<T> {
    let current = this.prev
    while (current) {
      yield current.value
      current = current.prev
    }
  }

  isEmpty (): boolean {
    return this.prev === null
  }
}

class PathTracker extends SafeStack<TPropertyName> {
  override toString (): string {
    return [...this.values()].reverse().map((v) => propertyNameToString(v)).join('.')
  }

  getPath (): TPropertyName[] {
    return [...this.values()].reverse()
  }
}

export {
  type TStackNode,
  SafeStack,
  PathTracker
}
