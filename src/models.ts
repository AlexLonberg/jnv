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
  propertyPathToString,
  valueToString
} from './utils.js'
import {
  type IErrorDetail,
  type IErrorLike,
  errorDetails,
  JnvError,
  UnknownError,
  ConfigureError,
  ModelIsFrozenError,
  insureErrorLike
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
  protected readonly _settings: Settings<T>
  protected readonly _meta: Metadata<any>
  protected readonly _key: TPropertyName

  constructor(config: Config, settings: Settings<T>, meta: Metadata<any>, key: TPropertyName) {
    this._config = config
    this._settings = settings
    this._meta = meta
    this._key = key
  }

  protected _collectConfigureError (path: TPropertyName[], err: IErrorLike[]): void {
    const extendsPath = [...path, this._key]
    const errors = this._meta.getErrors()
    if (errors) {
      const propPath = propertyPathToString(extendsPath)
      for (const item of errors) {
        item.propertyPath = propPath
        err.push(item)
      }
    }
    const children = this._meta.getAllModels()
    if (children) {
      for (const item of children) {
        item._collectConfigureError(extendsPath, err)
      }
    }
  }

  /**
   * Возвращает все ошибки произошедшие в процессе конфигурирования текущего типа и дочерних элементов.
   */
  getConfigureError (): null | IErrorLike[] {
    const errors: IErrorLike[] = []
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
    const detail = errorDetails.ConfigureError(this._key, message)
    this._meta.addConfigError(detail)
    if (this._config.throwIfConfigureError) {
      throw new ConfigureError(detail)
    }
  }

  protected _throwIfFrozen (): boolean {
    if (this.isFrozen()) {
      const detail = errorDetails.ModelIsFrozenError(this._key)
      this._meta.addConfigError(detail)
      if (this._config.throwIfConfigureError) {
        throw new ModelIsFrozenError(detail)
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
    return this._copyWith(null, settings, null) as unknown as Model<Target>
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
      if (e instanceof JnvError) {
        throw e
      }
      throw new UnknownError(errorDetails.UnknownError(ctx.getPathAsStr(), null, e))
    }
    const result = { ok: false, value: null, details: ctx.collectErrors() } as any
    if (!result.details) {
      result.details = { errors: [errorDetails.UnknownError(ctx.getPathAsStr())] }
    }
    else if (!result.details.errors) {
      result.details.errors = [errorDetails.UnknownError(ctx.getPathAsStr())]
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
    return this._copyWith(this._config.copy(), this._settings.copy(), this._meta.copy())
  }

  /**
   * Копирование только с явно установленными типами параметров.
   * Для изменения параметров meta, вызываем _copyWith(null, null, meta.copy(...)), и т.п.
   */
  protected _copyWith (config: null | Config, settings: null | Settings<T>, meta: null | Metadata<T>): this {
    return new (this.constructor as (new (...args: any[]) => this))(
      config ?? this._config, settings ?? this._settings, meta ?? this._meta, this._key
    )
  }

  /**
   * Этот метод применяется для переопределения имен ключей объектов при обходе структур и массивов.
   * Он полностью сохраняет ссылки на неизмененные настройки и оборачивает модель с новым именем.
   */
  [SHALLOW_COPY] (name: TPropertyName): this {
    return new (this.constructor as (new (...args: any[]) => this))(this._config, this._settings, this._meta, name)
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
    return new PipeModel<Target>(this._config, this._settings as Settings<any>, meta, this._key)
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
    return this._copyWith(null, this._settings.copy({ stopIfError: true }), null)
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
    return this._copyWith(null, this._settings.copy(null, { value: defaultValue }), null)
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
    return this._copyWith(null, settings as Settings<T>, null)
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
    return this._copyWith(null, null, copy)
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
    return this._copyWith(null, null, copy)
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
    return this._copyWith(null, null, copy)
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
    return this._copyWith(null, null, copy)
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
  protected _registerErrorDetails (
    ctx: Context,
    error?: undefined | null | IErrorDetail,
    warning?: undefined | null | IErrorDetail,
    errors?: undefined | null | IErrorDetail[],
    warnings?: undefined | null | IErrorDetail[]
  ): null | IErrorLike {
    let errLike: IErrorLike | null = null
    const add = (method: 'addWarning' | 'addError', array: IErrorDetail[]) => {
      for (const raw of array) {
        errLike = insureErrorLike(raw)
        ctx[method](errLike)
      }
    }
    if (warnings) {
      add('addWarning', warnings)
    }
    if (warning) {
      add('addWarning', [warning])
    }
    errLike = null
    if (errors) {
      add('addError', errors)
    }
    if (error) {
      add('addError', [error])
    }
    return errLike
  }

  protected override _validate (ctx: Context, value: any): TRes<T> {
    const result = (this._meta as unknown as Metadata<TCustomValidate<T>>).expectedType(ctx.getPath(), value)
    let ok = result.ok
    const error = hasOwn(result, 'error') ? result.error : null
    const warning = hasOwn(result, 'warning') ? result.warning : null
    let errors: null | IErrorDetail[] = null
    let warnings: null | IErrorDetail[] = null
    if (hasOwn(result, 'details') && isPlainObject(result.details)) {
      if (hasOwn(result.details, 'errors') && isArray(result.details.errors) && (result.details.errors as IErrorDetail[]).length > 0) {
        errors = result.details.errors as IErrorDetail[]
      }
      if (hasOwn(result.details, 'warnings') && isArray(result.details.warnings) && (result.details.warnings as IErrorDetail[]).length > 0) {
        warnings = result.details.warnings as IErrorDetail[]
      }
    }
    const lastError = (error || warning || errors || warnings)
      ? this._registerErrorDetails(ctx, error, warning, errors, warnings)
      : null
    if (lastError) {
      if (!lastError.propertyPath) {
        lastError.propertyPath = ctx.getPathAsStr()
      }
      ok = false
    }
    return ok ? { ok, value: result.value! } : ctx.throwCustomError(lastError)
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
    return this._copyWith(null, null, copy)
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

    const target = (this._config.modeCopyObj ? {} : value) as any
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
    return this._copyWith(null, this._settings.copy({ removeFaulty: true }), null)
  }

  protected _validateStrictItemsModeRewrite (ctx: Context, values: any[], expectedType: UnionModel<any>): TRes<T> {
    for (let i = 0; i < values.length; ++i) {
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
    return { ok: true, value: values as T }
  }

  protected _validateStrictItemsModeCopy (ctx: Context, values: any[], expectedType: UnionModel<any>): TRes<T> {
    const newValues: any[] = []
    for (let i = 0; i < values.length; ++i) {
      const item = values[i]
      const release = ctx.pushKey(i)
      try {
        const { ok, value } = privateValidate(expectedType, ctx, item)
        if (ok) {
          newValues.push(value)
        }
        else {
          return ctx.throwFaultyValueError(item, 'Неудачная валидация элемента массива.')
        }
      } finally {
        release()
      }
    }
    return { ok: true, value: newValues as T }
  }

  protected _validateIgnoreItemsModeRewrite (ctx: Context, values: any[], expectedType: UnionModel<any>): TRes<T> {
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
      return ctx.throwFaultyValueError(values, `Количество элементов массива не соответствует ожидаемому, min:${this._meta.min}, value.length: ${values.length}.`)
    }
    if (resultPost === 2) {
      return ctx.throwFaultyValueError(values, `Количество элементов массива не соответствует ожидаемому, max:${this._meta.max}, value.length: ${values.length}.`)
    }
    return { ok: true, value: values as T }
  }

  protected _validateIgnoreItemsModeCopy (ctx: Context, values: any[], expectedType: UnionModel<any>): TRes<T> {
    const newValues: any[] = []
    const release = ctx.enterOnlyWarning()
    try {
      for (let i = 0; i < values.length; ++i) {
        const item = values[i]
        const release = ctx.pushKey(i)
        try {
          const { ok, value } = privateValidate(expectedType, ctx, item)
          if (ok) {
            newValues.push(value)
          }
        } finally {
          release()
        }
      }
    } finally {
      release()
    }
    const resultPost = this._checkMinMax(newValues.length)
    if (resultPost === 1) {
      return ctx.throwFaultyValueError(newValues, `Количество элементов массива не соответствует ожидаемому, min:${this._meta.min}, value.length: ${newValues.length}.`)
    }
    if (resultPost === 2) {
      return ctx.throwFaultyValueError(newValues, `Количество элементов массива не соответствует ожидаемому, max:${this._meta.max}, value.length: ${newValues.length}.`)
    }
    return { ok: true, value: newValues as T }
  }

  protected override _validate (ctx: Context, value: any): TRes<T> {
    if (!isArray(value)) {
      return ctx.throwFaultyValueError(value, 'Ожидался Array.')
    }

    const result = this._checkMinMax(value.length)
    if (result === 1) {
      return ctx.throwFaultyValueError(value, `Количество элементов массива не соответствует ожидаемому, min:${this._meta.min}, value.length: ${value.length}.`)
    }
    if (result === 2) {
      return ctx.throwFaultyValueError(value, `Количество элементов массива не соответствует ожидаемому, max:${this._meta.max}, value.length: ${value.length}.`)
    }

    const expectedType = (this._meta as Metadata<UnionModel<any> | null>).expectedType
    if (!expectedType) {
      return { ok: true, value }
    }

    if (this._settings.removeFaulty) {
      return this._config.modeCopyArr
        ? this._validateIgnoreItemsModeCopy(ctx, value, expectedType)
        : this._validateIgnoreItemsModeRewrite(ctx, value, expectedType)
    }
    else {
      return this._config.modeCopyArr
        ? this._validateStrictItemsModeCopy(ctx, value, expectedType)
        : this._validateStrictItemsModeRewrite(ctx, value, expectedType)
    }
  }
}

class TupleModel<T extends JsonArray> extends BaseModel<T> {
  protected _validateItemsModeRewrite (ctx: Context, value: any[], expectedType: Model<any>[]): TRes<T> {
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
    return { ok: true, value: value as T }
  }

  protected _validateItemsModeCopy (ctx: Context, value: any[], expectedType: Model<any>[]): TRes<T> {
    const newValues = []
    for (let i = 0; i < expectedType.length; ++i) {
      const item = value[i]
      const model = expectedType[i]!
      const releaseKey = ctx.pushKey(i)
      try {
        const { ok, value: v } = privateValidate(model, ctx, item)
        if (ok) {
          newValues.push(v)
        }
        else {
          return ctx.throwFaultyValueError(item, 'Неудачная валидация элемента tuple.')
        }
      } finally {
        releaseKey()
      }
    }
    return { ok: true, value: newValues as T }
  }

  protected override _validate (ctx: Context, value: any): TRes<T> {
    if (!isArray(value)) {
      return ctx.throwFaultyValueError(value, 'Ожидался Array(tuple).')
    }

    const expectedType = (this._meta as Metadata<Model<any>[]>).expectedType
    if (expectedType.length !== value.length) {
      return ctx.throwFaultyValueError(value, `Количество требуемых элементов tuple.length:${expectedType.length} не совпадает с полученным массивом value.length:${value.length}`)
    }

    return this._config.modeCopyArr
      ? this._validateItemsModeCopy(ctx, value, expectedType)
      : this._validateItemsModeRewrite(ctx, value, expectedType)
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
    const detail = errorDetails.ConfigureError(name, message)
    if (this._config.throwIfConfigureError) {
      throw new ConfigureError(detail)
    }
    if (!model) {
      model = new NoneModel(this._config, this._defaultSettings, Metadata.none(), name)
    }
    privatePropertyMetadata<any>(model).addConfigError(detail)
    return model
  }

  protected _bool (name: TPropertyName): BoolModel {
    return new BoolModel(this._config, this._defaultSettings, Metadata.bool(), name)
  }

  protected _num (name: TPropertyName): NumModel {
    return new NumModel(this._config, this._defaultSettings, Metadata.num(), name)
  }

  protected _str (name: TPropertyName): StrModel {
    return new StrModel(this._config, this._defaultSettings, Metadata.str(), name)
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
    return new StrModel(this._config, this._defaultSettings, meta, name)
  }

  protected _object (name: TPropertyName, value: any): ObjModel<JsonObject> {
    if (!isPlainObject(value)) {
      return this._addOrThrowConfigureError(name, `Недопустимый тип: value: ${valueToString(value)}.`, null) as unknown as ObjModel<JsonObject>
    }
    const meta = Metadata.obj()
    for (const [key, item] of Object.entries(value)) {
      meta.expectedType.push(this._modelOf(key, item))
    }
    return new ObjModel<JsonObject>(this._config, this._defaultSettings, meta, name)
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
      union = new UnionModel(this._config, this._defaultSettings, Metadata.union(models), 0)
    }
    return new ArrModel(this._config, this._defaultSettings, Metadata.arr(union), name)
  }

  protected _custom<T extends JsonLike> (name: TPropertyName, fun: TCustomValidate<T>): CustomModel<T> {
    if (!isFunction(fun)) {
      return this._addOrThrowConfigureError(name, `Аргументом custom(fun: ${valueToString(fun)}}) должна быть функция.`, null) as unknown as CustomModel<T>
    }
    return new CustomModel(this._config, this._defaultSettings, Metadata.custom(fun), name)
  }

  protected _modelOf (name: TPropertyName, value: any | Model<any>): Model<JsonLike> {
    if (value instanceof Model) {
      return privateShallowCopyWithName(value, name)
    }
    if (value instanceof RegExp) {
      return this._re(name, value)
    }
    if (value === null) {
      return new LiteralModel<null>(this._config, this._defaultSettings, Metadata.literal(null), name)
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
    // Это может сработать для таких типов как `undefined | bigint` не являющихся типами JsonLike.
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
    return new RawModel(this._config, this._defaultSettings, Metadata.raw(), null)
  }

  /**
   * Псевдоним {@link literal()} со значением `null`.
   */
  null (): LiteralModel<null> {
    return new LiteralModel<null>(this._config, this._defaultSettings, Metadata.literal(null), null)
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
    return new BoolModel(this._config, settings, meta, null)
  }

  protected _numWith (meta: Metadata<boolean>, defaultValue?: undefined | null | number): NumModel {
    const settings = (isUndefined(defaultValue)
      ? this._defaultSettings
      : this._defaultSettings.copy({ optional: true }, { value: defaultValue })) as Settings<number>
    return new NumModel(this._config, settings, meta, null)
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
   * Неотрицательное `number`. Сокращение для {@link Factory.num}().min(0).
   *
   * @param defaultValue Если `!undefined`, тип будет автоматически приведен к {@link NumModel.optional()} со значением по умолчанию.
   */
  nonnegative (defaultValue?: undefined | null | number): NumModel {
    const meta = Metadata.num()
    meta.min = 0
    meta.exclusive = false
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
    return new StrModel(this._config, settings, meta, null)
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
      return new LiteralModel(this._config, this._defaultSettings, Metadata.literal(value), null)
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
    return new EnumModel(this._config, this._defaultSettings, meta, null)
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
    return new TupleModel(this._config, this._defaultSettings, Metadata.tuple(tuple), null)
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
    return new UnionModel(this._config, this._defaultSettings, Metadata.union(union), null)
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
