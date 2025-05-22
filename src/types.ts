import type { IErrorDetail, IErrorLike, JnvError } from './errors.js'
import type { BaseModel, Model, Factory } from './models.js'

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
  // Строка. Дружественная функция re() для строк с проверкой `RegExp`.
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
 * + `details` - Всегда есть при `ok:false`, но может присутствовать и при `true`, если отключены выбросы исключений при незначительных ошибках.
 */
type TResult<T> = { ok: true, value: T, details?: { warnings: IErrorLike[] } } | { ok: false, value: null | T, details: { errors: IErrorLike[], warnings?: IErrorLike[] } }

/**
 * Упрощенный результат функции пользователького валидатора {@link TCustomValidate}.
 */
type TCustomResult<T> =
  {
    ok: true,
    value: T,
    details?: undefined | null | { errors?: undefined | null, warnings?: undefined | null | (IErrorLike | IErrorDetail)[] },
    error?: undefined | null
    warning?: undefined | null | (IErrorLike | IErrorDetail)
  } |
  {
    ok: false,
    value?: undefined | null | T,
    details: { errors: (IErrorLike | IErrorDetail)[], warnings?: undefined | null | (IErrorLike | IErrorDetail)[] },
    error?: undefined | null | (IErrorLike | IErrorDetail),
    warning?: undefined | null | (IErrorLike | IErrorDetail)
  } |
  {
    ok: false,
    value?: undefined | null | T,
    details?: undefined | null | { errors?: undefined | null | (IErrorLike | IErrorDetail)[], warnings?: undefined | null | (IErrorLike | IErrorDetail)[] },
    error: (IErrorLike | IErrorDetail),
    warning?: undefined | null | (IErrorLike | IErrorDetail)
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

type TConfigOptions = {
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
   * + `1|'obj'` - Создаются только объекты, массивы фильтруются. Это может несколько увеличить производительность на больших массивах(до 25%). Выходной объект строго соответствует модели.
   * + `2|'arr'` - Создаются только массивы, объекты сохраняют свойства не предусмотренные моделью данных.
   * + `3|'none'` - массивы и объекты перезаписываются, объекты сохраняют свойства не предусмотренные моделью данных.
   */
  createMode?: undefined | null | 0 | 'all' | 1 | 'obj' | 2 | 'arr' | 3 | 'none'
}

type TValidateOptions = {
  /**
   * Прервать валидацию и выбросить исключение. По умолчанию `false`. Результат операции доступен в {@link TResult}.
   *
   * Разница между `true|false`:
   *
   *  + `true`  - Любая ошибка, если она не исключена другими опциями, прерывает валидацию и поднимает исключение {@link JnvError}.
   *  + `false` - Любая ошибка так же прерывает валидацию, результат имеет `{ok: false, value: null, details: {...}}` детали с описанием ошибок.
   *
   * Остановить исключение для отдельных типов можно опциями {@link TValidateOptions.stopIfError} и {@link TValidateOptions.removeFaulty}.
   */
  throwIfError?: undefined | null | boolean
  /**
   * Не вызывать исключений для текущей области. По умолчанию `false`. Эта опция отменяет {@link TValidateOptions.throwIfError}.
   *
   * Использовать эту опцию на корневом объекте валидации не имеет смысла, при любой ошибке он получит `null` или значение по умолчанию.
   * Расширить конфигурацию можно функцией {@link Factory.scope()}. Альтернативно для любого типа используется {@link BaseModel.stopError()}.
   *
   * Позволяет затереть вложенный объект нулем(null или default) не прерывая валидацию объемлющего объекта.
   * В отличие от поведения по умолчанию этот параметр пишет ошибку в {@link TResult}.details.warnings и возвращает
   * `{ok: true, ...}` для объемлючего объекта. Пример в [index.test.ts](./index.test.ts).
   */
  stopIfError?: undefined | null | boolean
  /**
   * То же самое что и {@link TValidateOptions.stopIfError}, но применяется непосредственно к массивам, для которых нельзя выбрать целевой элемент.
   * Не прошедшие проверку типы элементов не вызывают ошибок, удаляются из массива и регистрируют предупреждение в {@link TResult}.details.warnings.
   */
  removeFaulty?: undefined | null | boolean
}

/**
 * Опции валидатора.
 */
type TOptions = TConfigOptions & TValidateOptions

/**
 * Те же параметры конфигурации, что и в {@link TValidateOptions}, для конкретных моделей.
 */
type TValidateSettings = {
  stopIfError: boolean
  removeFaulty: boolean
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
  type TConfigOptions,
  type TValidateOptions,
  type TOptions,
  type TValidateSettings
}
