import type {
  JsonPrimitive,
  JsonObject,
  JsonArray,
  JsonLike,
  TRes,
  TPropertyName,
  TResult,
  TCustomValidate,
  TValidateOptions,
  TOptions
} from './types.js'
import {
  isUndefined,
  isBoolean,
  isObject,
  isPlainObject,
  isArray,
  isFunction,
  isNumber,
  isInt,
  isString,
  isJsonPrimitive,
  hasOwn,
  propertyNameToString,
  valueToString,
  messageFromError
} from './utils.js'
import {
  errorCodes,
  type TErrorDetail,
  errorMessages,
  ValidatorError,
  UnknownError,
  ConfigureError,
  ModelIsFrozenError
} from './errors.js'
import { type Re, RegExpCache } from './re.js'
import { Config, DefaultConfig } from './config.js'
import { Metadata } from './metadata.js'
import { type Settings, DefaultSettings } from './settings.js'
import { Context } from './context.js'
import type {
  UJsonLiteralFilter,
  UJsonObjectFilter,
  UJsonArrayFilter,
  UJsonMultiFilter,
  UJsonPipeLast
} from './filters.js'

type TModelLiteral = (JsonPrimitive | LiteralModel<JsonPrimitive> | EnumModel<JsonPrimitive>)
type TModelPrimitive = (TModelLiteral | RegExp | BoolModel | NumModel | StrModel | UnionModel<JsonPrimitive>)
type TModelObject = { [k: string]: TModelLike }
type TModelArray = TModelLike[]
type TModelLike = (TModelPrimitive | TModelObject | TModelArray | PipeModel<JsonLike> | RawModel | ObjModel<JsonObject> | ArrModel<JsonArray> | TupleModel<JsonArray> | UnionModel<JsonLike> | CustomModel<JsonLike>)

const PROP_METADATA = Symbol()
function privatePropertyMetadata<T> (model: Model<any>): Metadata<T> {
  return model[PROP_METADATA]()
}

const PROP_SETTINGS = Symbol()
function privatePropertySettings<T extends JsonLike> (model: Model<any>): Settings<T> {
  return model[PROP_SETTINGS]()
}

const SHALLOW_COPY = Symbol()
function privateShallowCopyWithName<T extends Model<any>> (model: T, name: TPropertyName): T {
  return model[SHALLOW_COPY](name)
}

const VALIDATE = Symbol()
function privateValidate<T extends Model<any>> (model: T, ctx: Context, value: any): TRes<any> {
  return model[VALIDATE](ctx, value)
}

/**
 * Сливает уникальные значения из литералов и {@link EnumModel} типов.
 */
function mergeEnum (...values: TModelLiteral[]): { set: Set<JsonPrimitive>, faultyValues: Set<any> | null } {
  const faultyValues = new Set()
  const set: JsonPrimitive[] = []
  for (const item of values) {
    if (item instanceof LiteralModel) {
      const meta = privatePropertyMetadata<JsonPrimitive>(item)
      set.push(meta.expectedType)
    }
    else if (item instanceof EnumModel) {
      const meta = privatePropertyMetadata<Set<JsonPrimitive>>(item)
      set.push(...meta.expectedType.values())
    }
    else if (isJsonPrimitive(item)) {
      set.push(item)
    }
    else {
      faultyValues.add(item)
    }
  }
  return { set: new Set(set), faultyValues: faultyValues.size > 0 ? faultyValues : null }
}

/**
 * Базовый объект валидатора.
 */
abstract class Model<T extends JsonLike> {
  protected readonly _config: Config
  protected readonly _meta: Metadata<any>
  protected readonly _settings: Settings<T>
  protected readonly _key: TPropertyName

  constructor(config: Config, meta: Metadata<any>, settings: Settings<T>, key: TPropertyName) {
    this._config = config
    this._meta = meta
    this._settings = settings
    this._key = key
  }

  protected _collectConfigureError (path: TPropertyName[], err: TErrorDetail[]): void {
    const extendsPath = [...path, this._key]
    const errors = this._meta.getErrors()
    if (errors) {
      const path = extendsPath.map((p) => propertyNameToString(p)).join('.')
      for (const item of errors) {
        item.path = path
        err.push(item)
      }
    }
    const children = this._meta.getTypeIfArray()
    if (children) {
      for (const item of children) {
        item._collectConfigureError(extendsPath, err)
      }
    }
  }

  /**
   * Возвращает все ошибки произошедшие в процессе конфигурирования текущего типа и дочерних элементов.
   */
  getConfigureError (): null | TErrorDetail[] {
    const errors: TErrorDetail[] = []
    this._collectConfigureError([], errors)
    return errors.length > 0 ? errors : null
  }

  /**
   * Имя области определенной методом {@link Factory.scope()}.
   */
  get scopeName (): null | string {
    return this._config.scopeName
  }

  /**
   * Имя свойства. Это может быть как `number` для массива, так и `string` для объекта. Для корневого объекта это всегда `null`.
   */
  get key (): TPropertyName {
    return this._key
  }

  [PROP_METADATA] (): Metadata<any> {
    return this._meta
  }

  [PROP_SETTINGS] (): Settings<T> {
    return this._settings
  }

  protected _throwIfConfigureError (message?: string): void {
    const detail = errorMessages.ConfigureError(this._key, message)
    this._meta.addConfigError(detail)
    if (this._config.throwIfConfigureError) {
      throw new ConfigureError(detail.message, detail.path)
    }
  }

  protected _throwIfFrozen (): boolean {
    if (this.isFrozen()) {
      const detail = errorMessages.ModelIsFrozenError(this._key)
      this._meta.addConfigError(detail)
      if (this._config.throwIfConfigureError) {
        throw new ModelIsFrozenError(detail.message, detail.path)
      }
      return true
    }
    return false
  }

  /**
   * Заморожена ли модель для дальнейших модификаций.
   */
  isFrozen (): boolean {
    return this._settings.readonlyFrozen
  }

  /**
   * Запрещает дальнейшие преобразования.
   *
   * Замороженный объект имеет только методы {@link Model.validate()}, {@link Model.copy()} и {@link Model.typeGuard()}.
   * Копирование сбрасывает заморозку для копии.
   */
  freeze<Target extends JsonLike = T> (): Model<Target> {
    const settings = this._settings.copy()
    settings._freeze()
    return this._copyWith(null, null, settings) as unknown as Model<Target>
  }

  /**
   * Этот метод ничего не делает и лишь возвращает тип {@link Model} с предпочитаемым типом.
   * Используйте это метод когда невозможно вывести тип для результата преобразования.
   */
  typeGuard<Target extends JsonLike> (): Model<Target> {
    return this as unknown as Model<Target>
  }

  protected _validateHandleError<Target extends JsonLike> (ctx: Context, e: any): TResult<Target> {
    if (ctx.isThrowEnabled()) {
      if (e instanceof ValidatorError) {
        throw e
      }
      throw new UnknownError(messageFromError(e) ?? '', ctx.getPathAsStr())
    }
    const result = { ok: false, value: null, details: ctx.collectErrors() } as any
    if (!result.details) {
      result.details = { errors: [errorMessages.UnknownError(ctx.getPathAsStr())] }
    }
    else if (!result.details.errors) {
      result.details.errors = [errorMessages.UnknownError(ctx.getPathAsStr())]
    }
    return result
  }

  /**
   * Валидирует/трансформирует целевое значение.
   *
   * @param value Исходное значение.
   */
  validate<Target extends JsonLike = T> (value: any): TResult<Target> {
    const ctx = new Context(this._config, this._settings)
    try {
      ctx.pushKey(this.key) // вызывать release() здесь нет смысла
      return ctx.returnResult<Target>(this[VALIDATE](ctx, value) as TRes<Target>)
    } catch (e) {
      return this._validateHandleError<Target>(ctx, e)
    }
  }

  [VALIDATE] (ctx: Context, value: any): TRes<T> {
    const exitModel = ctx.enterModel(this._config, this._settings)
    try {
      return this._validate(ctx, value)
    } finally {
      exitModel()
    }
  }

  protected abstract _validate (ctx: Context, value: any): TRes<T>

  /**
   * Возвращает копию типа. Этот метод сбрасывает флаг установленный методом {@link freeze()} для новой копии текущего типа.
   */
  copy (): this {
    return this._copyWith(this._config.copy(), this._meta.copy(), this._settings.copy())
  }

  /**
   * Копирование только с явно установленными типами параметров.
   * Для изменения параметров meta, вызываем _copyWith(null, meta.copy(...), null), и т.п.
   */
  protected _copyWith (config: null | Config, meta: null | Metadata<T>, settings: null | Settings<T>): this {
    return new (this.constructor as (new (...args: any[]) => this))(
      config ?? this._config, meta ?? this._meta, settings ?? this._settings, this._key
    )
  }

  /**
   * Этот метод применяется для переопределения имен ключей объектов при обходе структур и массивов.
   * Он полностью сохраняет ссылки на неизмененные настройки и оборачивает модель с новым именем.
   */
  [SHALLOW_COPY] (name: TPropertyName): this {
    return new (this.constructor as (new (...args: any[]) => this))(this._config, this._meta, this._settings, name)
  }

  /**
   * Создает цепочку валидаторов, которая одновременно может преобразовать объект.
   */
  pipe<Target extends JsonLike = T> (...models: [...Model<JsonLike>[], Model<Target>]): PipeModel<Target> {
    const validators: Model<any>[] = [privateShallowCopyWithName(this, null)]
    for (const item of models) {
      validators.push(privateShallowCopyWithName(item, null))
    }
    const meta = Metadata.pipe(validators)
    return new PipeModel<Target>(this._config, meta, this._settings as Settings<any>, this._key)
  }
}

abstract class BaseModel<T extends JsonLike> extends Model<T> {
  /**
   * Остановить распространение ошибки для этой модели и установить значение по умолчанию или `null`.
   * Эта опция позволяет не вызывать ошибок во вложенных узлах моделей.
   *
   * Результат будет содержать предупреждения о замене.
   */
  stopError (): this {
    if (this._settings.stopIfError || this._throwIfFrozen()) {
      return this
    }
    return this._copyWith(null, null, this._settings.copy({ stopIfError: true }))
  }

  /**
   * Установить/заменить значение по умолчанию.
   *
   * @param defaultValue Любое значение. Обратите внимание: Это значение может быть любым, а не только {@link JsonLike}.
   */
  def (defaultValue: null | any): this {
    if (this._settings.isEqualDefaultValue(defaultValue) || this._throwIfFrozen()) {
      return this
    }
    return this._copyWith(null, null, this._settings.copy(null, { value: defaultValue }))
  }

  /**
   * Установить флаг необязательного свойства.
   *
   * @param defaultValue Необязательное значение по умолчанию для отсутствующего свойства.
   */
  optional (defaultValue?: undefined | null | T): this {
    if ((this._settings.optional && (isUndefined(defaultValue) || this._settings.isEqualDefaultValue(defaultValue))) || this._throwIfFrozen()) {
      return this
    }
    const settings = this._settings.copy({ optional: true }, isUndefined(defaultValue) ? null : { value: defaultValue })
    return this._copyWith(null, null, settings as Settings<T>)
  }
}

abstract class BaseRangeModel<T extends JsonLike> extends BaseModel<T> {
  /**
   * Устанавливает минимальное значение 1:
   *
   * + Для числа(num) это positive()
   * + Для строки(str/re) nonempty()
   * + Для массива(arr) nonempty()
   */
  protected _setIntAndMin1 (): this {
    if (
      (this._meta.min === 1 && this._meta.max === null && this._meta.exclusive === false &&
        (this._meta.type !== 'num' || this._meta.expectedType)
      ) || this._throwIfFrozen()) {
      return this
    }
    const copy = this._meta.copy()
    copy.min = 1
    copy.max = null
    copy.exclusive = false
    if (this._meta.type === 'num') {
      copy.expectedType = true
    }
    return this._copyWith(null, copy, null)
  }

  /**
   * Установить Metadata.min/exclusive
   * Для строк и массивов проверяется минимальное, которое не должно быть < 0.
   */
  protected _setMin (min: number, exclusive?: undefined | null | boolean): this {
    const excl = isBoolean(exclusive) ? exclusive : this._meta.exclusive
    if ((this._meta.min === min && this._meta.exclusive === excl) || this._throwIfFrozen()) {
      return this
    }
    if (
      (this._meta.max !== null && min > this._meta.max) ||
      ((this._meta.type === 'str' || this._meta.type === 'arr') && (min < 0))
    ) {
      this._throwIfConfigureError(`Ошибочные аргументы min(min: ${valueToString(min)})`)
      return this
    }
    const copy = this._meta.copy()
    copy.min = min
    copy.exclusive = excl
    return this._copyWith(null, copy, null)
  }

  /**
   * Установить Metadata.max/exclusive
   * Для строк и массивов проверяется max, которое не должно быть < 0.
   */
  protected _setMax (max: number, exclusive?: undefined | null | boolean): this {
    const excl = isBoolean(exclusive) ? exclusive : this._meta.exclusive
    if ((this._meta.max === max && this._meta.exclusive === excl) || this._throwIfFrozen()) {
      return this
    }
    if (
      (this._meta.min !== null && max < this._meta.min) ||
      ((this._meta.type === 'str' || this._meta.type === 'arr') && (max < 0))
    ) {
      this._throwIfConfigureError(`Ошибочные аргументы max(max: ${valueToString(max)})`)
      return this
    }
    const copy = this._meta.copy()
    copy.max = max
    copy.exclusive = excl
    return this._copyWith(null, copy, null)
  }

  /**
   * Допустимый диапазон Metadata.min/max.
   * Для str/re и arr проверяется минимальное, которое не должно быть < 0.
   */
  protected _setRange (min: number, max: number, exclusive?: undefined | null | boolean): this {
    const excl = isBoolean(exclusive) ? exclusive : this._meta.exclusive
    if ((this._meta.min === min && this._meta.max === max && this._meta.exclusive === excl) || this._throwIfFrozen()) {
      return this
    }
    if ((max < min) || ((this._meta.type === 'str' || this._meta.type === 'arr') && (min < 0 || max < 0))) {
      this._throwIfConfigureError(`Ошибочные аргументы range(min: ${valueToString(min)}, max: ${valueToString(max)})`)
      return this
    }
    const copy = this._meta.copy()
    copy.min = min
    copy.max = max
    copy.exclusive = excl
    return this._copyWith(null, copy, null)
  }

  /**
   * Проверяет диапазон для установленных min/max. Для строк и массивов следует передать длину.
   * + 0 - Проверка успешна или не нужна.
   * + 1 - Ошибка min
   * + 2 - Ошибка max
   */
  protected _checkMinMax (value: number): 0 | 1 | 2 {
    if (this._meta.min !== null) {
      if (this._meta.exclusive ? value <= this._meta.min : value < this._meta.min) {
        return 1
      }
    }
    if (this._meta.max !== null) {
      if (this._meta.exclusive ? value >= this._meta.max : value > this._meta.max) {
        return 2
      }
    }
    return 0
  }

  /**
   * Минимальное значение числа, количество символов строки или элементов массива.
   *
   * @param min Минимальное.
   * @param exclusive Не включая пороговые значения `min/max`.
   */
  min (min: number, exclusive?: undefined | null | boolean): this {
    return this._setMin(min, exclusive)
  }

  /**
   * Максимальное значение числа, количество символов строки или элементов массива.
   *
   * @param max Максимальное.
   * @param exclusive Не включая пороговые значения `min/max`.
   */
  max (max: number, exclusive?: undefined | null | boolean): this {
    return this._setMax(max, exclusive)
  }

  /**
   * Допустимый диапазон числа, количества символов строки или элементов массива.
   *
   * @param min Минимальное.
   * @param max максимальное.
   * @param exclusive Не включая пороговые значения `min/max`.
   */
  range (min: number, max: number, exclusive?: undefined | null | boolean): this {
    return this._setRange(min, max, exclusive)
  }
}

class PipeModel<T extends JsonLike> extends BaseModel<T> {
  protected override _validate (ctx: Context, value: any): TRes<any> {
    const expectedType = this._meta.expectedType as Model<any>[]
    for (const item of expectedType) {
      const { ok, value: v } = privateValidate(item, ctx, value)
      if (ok) {
        value = v
      }
      else {
        return ctx.throwFaultyValueError(value, 'Не удалось трансформировать pipe(model).')
      }
    }
    return { ok: true, value }
  }
}

class NoneModel extends BaseModel<any> {
  protected override _validate (ctx: Context, value: any): TRes<any> {
    return ctx.throwNotConfiguredError(value)
  }
}

class RawModel extends BaseModel<JsonLike> {
  protected override _validate (_ctx: Context, value: any): TRes<JsonLike> {
    return { ok: true, value }
  }
}

class CustomModel<T extends JsonLike> extends BaseModel<T> {
  protected _registerErrorDetails (ctx: Context, details: { errors?: TErrorDetail[], warnings?: TErrorDetail[] }): null | TErrorDetail {
    let item: TErrorDetail | null = null
    const codes = Object.values(errorCodes)
    const add = (method: 'addWarning' | 'addError', array: TErrorDetail[]) => {
      for (const detail of array) {
        const code = detail.code ?? 0
        item = {
          code: codes.includes(code) ? code : 0,
          path: ctx.getPathAsStr(),
          message: detail.message ?? 'Non message'
        }
        ctx[method](item)
      }
    }
    if (isArray(details.warnings)) {
      add('addWarning', details.warnings)
    }
    item = null
    if (isArray(details.errors)) {
      add('addError', details.errors)
    }
    return item
  }

  protected override _validate (ctx: Context, value: any): TRes<T> {
    const result = (this._meta as unknown as Metadata<TCustomValidate<T>>).expectedType(ctx.getPath(), value)
    let ok = result.ok
    let error = null
    if (isPlainObject(result.details)) {
      error = this._registerErrorDetails(ctx, result.details)
      if (error) {
        ok = false
      }
    }
    return ok ? { ok, value: result.value } : ctx.throwCustomError(error)
  }
}

class BoolModel extends BaseModel<boolean> {
  protected override _validate (ctx: Context, value: any): TRes<boolean> {
    return isBoolean(value) ? { ok: true, value } : ctx.throwFaultyValueError(value, 'Ожидался type boolean.')
  }
}

class NumModel extends BaseRangeModel<number> {
  /**
   * Допускать только {@link Number.isInteger()} значения.
   */
  int (): NumModel {
    if (this._meta.expectedType || this._throwIfFrozen()) {
      return this
    }
    const copy = this._meta.copy()
    copy.expectedType = true
    return this._copyWith(null, copy, null)
  }

  /**
   * Установить флаги {@link NumModel.int()} и {@link NumModel.min()}.
   * Используйте этот тип для `id > 0`.
   */
  positive (): NumModel {
    return this._setIntAndMin1()
  }

  protected override _validate (ctx: Context, value: any): TRes<number> {
    if (this._meta.expectedType ? !isInt(value) : !isNumber(value)) {
      return ctx.throwFaultyValueError(value, `Ожидался type number${this._meta.expectedType ? '(int)' : ''}.`)
    }
    const result = this._checkMinMax(value)
    if (result === 1) {
      return ctx.throwFaultyValueError(value, `Недопустимый диапазон, min:${this._meta.min}, value: ${valueToString(value)}`)
    }
    if (result === 2) {
      return ctx.throwFaultyValueError(value, `Недопустимый диапазон, max:${this._meta.max}, value: ${valueToString(value)}`)
    }
    return { ok: true, value }
  }
}

class StrModel extends BaseRangeModel<string> {
  /**
   * Непустая строка.
   */
  nonempty (): this {
    return this._setIntAndMin1()
  }

  protected override _validate (ctx: Context, value: any): TRes<string> {
    if (!isString(value)) {
      return ctx.throwFaultyValueError(value, 'Ожидался type string.')
    }
    const result = this._checkMinMax(value.length)
    if (result === 1) {
      return ctx.throwFaultyValueError(value, `Количество символов строки не соответствует ожидаемому, min:${this._meta.min}, value: ${valueToString(value)}`)
    }
    if (result === 2) {
      return ctx.throwFaultyValueError(value, `Количество символов строки не соответствует ожидаемому, max:${this._meta.max}, value: ${valueToString(value)}`)
    }
    const meta = (this._meta as Metadata<Re[]>)
    if (!meta.hasExpectedType()) {
      return { ok: true, value }
    }
    for (const re of meta.expectedType) {
      if (re.test(value)) {
        return { ok: true, value }
      }
    }
    return ctx.throwFaultyValueError(value, 'Не найдено ни одного совпадения с RegExp.')
  }
}

class LiteralModel<T extends JsonPrimitive> extends BaseModel<T> {
  protected override _validate (ctx: Context, value: any): TRes<T> {
    return (this._meta as Metadata<JsonPrimitive>).expectedType === value ? { ok: true, value } : ctx.throwFaultyValueError(value)
  }
}

class EnumModel<T extends JsonPrimitive> extends BaseModel<T> {
  protected override _validate (ctx: Context, value: any): TRes<T> {
    return (this._meta as Metadata<Set<JsonPrimitive>>).expectedType.has(value) ? { ok: true, value } : ctx.throwFaultyValueError(value)
  }
}

class ObjModel<T extends JsonObject> extends BaseModel<T> {
  protected override _validate (ctx: Context, value: any): TRes<T> {
    if (!isPlainObject(value)) {
      return ctx.throwFaultyValueError(value, 'Ожидался Plain Object.')
    }

    const target = {} as any
    const expectedType = (this._meta as Metadata<Model<any>[]>).expectedType
    for (const model of expectedType) {
      const key = model.key as string
      const settings = privatePropertySettings(model)
      const releaseKey = ctx.pushKey(key)
      try {
        if (hasOwn(value, key)) {
          const { ok, value: v } = privateValidate(model, ctx, value[key])
          if (!ok) {
            return ctx.throwFaultyValueError(value[key], 'Неудачная валидация свойства объекта.')
          }
          target[key] = v
        }
        else if (settings.optional) {
          if (settings.hasDefaultValue()) {
            target[key] = settings.getDefaultValue()
          }
        }
        else {
          return ctx.throwRequiredPropertyError(key)
        }
      } finally {
        releaseKey()
      }
    }
    return { ok: true, value: target }
  }
}

class ArrModel<T extends JsonArray> extends BaseRangeModel<T> {
  /**
   * Непустой массив.
   */
  nonempty (): this {
    return this._setIntAndMin1()
  }

  /**
   * Удалить элементы не прошедшие проверку и не поднимать исключений.
   */
  removeFaulty (): this {
    if (this._settings.removeFaulty || this._throwIfFrozen()) {
      return this
    }
    return this._copyWith(null, null, this._settings.copy({ removeFaulty: true }))
  }

  protected _validateStrictItems (ctx: Context, values: any, expectedType: UnionModel<any>): TRes<T> {
    for (let i = values.length - 1; i >= 0; --i) {
      const item = values[i]
      const release = ctx.pushKey(i)
      try {
        const { ok, value } = privateValidate(expectedType, ctx, item)
        if (ok) {
          values[i] = value
        }
        else {
          return ctx.throwFaultyValueError(item, 'Неудачная валидация элемента массива.')
        }
      } finally {
        release()
      }
    }
    return { ok: true, value: values }
  }

  protected _validateIgnoreItems (ctx: Context, values: any, expectedType: UnionModel<any>): TRes<T> {
    const release = ctx.enterOnlyWarning()
    try {
      for (let i = values.length - 1; i >= 0; --i) {
        const item = values[i]
        const release = ctx.pushKey(i)
        try {
          const { ok, value } = privateValidate(expectedType, ctx, item)
          if (ok) {
            values[i] = value
          }
          else {
            values.splice(i, 1)
            ctx.arrayFaultyValueError(item)
          }
        } finally {
          release()
        }
      }
    } finally {
      release()
    }
    const resultPost = this._checkMinMax(values.length)
    if (resultPost === 1) {
      return ctx.throwFaultyValueError(values, `Количество элементов массива не соответствует ожидаемому, min:${this._meta.min}, value.length: ${values.length}, value: ${valueToString(values)}`)
    }
    if (resultPost === 2) {
      return ctx.throwFaultyValueError(values, `Количество элементов массива не соответствует ожидаемому, max:${this._meta.max}, value.length: ${values.length}, value: ${valueToString(values)}`)
    }
    return { ok: true, value: values }
  }

  protected override _validate (ctx: Context, value: any): TRes<T> {
    if (!isArray(value)) {
      return ctx.throwFaultyValueError(value, 'Ожидался Array.')
    }

    const result = this._checkMinMax(value.length)
    if (result === 1) {
      return ctx.throwFaultyValueError(value, `Количество элементов массива не соответствует ожидаемому, min:${this._meta.min}, value.length: ${value.length}, value: ${valueToString(value)}`)
    }
    if (result === 2) {
      return ctx.throwFaultyValueError(value, `Количество элементов массива не соответствует ожидаемому, max:${this._meta.max}, value.length: ${value.length}, value: ${valueToString(value)}`)
    }

    const expectedType = (this._meta as Metadata<UnionModel<any> | null>).expectedType
    if (!expectedType) {
      return { ok: true, value }
    }

    if (this._settings.removeFaulty) {
      return this._validateIgnoreItems(ctx, value, expectedType)
    }
    else {
      return this._validateStrictItems(ctx, value, expectedType)
    }
  }
}

class TupleModel<T extends JsonArray> extends BaseModel<T> {
  protected override _validate (ctx: Context, value: any): TRes<T> {
    if (!isArray(value)) {
      return ctx.throwFaultyValueError(value, 'Ожидался Array(tuple).')
    }

    const expectedType = (this._meta as Metadata<Model<any>[]>).expectedType
    if (expectedType.length !== value.length) {
      return ctx.throwFaultyValueError(value, `Количество требуемых элементов tuple.length:${expectedType.length} не совпадает с полученным массивом value.length:${value.length}`)
    }

    for (let i = 0; i < expectedType.length; ++i) {
      const item = value[i]
      const model = expectedType[i]!
      const releaseKey = ctx.pushKey(i)
      try {
        const { ok, value: v } = privateValidate(model, ctx, item)
        if (ok) {
          value[i] = v
        }
        else {
          return ctx.throwFaultyValueError(item, 'Неудачная валидация элемента tuple.')
        }
      } finally {
        releaseKey()
      }
    }
    return { ok: true, value }
  }
}

class UnionModel<T extends JsonLike> extends BaseModel<T> {
  protected override _validate (ctx: Context, value: any): TRes<T> {
    const expectedType = (this._meta as Metadata<Model<any>[]>).expectedType
    const release = ctx.enterTypeMatching()
    try {
      for (const model of expectedType) {
        const { ok, value: v } = privateValidate(model, ctx, value)
        if (ok) {
          return { ok: true, value: v }
        }
      }
    } finally {
      release()
    }
    return ctx.throwFaultyValueError(value, 'Не удалось найти совместимого типа.')
  }
}

/**
 * Фабрика валидаторов.
 */
class RootFactory {
  protected readonly _config: Config
  protected readonly _defaultSettings: DefaultSettings<any>
  protected readonly _regExpCache: RegExpCache

  protected constructor(config?: undefined | null | TOptions | Config, reCache?: undefined | null | RegExpCache) {
    this._config = (config && (config instanceof Config)) ? config : new DefaultConfig(config)
    this._defaultSettings = new DefaultSettings(this._config.getValidateOptions())
    this._regExpCache = reCache ?? new RegExpCache()
  }

  protected _addOrThrowConfigureError<T extends Model<any>> (name: TPropertyName, message: string, model: null | NoneModel): NoneModel
  protected _addOrThrowConfigureError<T extends Model<any>> (name: TPropertyName, message: string, model: T): T
  protected _addOrThrowConfigureError<T extends Model<any>> (name: TPropertyName, message: string, model: null | NoneModel | T): NoneModel | T {
    const detail = errorMessages.ConfigureError(name, message)
    if (this._config.throwIfConfigureError) {
      throw new ConfigureError(detail.message, propertyNameToString(name))
    }
    if (!model) {
      model = new NoneModel(this._config, Metadata.none(), this._defaultSettings, name)
    }
    privatePropertyMetadata<any>(model).addConfigError(detail)
    return model
  }

  protected _bool (name: TPropertyName): BoolModel {
    return new BoolModel(this._config, Metadata.bool(), this._defaultSettings, name)
  }

  protected _num (name: TPropertyName): NumModel {
    return new NumModel(this._config, Metadata.num(), this._defaultSettings, name)
  }

  protected _str (name: TPropertyName): StrModel {
    return new StrModel(this._config, Metadata.str(), this._defaultSettings, name)
  }

  protected _re (name: TPropertyName, ...values: (RegExp/* | StrModel*/)[]): StrModel {
    let model: NoneModel | null = null
    const re = new Set<Re>()

    for (const item of values) {
      if (item instanceof RegExp) {
        re.add(this._regExpCache.getOf(item))
      }
      else {
        model = this._addOrThrowConfigureError<StrModel>(name, `Недопустимый тип: value: ${valueToString(item)}.`, model)
      }
    }

    if (re.size === 0) {
      return this._addOrThrowConfigureError<StrModel>(name, 'Отсутствие обязательных аргументов \'re(...re)\'.', model) as unknown as StrModel
    }

    const meta = Metadata.re(...re)
    if (model) {
      const errors = privatePropertyMetadata<any>(model).getErrors()
      if (errors) {
        meta.addConfigError(...errors)
      }
    }
    return new StrModel(this._config, meta, this._defaultSettings, name)
  }

  protected _object (name: TPropertyName, value: any): ObjModel<JsonObject> {
    if (!isPlainObject(value)) {
      return this._addOrThrowConfigureError(name, `Недопустимый тип: value: ${valueToString(value)}.`, null) as unknown as ObjModel<JsonObject>
    }
    const meta = Metadata.obj()
    for (const [key, item] of Object.entries(value)) {
      meta.expectedType.push(this._modelOf(key, item))
    }
    return new ObjModel<JsonObject>(this._config, meta, this._defaultSettings, name)
  }

  protected _array (name: TPropertyName, values: any[]): ArrModel<JsonArray> {
    if (!isArray(values)) {
      return this._addOrThrowConfigureError(name, `Недопустимый тип: value: ${valueToString(values)}.`, null) as unknown as ArrModel<JsonArray>
    }
    let union: UnionModel<any>
    if (values.length === 1 && (values[0] instanceof UnionModel)) {
      union = privateShallowCopyWithName<UnionModel<any>>(values[0], 0)
    }
    else {
      const models: Model<any>[] = []
      for (let i = 0; i < values.length; ++i) {
        // Индекс это имя свойства и здесь оно не имеет никакого значения.
        models.push(this._modelOf(i, values[i]))
      }
      union = new UnionModel(this._config, Metadata.union(models), this._defaultSettings, 0)
    }
    return new ArrModel(this._config, Metadata.arr(union), this._defaultSettings, name)
  }

  protected _custom<T extends JsonLike> (name: TPropertyName, fun: TCustomValidate<T>): CustomModel<T> {
    if (!isFunction(fun)) {
      return this._addOrThrowConfigureError(name, `Аргументом custom(fun: ${valueToString(fun)}}) должна быть функция.`, null) as unknown as CustomModel<T>
    }
    return new CustomModel(this._config, Metadata.custom(fun), this._defaultSettings, name)
  }

  protected _modelOf (name: TPropertyName, value: any | Model<any>): Model<JsonLike> {
    if (value instanceof Model) {
      return privateShallowCopyWithName(value, name)
    }
    if (value instanceof RegExp) {
      return this._re(name, value)
    }
    if (value === null) {
      return new LiteralModel<null>(this._config, Metadata.literal(null), this._defaultSettings, name)
    }
    if (isBoolean(value)) {
      return this._bool(name)
    }
    if (isNumber(value)) {
      return this._num(name)
    }
    if (isString(value)) {
      return this._str(name)
    }
    if (isFunction(value)) {
      return this._custom(name, value)
    }
    if (isArray(value)) {
      return this._array(name, value)
    }
    if (isObject(value)) {
      return this._object(name, value)
    }
    // Это может сработать для таких типов как `undefined | bigint`.
    return this._addOrThrowConfigureError(name, `Недопустимый тип: value: ${valueToString(value)}.`, null)
  }

  /**
   * Любой тип.
   *
   * @param value Любой {@link JsonLike} тип, который может иметь вложенные {@link Model}.
   */
  of<T extends TModelLike> (value: T): PipeModel<JsonLike> | RawModel | BoolModel | NumModel | StrModel | LiteralModel<JsonPrimitive> | EnumModel<JsonPrimitive> | ObjModel<JsonObject> | ArrModel<JsonArray> | TupleModel<JsonArray> | UnionModel<JsonLike> | CustomModel<JsonLike> {
    return this._modelOf(null, value) as any
  }

  /**
   * Значение не проверяется и не трансформируется. Свойство будет оставлено как есть.
   */
  raw (): RawModel {
    return new RawModel(this._config, Metadata.raw(), this._defaultSettings, null)
  }

  /**
   * Псевдоним {@link literal()} со значением `null`.
   */
  null (): LiteralModel<null> {
    return new LiteralModel<null>(this._config, Metadata.literal(null), this._defaultSettings, null)
  }

  /**
   * Булевое значение.
   *
   * @param defaultValue Если `!undefined`, тип будет автоматически приведен к {@link BoolModel.optional()} со значением по умолчанию.
   */
  bool (defaultValue?: undefined | null | boolean): BoolModel {
    const meta = Metadata.bool()
    const settings = (isUndefined(defaultValue)
      ? this._defaultSettings
      : this._defaultSettings.copy({ optional: true }, { value: defaultValue })) as Settings<boolean>
    return new BoolModel(this._config, meta, settings, null)
  }

  protected _numWith (meta: Metadata<boolean>, defaultValue?: undefined | null | number): NumModel {
    const settings = (isUndefined(defaultValue)
      ? this._defaultSettings
      : this._defaultSettings.copy({ optional: true }, { value: defaultValue })) as Settings<number>
    return new NumModel(this._config, meta, settings, null)
  }

  /**
   * Любое числовое значение.
   *
   * @param defaultValue Если `!undefined`, тип будет автоматически приведен к {@link NumModel.optional()} со значением по умолчанию.
   */
  num (defaultValue?: undefined | null | number): NumModel {
    const meta = Metadata.num()
    return this._numWith(meta, defaultValue)
  }

  /**
   * Неотрицательное `number`. Сокращение для {@link Factory.range}(0, true).
   *
   * @param defaultValue Если `!undefined`, тип будет автоматически приведен к {@link NumModel.optional()} со значением по умолчанию.
   */
  nonnegative (defaultValue?: undefined | null | number): NumModel {
    const meta = Metadata.num()
    meta.min = 0
    meta.exclusive = true
    return this._numWith(meta, defaultValue)
  }

  /**
   * Псевдоним {@link num()} с одновременной установкой флага {@link NumModel.int()}.
   *
   * @param defaultValue Если `!undefined`, тип будет автоматически приведен к {@link NumModel.optional()} со значением по умолчанию.
   */
  int (defaultValue?: undefined | null | number): NumModel {
    const meta = Metadata.num()
    meta.expectedType = true
    return this._numWith(meta, defaultValue)
  }

  /**
   * Псевдоним {@link num()} с одновременной установкой {@link NumModel.int()} и {@link NumModel.min()}.
   * Используйте этот тип для `id > 0`.
   *
   * @param defaultValue Если `!undefined`, тип будет автоматически приведен к {@link NumModel.optional()} со значением по умолчанию.
   */
  positive (defaultValue?: undefined | null | number): NumModel {
    const meta = Metadata.num()
    meta.expectedType = true
    meta.min = 1
    return this._numWith(meta, defaultValue)
  }

  /**
   * Допустимый диапазон.
   * Псевдоним {@link num()} с одновременной установкой соответствующих опций.
   *
   * @param min Минимальное.
   * @param max Максимальное.
   * @param exclusive Не включая пороговые значения `min/max`.
   * @param defaultValue Если `!undefined`, тип будет автоматически приведен к {@link NumModel.optional()} со значением по умолчанию.
   */
  range (min: number, max: number, exclusive?: undefined | null | boolean, defaultValue?: undefined | null | number): NumModel {
    if (!isNumber(min) || !isNumber(max) || max < min) {
      return this._addOrThrowConfigureError(null, `Ошибочные аргументы range(min: ${valueToString(min)}, max: ${valueToString(max)})`, null) as unknown as NumModel
    }
    const meta = Metadata.num()
    meta.min = min
    meta.max = max
    meta.exclusive = !!exclusive
    return this._numWith(meta, defaultValue)
  }

  /**
   * Любая строка.
   *
   * @param defaultValue Если `!undefined`, тип будет автоматически приведен к {@link StrModel.optional()} со значением по умолчанию.
   */
  str (defaultValue?: undefined | null | string): StrModel {
    const meta = Metadata.str()
    const settings = (isUndefined(defaultValue)
      ? this._defaultSettings
      : this._defaultSettings.copy({ optional: true }, { value: defaultValue })) as Settings<string>
    return new StrModel(this._config, meta, settings, null)
  }

  /**
   * Строка удовлетворяющая тесту `RegExp`.
   *
   * @param re Одно или несколько выражений `RegExp`.
   *
   * Обратите внимание: Одно регулярное выражение можно передавать свойству модели без использования этого метода.
   * @example
   * ```ts
   * const model = v.obj({
   *   // эквивалентно v.re(/^[0-9a-z]{3}$/i)
   *   some: /^[0-9a-z]{3}$/i
   * })
   * ```
   */
  re (re: RegExp, ...rest: RegExp[]): StrModel {
    return this._re(null, re, ...rest)
  }

  /**
   * Один из типов {@link JsonPrimitive} соответствующие ожидаемому значению.
   * Этот тип может быть добавлен в `union` или массивоподобный объект.
   *
   * @param value Только допустимые {@link JsonPrimitive} примитивы.
   */
  literal<T extends JsonPrimitive> (value: T): LiteralModel<T> {
    if (isJsonPrimitive(value)) {
      return new LiteralModel(this._config, Metadata.literal(value), this._defaultSettings, null)
    }
    return this._addOrThrowConfigureError(null, `Ошибочные аргументы literal(value: ${valueToString(value)})`, null) as unknown as LiteralModel<T>
  }

  /**
   * Оптимизированный вариант нескольких {@link literal()} в типе {@link union()}.
   *
   * Этот метод полезен вместо использования `v.union(v.literal(), v.literal())`, но ограничен примитивами.
   *
   * @param values Допустимые {@link JsonPrimitive} и/или {@link EnumModel}, {@link LiteralModel}. Все значения будут слиты в один {@link EnumModel}.
   *
   * @example
   * ```ts
   * const enum = v.enum(true, false, 'on', 'off', otherEnumModel, otherLiteralModel)
   * ```
   */
  enum<T extends TModelLiteral, E extends TModelLiteral[]> (value: T, ...values: E): EnumModel<UJsonLiteralFilter<T | E[number]>> {
    type _T = UJsonLiteralFilter<T | E[number]>
    type _R = EnumModel<_T>
    let tmpModel: NoneModel | null = null
    const { set, faultyValues } = mergeEnum(value, ...values)
    if (set.size === 0) {
      return this._addOrThrowConfigureError<_R>(null, 'Отсутствие обязательных аргументов \'enum(...values)\'.', tmpModel) as unknown as _R
    }
    if (faultyValues) {
      for (const item of faultyValues) {
        tmpModel = this._addOrThrowConfigureError<_R>(null, `Недопустимый тип, value: ${valueToString(item)}.`, tmpModel)
      }
    }
    const meta = Metadata.enum(set)
    if (tmpModel) {
      const errors = privatePropertyMetadata<any>(tmpModel).getErrors()
      if (errors) {
        meta.addConfigError(...errors)
      }
    }
    return new EnumModel(this._config, meta, this._defaultSettings, null)
  }

  /**
   * Plain-объект.
   *
   * @param value Целевое свойство должно быть Plain-объектом.
   */
  obj<T extends TModelObject> (value: T): ObjModel<UJsonObjectFilter<T>> {
    return this._object(null, value) as any
  }

  /**
   * Массив любых допустимых типов.
   *
   * @param values Допустимые значения {@link JsonLike} и/или {@link Model}. Пустой массив, или отсутствующий аргумент, разрешает любые типы.
   */
  arr<T extends TModelArray> (values?: undefined | null | T): ArrModel<UJsonArrayFilter<T>> {
    return this._array(null, (values ?? []) as any) as any
  }

  /**
   * Массив с предопределенным количеством типов в строгом порядке.
   *
   * @param values Непустой массив допустимых типов {@link JsonLike} и/или {@link Model}.
   */
  tuple<T extends TModelArray> (values: T): TupleModel<UJsonArrayFilter<T>> {
    if (!isArray(values) || values.length === 0) {
      return this._addOrThrowConfigureError(null, `Ошибочные аргументы tuple(values: ${valueToString(values)}}) или массив пуст.`, null) as unknown as TupleModel<UJsonArrayFilter<T>>
    }
    const tuple: Model<any>[] = []
    for (let i = 0; i < values.length; ++i) {
      tuple.push(this._modelOf(i, values[i]))
    }
    return new TupleModel(this._config, Metadata.tuple(tuple), this._defaultSettings, null)
  }

  /**
   * Один из предопределенных типов. Значениями `union` может быть любой допустимый тип.
   *
   * @param values Непустой массив допустимых типов {@link JsonLike} и/или {@link Model}.
   */
  union<T extends TModelLike, E extends TModelLike[]> (value: T, ...values: E): UnionModel<UJsonMultiFilter<T | E[number]>> {
    if (values.length === 0 && (value instanceof UnionModel)) {
      return privateShallowCopyWithName<UnionModel<any>>(value, null)
    }
    const items = [value, ...values]
    const union: Model<any>[] = []
    for (let i = 0; i < items.length; ++i) {
      union.push(this._modelOf(i, items[i]))
    }
    return new UnionModel(this._config, Metadata.union(union), this._defaultSettings, null)
  }

  /**
   * Пользовательская функция валидации.
   *
   * @param fun Функция должна возвращать результат подобный {@link TResult} для текущего тестируемого значения.
   */
  custom<T extends JsonLike> (fun: TCustomValidate<T>): CustomModel<T> {
    return this._custom(null, fun)
  }

  /**
   * Создает цепочку валидаторов, которая одновременно может преобразовать объект.
   */
  pipe<T extends Model<JsonLike>, L extends Model<JsonLike>> (model: T, ...models: [...(Model<JsonLike>[]), L]): PipeModel<UJsonPipeLast<L, T>> {
    return model.pipe(model, ...models) as any
  }
}

class Factory extends RootFactory {
  protected readonly _registeredScopeNames = new Set<string>()

  constructor(options?: undefined | null | TOptions) {
    super(options)
  }

  protected _getScopeNameOf (name: string): string {
    if (!isString(name)) {
      name = ''
    }
    let freeName = name
    let counter = 0
    while (this._registeredScopeNames.has(freeName)) {
      freeName = `${name}(${++counter})`
    }
    this._registeredScopeNames.add(freeName)
    return freeName
  }

  /**
   * Возвращает новую фабрику с именованной областью. Именованная область служит границей обработки ошибок
   *
   * @param name Имя модели.
   * @param options Расширяет базовую конфигурацию.
   */
  scope (name: string, options?: undefined | null | TValidateOptions): RootFactory {
    const config = this._config.extends(options ?? null, this._getScopeNameOf(isString(name) ? name : ''))
    return new RootFactory(config, this._regExpCache)
  }
}

export {
  type TModelLiteral,
  type TModelPrimitive,
  type TModelObject,
  type TModelArray,
  type TModelLike,
  privatePropertyMetadata,
  privatePropertySettings,
  privateShallowCopyWithName,
  privateValidate,
  mergeEnum,
  Model,
  BaseModel,
  BaseRangeModel,
  PipeModel,
  NoneModel,
  RawModel,
  CustomModel,
  BoolModel,
  NumModel,
  StrModel,
  LiteralModel,
  EnumModel,
  ObjModel,
  ArrModel,
  TupleModel,
  UnionModel,
  RootFactory,
  Factory
}
