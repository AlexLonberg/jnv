import type { IErrorDetail, IErrorLike, JnvError } from './errors.js'
import type { BaseModel, Model } from './models.js'

type JsonPrimitive = null | boolean | number | string
type JsonObject = { [k: string]: JsonPrimitive | JsonArray | JsonObject }
type JsonArray = (JsonPrimitive | JsonArray | JsonObject)[]
type JsonLike = JsonPrimitive | JsonArray | JsonObject

/** Специальный флаг(Symbol) пустого значения, по аналогии с `undefined`. */
const emptyValue = Symbol('Empty_Value')
/** Специальный флаг(Symbol) пустого значения, по аналогии с `undefined`. */
type TEmptyValue = typeof emptyValue

/** Имя корневой модели по умолчанию */
const defaultRootName = '<root>'
/** Имя корневой модели по умолчанию */
type TDefaultRootName = typeof defaultRootName

/** Неопределенное имя ключа */
const unknownPropertyName = '<unknown_property_name>'
/** Неопределенное имя ключа */
type TUnknownPropertyName = typeof unknownPropertyName

/** Неопределенное значение */
const unknownValue = '<unknown_value>'
/** Неопределенное значение */
type TUnknownValue = typeof unknownValue

/**
 * Внутренний промежуточный результат валидации модели.
 * В зависимости от опций ошибок - валидация прерывается до уровня модели.
 */
type TRes<T> = { ok: true, value: T } | { ok: false, value: null | T }
/**
 * Пустая функция.
 */
type TRelease = (() => void)

/**
 * Допустимые типы. Имя типа одноименно с именем функции привыборе типа.
 */
type TValueType =
  // Специальный флаг свойства или значения не подлежащего записи в целевой объект.
  // Таким значением может быть последствие ошибки конфигурации при выключенных ошибках.
  'none' |
  // Значение этого типа не проверяется и возвращается как есть.
  'raw' |
  // Булевое значение.
  'bool' |
  // Любое число. Для чисел есть дружественные функции int()/positive()/range()
  'num' |
  // Строка. Дружественная функция re() для строк с проверкой `RegExp` и nonempty().
  'str' |
  // Литерал, может быть одним из примитивов `null|boolean|number|string`
  'literal' |
  // Оптимизированная версия `union(literal, literal)` для нескольких предопределенных значений в одном массиве.
  'enum' |
  // Plain-объект.
  'obj' |
  // Массив любых допустимых значений.
  'arr' |
  // Массив с предопределенным количеством типов в строгом порядке.
  'tuple' |
  // Одно из предопределенных значений. Значениями `enum` может быть любой допустимый тип.
  // В том числе, объекты могут быть смешаны с литералами.
  'union' |
  // Пользовательский валидатор-функция.
  'custom' |
  // Цепочка валидаторов.
  'pipe'

/**
 * Имя свойств:
 *
 * + `null`   - Корневой тип без имени.
 * + `number` - Индекс массива, актуально для `tuple`.
 * + `string` - Свойство объекта.
 */
type TPropertyName = null | number | string

/**
 * Результат валидации:
 *
 * + `ok`      - Утверждение наличия типа в `value`.
 * + `value`   - Результат валидации. Может присутствовать при `ok:false`, но только для экспертизы, а не использования.
 * + `warning` - Может присутствовать при `true`, если отключены выбросы исключений при незначительных ошибках, например `[].removeFaulty()`.
 * + `error`   - Всегда есть при `ok:false`, предупреждения должны быть зашиты в `error`.
 */
type TResult<T> = { ok: true, value: T, warning?: IErrorLike, error?: null } | { ok: false, value: null | T, error: IErrorLike, warning?: null }

/**
 * Упрощенный результат {@link TResult} функции пользователького валидатора {@link TCustomValidate}.
 *
 * Ошибка определяется по наличию непустого свойства `error`, при котором `ok` игнорируется.
 * Предупреждения могут быть как одной ошибкой, так и массивом. Ошибка всегда должна быть в единственном экземпляре.
 * Результат пользовательского валидатора будет приведен к {@link TResult}.
 */
type TCustomResult<T> =
  {
    ok: true,
    value: T,
    error?: undefined | null
    warning?: undefined | null | JnvError | IErrorLike | IErrorDetail | (JnvError | IErrorLike | IErrorDetail)[]
  } |
  {
    ok?: undefined | null | false,
    value?: undefined | null | T,
    error: (JnvError | IErrorLike | IErrorDetail),
    warning?: undefined | null | JnvError | IErrorLike | IErrorDetail | (JnvError | IErrorLike | IErrorDetail)[]
  }

/**
 * Пользовательская функция. Результат ошибок регистрируется.
 *
 * Пользовательская функция может возвратить результат валидации в формате {@link TResult} или установить одно поле
 * `error` используя упрощенный вариант {@link TCustomResult}.
 *
 * Если валидатор должен поднять исключение, сообщение передается в конструктор {@link JnvError}.
 */
type TCustomValidate<T extends JsonLike> = ((path: TPropertyName[], value: any) => TResult<T> | TCustomResult<T>)

/**
 * Опции валидатора.
 */
type TOptions = {
  /**
   * Прервать конфигурирование типа и выбросить исключение. По умолчанию `false`.
   *
   * Результат конфигурации всегда можно проверить в соответствующем свойстве списка ошибок конфигурируемого типа
   * с помощью вызова {@link Model.getConfigureError()}.
   */
  throwIfConfigureError?: undefined | null | boolean
  /**
   * Режим создания или перезаписи новых объектов:
   *
   * + `null|0|all`(по умолчанию) - При валидации создаются новые объекты и массивы. Выходной объект строго соответствует модели.
   * + `1|'obj'`  - Создаются только объекты, массивы фильтруются. Это может несколько увеличить производительность на больших массивах(до 25%). Выходной объект строго соответствует модели.
   * + `2|'arr'`  - Создаются только массивы, объекты сохраняют свойства оригинала не предусмотренные моделью данных.
   * + `3|'none'` - Массивы и объекты перезаписываются, объекты сохраняют свойства не предусмотренные моделью данных.
   */
  createMode?: undefined | null | 0 | 'all' | 1 | 'obj' | 2 | 'arr' | 3 | 'none'
  /**
   * Прервать валидацию и выбросить исключение. По умолчанию `false`.
   *
   * Результат валидации всегда доступен в {@link TResult} и поднятие исключений может быть не всегда удобным.
   *
   * Разница между `true|false`:
   *
   *  + `true`  - Любая ошибка, если она не исключена другими опциями, прерывает валидацию и поднимает исключение {@link JnvError}.
   *  + `false` - Любая ошибка так же прерывает валидацию, но результат имеет ошибку `{ok: false, value: null, error: IErrorLike}`.
   *
   * Остановить исключение для отдельных типов можно опциями {@link TOptions.stopIfError} и {@link TOptions.removeFaulty}.
   */
  throwIfError?: undefined | null | boolean
  /**
   * Не вызывать ошибок для любой модели. По умолчанию `false`. Эта опция отменяет {@link TOptions.throwIfError}.
   *
   * Модели помеченные этим флагом записывают ошибки как предупреждения.
   *
   * Использовать эту опцию на корневом объекте или глобальной конфигурации не имеет смысла, при любой ошибке результат
   * получит `null` или значение по умолчанию, и результат будет `{ok: true, value: null: warning: IErrorLike}`.
   *
   * Альтернативно для любого вложенного типа нужно использовать {@link BaseModel.stopError()}.
   *
   * ```ts
   * v.obj({
   *   value: v.int().stopError()
   * })
   * ```
   */
  stopIfError?: undefined | null | boolean
  /**
   * То же самое что и {@link TOptions.stopIfError}, но применяется непосредственно к массивам, для которых нельзя выбрать целевой элемент.
   * Не прошедшие проверку типы элементов не вызывают ошибок, удаляются из массива и регистрируют предупреждение в {@link TResult}`.warning`.
   *
   * Если установлена эта опция, любой массив автоматически будет очищен от недопустимого типа. Альтернативно можно
   * устанавливать флаги конкретным моделям, так же как и в случае с {@link BaseModel.stopError()}:
   *
   * ```ts
   * v.obj({
   *   arr: v.arr([v.int()]).removeFaulty()
   * })
   * ```
   */
  removeFaulty?: undefined | null | boolean
}

/**
 * Те же параметры конфигурации, что и в {@link TOptions}, для конкретных моделей + `optional`.
 */
type TModelOptions = {
  stopIfError: boolean
  removeFaulty: boolean
  optional: boolean
}

export {
  type JsonPrimitive,
  type JsonObject,
  type JsonArray,
  type JsonLike,
  emptyValue,
  type TEmptyValue,
  defaultRootName,
  type TDefaultRootName,
  unknownPropertyName,
  type TUnknownPropertyName,
  unknownValue,
  type TUnknownValue,
  type TRes,
  type TRelease,
  type TValueType,
  type TPropertyName,
  type TResult,
  type TCustomResult,
  type TCustomValidate,
  type TOptions,
  type TModelOptions
}
