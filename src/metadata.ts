import {
  type JsonPrimitive,
  type JsonLike,
  emptyValue,
  type TEmptyValue,
  type TValueType,
  type TCustomValidate
} from './types.js'
import type { TErrorDetail } from './errors.js'
import type { Re } from './re.js'
import type { Model, UnionModel } from './models.js'
import { isArray, objInArray, plainCopy } from './utils.js'

/**
 * Метаданные типа. Этот класс не проверяет параметры и ожидает валидные значения для всех вызовов или изменений свойств
 * владельцем инстанса.
 */
class Metadata<T> {
  protected readonly _type: TValueType = 'none'
  /**
   * Для разных моделей это свойство имеет схожее значение. Тип этого свойства строго соответствует:
   *
   * + 'none|raw|bool' {@link TEmptyValue} - Не задано
   * + 'num' - `true/false`, `expectedType:true` означает int.
   * + 'str' - Для строк с проверкой регулярными выражениями это {@link Re}[], иначе не задано.
   * + 'literal' - `null|boolean|number|string`. Всегда присутствует значение.
   * + 'enum' - `Set<(null|boolean|number|string)>` - Для списка `enum`. Всегда имеет хотя-бы одно значение.
   * + 'obj|tuple|union|pipe' - {@link Model}[] - Список свойств объектов или массивов. Для 'union' это варианты возможных значений.
   * + `arr` - {@link UnionModel} - Модель для подбора значений.
   * + 'custom' - Пользовательская функция {@link TCustomValidate}.
   */
  expectedType: /* TEmptyValue | */ T = emptyValue as T

  // Эти свойства применяются к числам, строкам и массивам.
  min: null | number = null
  max: null | number = null
  exclusive: boolean = false

  // Зарегистрированные ошибки типа при конфигуририровании.
  protected _errorDetails: null | TErrorDetail[] = null

  constructor(type: TValueType) {
    this._type = type
  }

  get type (): TValueType {
    return this._type
  }

  /**
   * Присутствует ли значение отличное от {@link TEmptyValue}.
   */
  hasExpectedType (): boolean {
    return this.expectedType !== emptyValue
  }

  /**
   * Добавить ошибку вызванную на этапе конфигурации.
   *
   * @param code Код ошибки.
   */
  addConfigError (...details: TErrorDetail[]): void {
    if (!this._errorDetails) {
      this._errorDetails = []
    }
    for (const detail of details) {
      if (!objInArray(this._errorDetails, detail)) {
        this._errorDetails.push(detail)
      }
    }
  }

  /**
   * Возвращает все ошибки и очищает свойство `errorDetails`.
   */
  getErrors (): null | TErrorDetail[] {
    const errors = this._errorDetails
    this._errorDetails = null
    return errors && errors.length > 0 ? errors : null
  }

  /**
   * Возвращает поверхностную копию {@link expectedType}, если он является массивом {@link Model} для соответствующих структур и типов.
   */
  getTypeIfArray (): null | Model<any>[] {
    if (this._type === 'obj' || this._type === 'tuple' || this._type === 'union' || this._type === 'pipe') {
      return [...(this.expectedType as any[])] as Model<any>[]
    }
    return null
  }

  /**
   * Возвращает копию для переопределений модификаторами, такими как `v.min()/v.range(...)` и т.п.
   *
   * Свойство `expectedType` переносится поверхностно, так как оно имеет либо примитив,
   * либо `Re|Model`, который не подлежит копированию пока не вызвана модификация.
   * Модификация `Model` создает новый инстанс и никак не влияет на существующие классы.
   */
  copy (): Metadata<T> {
    const meta = new Metadata<any>(this._type)
    meta._errorDetails = this._errorDetails ? plainCopy(this._errorDetails) : null
    meta.min = this.min
    meta.max = this.max
    meta.exclusive = this.exclusive
    meta.expectedType = (this.expectedType instanceof Set)
      ? new Set(this.expectedType.values())
      : isArray(this.expectedType)
        ? [...this.expectedType] // Model[]|Re[]
        : this.expectedType      // TEmptyValue|null|boolean|number|string|function|UnionModel

    return meta
  }

  static create<T> (type: TValueType): Metadata<T> {
    return new Metadata<T>(type)
  }

  static none (): Metadata<TEmptyValue> {
    return this.create('none')
  }

  static raw (): Metadata<TEmptyValue> {
    return this.create('raw')
  }

  static bool (): Metadata<TEmptyValue> {
    return this.create('bool')
  }

  static num (): Metadata<boolean> {
    const meta = this.create<boolean>('num')
    meta.expectedType = false
    return meta
  }

  static str (): Metadata<TEmptyValue | Re[]> {
    return this.create<TEmptyValue>('str')
  }

  /**
   * Псевдоним {@link Metadata.str()} с одновременной установкой списка {@link Re}[].
   * @param re !!! Непустой массив.
   */
  static re (...re: Re[]): Metadata<Re[]> {
    const meta = this.create<Re[]>('str')
    meta.expectedType = [...re]
    return meta
  }

  static literal<T extends JsonPrimitive> (value: T): Metadata<T> {
    const meta = this.create<T>('literal')
    meta.expectedType = value
    return meta
  }

  /**
   * @param set !!! Непустой Set.
   */
  static enum<T extends JsonPrimitive> (set: Set<T>): Metadata<Set<T>> {
    const meta = this.create<Set<T>>('enum')
    meta.expectedType = set
    return meta
  }

  static obj<T extends JsonLike> (): Metadata<Model<T>[]> {
    const meta = this.create<Model<T>[]>('obj')
    meta.expectedType = []
    return meta
  }

  static arr<T extends JsonLike> (union: null | UnionModel<T>): Metadata<null | UnionModel<T>> {
    const meta = this.create<null | UnionModel<T>>('arr')
    meta.expectedType = union
    return meta
  }

  /**
   * @param values !!! Непустой массив.
   */
  static tuple<T extends JsonLike> (values: Model<T>[]): Metadata<Model<T>[]> {
    const meta = this.create<Model<T>[]>('tuple')
    meta.expectedType = values
    return meta
  }

  /**
   * @param values !!! Непустой массив.
   */
  static union<T extends JsonLike> (values: Model<T>[]): Metadata<Model<T>[]> {
    const meta = this.create<Model<T>[]>('union')
    meta.expectedType = values
    return meta
  }

  static custom<T extends JsonLike> (fun: TCustomValidate<T>): Metadata<TCustomValidate<T>> {
    const meta = this.create<TCustomValidate<T>>('custom')
    meta.expectedType = fun
    return meta
  }

  static pipe<T extends JsonLike> (values: Model<T>[]): Metadata<Model<T>[]> {
    const meta = this.create<Model<T>[]>('pipe')
    meta.expectedType = values
    return meta
  }
}

export {
  Metadata
}
