import { ErrorLikeCollection } from 'js-base-error'
import {
  // expectTypeOf,
  test,
  expect
} from 'vitest'
import {
  type JsonLike,
  type TPropertyName,
  type TRes,
  type TResult,
  type TCustomResult,
  type IErrorDetail,
  type IErrorLike,
  type Context,
  type Re,
  Options,
  Config,
  errorResults,
  ConfigureError,
  NotConfiguredError,
  RequiredPropertyError,
  FaultyValueError,
  ModelIsFrozenError,
  Metadata,
  type Model,
  BaseModel,
  NoneModel,
  NumModel,
  StrModel,
  ObjModel,
  Factory,
  isString,
  plainCopy,
  propertyPathToString,
  safeToJson,
  JnvError,
  CombinedError
} from './index.js'

test('Quick start', () => {
  const v = new Factory()

  // Корневая модель может быть вложена в другие модели на любой уровень
  const userModel = v.obj({
    id: v.positive(), // эквивалентно int().min(1)
    name: v.str().min(3),
    email: /^[0-9a-z]+@[0-9a-z]+\.[a-z]+$/i, // эквивалентно v.re(...)
    gender: v.enum('male', 'female').optional(),
    // Оборачиваем объект в тип, для возможности применения .stopError() - игнорировать
    // ошибку и установить значение по умолчанию или `null`(если его нет).
    address: v.obj({
      city: v.nonempty(),   // эквивалентно .str().nonempty() или .str().min(1)
      street: 'any string', // эквивалентно .str()
      zipCode: ''
    }).stopError()
  })

  const sampleUser = {
    id: 1,
    name: 'John',
    email: 'a@b.c',
    // gender: 'male' as ('male' | 'female'),
    address: {
      city: 'Springfield',
      street: '742 Evergreen Terrace',
      zipCode: '90210'
    }
  }
  expect(userModel.validate(plainCopy(sampleUser))).toStrictEqual({ ok: true, value: sampleUser })
  // @ts-expect-error
  sampleUser.gender = 'male'
  expect(userModel.validate(plainCopy(sampleUser))).toStrictEqual({ ok: true, value: sampleUser })

  // Ошибка в address вернет предупреждение
  sampleUser.address.city = ''
  expect(userModel.validate(plainCopy(sampleUser)))
    .toStrictEqual({
      ok: true,
      value: { id: 1, name: 'John', email: 'a@b.c', gender: 'male', address: null as any },
      warning: expect.objectContaining({
        detail: expect.objectContaining({
          name: 'Jnv.CombinedError',
          level: 'warning',
          warnings: expect.any(ErrorLikeCollection)
        })
      })
    })
  // Ошибка в User остановит валидацию
  sampleUser.id = 0
  expect(userModel.validate(plainCopy(sampleUser)))
    .toMatchObject({
      ok: false,
      value: null,
      error: expect.objectContaining({
        detail: expect.objectContaining({
          // здесь так же будут остальные свойства ошибки
          name: 'Jnv.FaultyValueError',
          errors: expect.any(ErrorLikeCollection)
        })
      })
    })
})

test('Replacing an invalid type', () => {
  // Параметры конфигурации доступны через JSDoc.
  const v = new Factory({
    throwIfConfigureError: true,
    createMode: 'obj'
  })

  const arrModel = v.arr([
    v.obj({ enabled: v.enum('on', 'off') })
      .def({ AhHaHa: '😋' }) // значение по умолчанию
      .stopError()           // не поднимать ошибку
  ])

  expect(arrModel.validate([
    { enabled: 'on' },
    { enabled: 'oh no' },
    { enabled: 'off' }
  ]).value).toStrictEqual([
    { enabled: 'on' },
    { AhHaHa: '😋' },
    { enabled: 'off' }
  ])

  const arrRemoved = v.arr([
    v.obj({ enabled: v.enum('on', 'off') })
  ]).removeFaulty() // удалить невалидное значение

  expect(arrRemoved.validate([
    { enabled: 'on' },
    { enabled: 'oh no' },
    { enabled: 'off' }
  ]).value).toStrictEqual([
    { enabled: 'on' },
    { enabled: 'off' }
  ])

  const arrError = v.arr([
    v.obj({ enabled: v.enum('on', 'off') })
  ])

  expect(arrError.validate([
    {
      get enabled () {
        throw 123 // хитрый ход - пытаемся завалить валидатор
      }
    }
  ]).error).toBeInstanceOf(JnvError)

  // Список проблем
  const arrwarnings = v.arr([v.enum(1, 4)]).removeFaulty()
  const result = arrwarnings.validate([4, 3, 2, 1])
  expect(result.value).toStrictEqual([4, 1])
  expect(result.error).toBeFalsy() // Разрешенные ошибки игнорируются и при ok здесь не может error
  expect(result.warning).toBeInstanceOf(CombinedError) // ... но может быть warning
  expect(result.warning?.detail.warnings).toBeInstanceOf(ErrorLikeCollection)
  // Приведем к нативному массиву, по непонятной причине, vitest не принимает ErrorLikeCollection
  expect([...result.warning!.detail.warnings!]).toMatchObject([
    // Каждое из значений - это IErrorLike.
    { message: "Не удалось подобрать совместимого типа в 'UnionModel'.", value: '2' },
    { message: "Элемент массива '[2]' проигнорирован." },
    //
    { message: "Не удалось подобрать совместимого типа в 'UnionModel'.", value: '3' },
    { message: "Элемент массива '[1]' проигнорирован." },
  ])
})

test('Freezing the model freeze()', () => {
  // Включим поднятие ошибок при конфигурировании модели
  const v = new Factory({ throwIfConfigureError: true })

  const model = v.of({ foo: 1, bar: 2 })
  expect(model.isFrozen()).toBe(false)
  const modelFrozen = model.freeze('MyModelName') // установим необязательное имя модели только для замороженных Model
  expect(model).not.toBe(modelFrozen)

  // После заморозки модели не могут менять параметры ...
  expect(() => (modelFrozen as ObjModel<any>).optional()).toThrow(ModelIsFrozenError)
  // ... но могут копировать или размораживать модель, опция заморозки будет сброшена для новой обертки
  const unfreeze = modelFrozen.copy() as ObjModel<any>
  expect(unfreeze.optional()).toBeInstanceOf(ObjModel)

  expect(model.validate({ foo: 2, bar: 3 })).toStrictEqual({ ok: true, value: { foo: 2, bar: 3 } })
  expect(modelFrozen.validate({ foo: 4, bar: 5 })).toStrictEqual({ ok: true, value: { foo: 4, bar: 5 } })
  expect(unfreeze.validate({ foo: 6, bar: 7 })).toStrictEqual({ ok: true, value: { foo: 6, bar: 7 } })

  // Ошибка на именованной модели вернет поле с именем
  expect(modelFrozen.validate(null)).toMatchObject({
    error: {
      detail: {
        // Имя модели на которой произошла ошибка, если оно было установлено freeze(name)
        // и ошибка возникла в контексе валидации этого значения
        model: 'MyModelName'
      }
    }
  })
})

test('Extending classes', () => {
  // Класс валидатора обязан реализовать единственный абстрактный метод `_validate()`
  class PhoneNumberModel extends BaseModel<JsonLike> {
    protected override _validate (ctx: Context, value: any): TRes<string> {
      if (!isString(value)) {
        return ctx.throwFaultyValueError(value, 'Expected a string')
      }
      // Получим ссылку на Metadata и проверим варианты RegExp
      const expectedType = (this._meta as Metadata<Re[]>).expectedType
      for (const re of expectedType) {
        if (re.test(value)) {
          return { ok: true, value }
        }
      }
      return ctx.throwFaultyValueError(value, 'Invalid phone number format')
    }
  }

  // Расширяем фабрику валидаторов
  class MyFactory extends Factory {
    phoneNumber (): PhoneNumberModel {
      // Добавим к фабрике новый тип, используя кеш regExp
      const re = this._regExpCache.getOf(/^\d{3}-\d{3}-\d{4}$/)
      const meta = Metadata.re(re, /* ...rest: Re[] */)
      // Последний параметр null, это ключ Model.key и здесь он не нужен.
      // Это свойство будет автоматически привязано к свойству объекта.
      return new PhoneNumberModel(this._config, this._defaultOptions, meta, null)
    }
  }

  // Используем наш валидатор
  const v = new MyFactory()

  const phoneModel = v.phoneNumber()
  expect(phoneModel.validate('123-456-7890').value).toBe('123-456-7890')
  expect(phoneModel.validate('123-456-789').error!.message).toContain('Invalid phone number format')

  // ## Продвинутый валидатор
  //
  // Конструктор Model используется внутренними методами для переноса данных, и использование его при расширении классов
  // может быть проблематичным.
  //
  // Более сложные типы данных должны расширяться через Metadata.
  // Приготовим набор данных для нашего продвинутого валидатора
  const inventory = {
    basketball: new Set(['ball', 'hoop', 'jersey']),
    swimming: new Set(['goggles', 'cap', 'fins']),
    tennis: new Set(['paddle', 'ball', 'net']),
    golf: new Set(['club', 'tee', 'ball']),
    football: new Set(['ball', 'cleats', 'pads']),
  } as const
  type TInventoryKey = keyof typeof inventory

  // Metadata обязан реализовать два метода:
  // getAllModels() - возвращает список всех моделей которые могут находится внутри, если они есть
  // copy() - копирует модель таким образом, чтобы сохранить иммутабельность, но не перегружать лишними глубокими
  //          копиями внутренних структур данных
  class InventoryMetadata extends Metadata<TInventoryKey> {
    // Универсальное свойство может быть использовано по желанию - не забывает установить тип в дженерик Metadata
    declare expectedType: TInventoryKey
    inventory: typeof inventory

    // Конструктор может быть чем угодно, но база принимает идентификатор типа TValueType
    constructor(inv: typeof inventory, key?: null | TInventoryKey) {
      super('custom') // используйте универсальный 'custom' для всех расширений
      this.inventory = inv
      this.expectedType = key ?? 'football'
    }

    override getAllModels (): null | Model<any>[] {
      // У нас нет вложенных Model и соответственно нет вложенных ошибок конфигурирования, которые собирает этот метод
      return null
    }

    override copy (): this {
      // Объект inventory неизменяем и его безопасно передать по ссылке
      return new InventoryMetadata(this.inventory, this.expectedType) as this
    }

    // Можем добавить собственные методы не конфликтующие с базовым Metadata
    hasKey (value: any): value is TInventoryKey {
      return Object.keys(inventory).includes(value)
    }

    expectedValue (value: any): boolean {
      return this.inventory[this.expectedType].has(value)
    }
  }

  // Расширяем класс валидатора.
  class InventoryModel extends BaseModel<string> {
    // Для удобства декларируем тип, чтобы не приводить `_meta as InventoryMetadata`
    declare protected readonly _meta: InventoryMetadata

    /**
     * Пользовательский метод обновления категории инвентаря. По аналогии min(number) для чисел.
     */
    inventory (key: TInventoryKey): this {
      if (this._meta.expectedType === key) {
        return this
      }
      // Проверим не заморожена ли наша модель.
      // Этот метод самостоятельно вызовет исключение, запишет ошибку или вернет null.
      const frozen = this._throwIfFrozen()
      if (frozen) {
        // Не меняем модель. Если не было исключения, внутри будет записана ошибка.
        return frozen
      }
      // Проверим валидность типа, _throwIfConfigureError вызовет исключение или зарегистрирует ошибку
      if (!this._meta.hasKey(key)) {
        return this._throwIfConfigureError(`Некорректный аргумент 'inventory(key: ${safeToJson(key)})'`)
      }
      // Копируем и оборачиваем с новой копией метаданных
      const copy = this._meta.copy()
      copy.expectedType = key
      // первый параметр this._options не изменен и будет передан по ссылке
      return this._copyWith(null, copy)
    }

    protected override _validate (ctx: Context, value: any): TRes<string> {
      if (this._meta.expectedValue(value)) {
        return { ok: true, value }
      }
      return ctx.throwFaultyValueError(safeToJson(value), `Ожидалось значение категории "${this._meta.expectedType}"`)
    }
  }

  // Расширяем фабрику
  class InventoryFactory extends Factory {
    inventory (key?: undefined | null | TInventoryKey): InventoryModel {
      // Можно было и встроить данные в InventoryMetadata, но для примера сделаем его настраиваемым
      const meta = new InventoryMetadata(inventory)
      if (meta.hasKey(key)) {
        meta.expectedType = key
      }
      return new InventoryModel(this._config, this._defaultOptions, meta, null)
    }
  }

  // Использование расширенного валидатора в приложении становиться тривиальным
  const factory = new InventoryFactory({ stopIfError: true })
  const vBase = factory.inventory()
  const vInventory = v.obj({
    basketball: factory.inventory('basketball'), // из фабрики
    golf: vBase.inventory('golf'),               // или переиспользуем
    tennis: vBase.inventory('tennis')
  })

  expect(vInventory.validate({ basketball: 'hoop', golf: /* эмитируем ошибку */ 'net', tennis: 'ball', })).toMatchObject({
    ok: true,
    value: {
      basketball: 'hoop',
      golf: null, // ошибка остановленная stopIfError()
      tennis: 'ball'
    },
    warning: {
      detail: {
        name: 'Jnv.CombinedError',
        warnings: expect.arrayContaining([
          expect.objectContaining({
            // наша ошибка
            name: 'Jnv.FaultyValueError',
            message: 'Ожидалось значение категории "golf"'
          })
        ])
      }
    }
  })

  // Тест типа не будет работать без подключения расширенных фильтров filters.ts
  // const result = vInventory.validate({ basketball: 'ball', golf: 'ball', tennis: 'ball' })
  // if (result.ok) {
  //   expectTypeOf(result.value).toEqualTypeOf<{ basketball: string, golf: string, tennis: string }>()
  // }
})

test('Type configuration errors getConfigureError()', () => {
  const v = new Factory()

  // Тип None не доступен через публичную фабрику, но внутренне используется для значений не прошедших проверку при конфигурировании.
  // Если отключены ошибки конфигурирования, любое свойство этого типа получит ошибку {ok: false, value: null}.
  // Поднятие этой ошибки будет зависеть от опций валиции.
  const none = new NoneModel(new Config(), new Options(), Metadata.none(), null)
  expect(none.validate(null)).toMatchObject({
    ok: false,
    value: null,
    error: {
      detail: {
        name: 'Jnv.NotConfiguredError',
        propertyPath: expect.any(String),
        value: 'null',
      }
    }
  })

  // Эмулировать такой тип можно установив неподдерживаемое для json значение
  // @ts-expect-error
  const unsupported = v.obj({ foo: BigInt(0) })
  expect(unsupported.validate({ foo: BigInt(0) })).toMatchObject({
    ok: false,
    value: null,
    error: {
      detail: {
        name: 'Jnv.FaultyValueError',
        errors: expect.any(ErrorLikeCollection)
      }
    }
  })

  // Описание всех ошибок доступно через getConfigureError()
  // Этот метод рекурсивно собирает ошибки от корня исследуемого типа и заворачивает в один IErrorLike с полем errors
  const configureError: null | ConfigureError = unsupported.getConfigureError()
  expect(configureError).toMatchObject({
    name: 'Jnv.CombinedError',
    detail: {
      errors: expect.any(ErrorLikeCollection)
    }
  })

  const errors: IErrorLike[] = configureError!.detail.errors!
  expect(errors).toBeInstanceOf(Array)
  expect(errors).toBeInstanceOf(ErrorLikeCollection)
  // Первый вызов этого метода удаляет все полученные ошибки.
  expect(unsupported.getConfigureError()).toBe(null)

  // Путь к ошибке состоит из <root>.foo, здесь null это наш коревой объект без имени
  // const propPath = `${propertyNameToString(null)}.foo`
  // Найдем ожидаемую ошибку с кодом ConfigureError
  const errorValue: IErrorLike = errors!.find(({ name, propertyName }) => name === 'Jnv.ConfigureError' && propertyName === 'foo')!
  expect(errorValue).toMatchObject({
    name: 'Jnv.ConfigureError',
    propertyPath: '<root>.foo',
    propertyName: 'foo'
  })

  // throw при конфигурации
  const vError = new Factory({ throwIfConfigureError: true })
  // @ts-expect-error
  expect(() => vError.arr([BigInt(1)])).toThrow(ConfigureError)
  // min не может быть больше max
  expect(() => vError.num().range(10, 0)).toThrow(ConfigureError)
})

test('Validation errors throw', () => {
  // Установим опцию выброса исключений
  const v = new Factory({ throwIfError: true })

  const nested = v.obj({ prop: v.enum(1, 2) })
  const sampleModel = v.obj({
    id: v.positive(),
    nested: nested
  })

  expect(sampleModel.validate({ id: 1, nested: { prop: 2 } })).toStrictEqual({ ok: true, value: { id: 1, nested: { prop: 2 } } })

  // Неправильный тип
  expect(() => sampleModel.validate({ id: 1, nested: { prop: 'error value' } })).toThrow(FaultyValueError)
  // Неверный id
  expect(() => sampleModel.validate({ id: 0, nested: { prop: 2 } })).toThrow(FaultyValueError)
  // Отсутствует обязательное свойство
  expect(() => sampleModel.validate({ id: 1 })).toThrow(RequiredPropertyError)

  // Ошибка вызванная на свойстве объекта, поднимается и прерывает валидацию
  // @ts-expect-error
  expect(() => v.obj({ prop: BigInt(1) }).validate({ prop: 1 })).toThrow(NotConfiguredError)
  // Но для массивов и union ошибки временно отключаются из-за подбора значений
  // и результат будет иметь общую ошибку неподходящего типа элемента массива
  // @ts-expect-error
  expect(() => v.arr([{ prop: BigInt(1) }]).validate({ prop: 1 })).toThrow(FaultyValueError)
})

test('Custom Validator', () => {
  const v = new Factory()

  // Пользовательский валидатор должен вернуть допустимый формат результата
  const vUnion = v.pipe(v.int(), v.custom((_path: TPropertyName[], _value: any) => {
    return {
      // ok: false, // необязательно если есть IErrorDetail
      // value: null,
      error: { name: 'Jnv.FaultyValueError', message: 'my error' }
    }
  }))
  expect(vUnion.validate(null)).toMatchObject({
    ok: false,
    value: null,
    error: {
      detail: {
        name: 'Jnv.FaultyValueError',
        errors: expect.any(ErrorLikeCollection)
      }
    }
  })

  // Вспомогательные утилиты сами завернут правильную ошибку
  const vCustom = v.custom((path: TPropertyName[], value: any) => {
    return errorResults.FaultyValueError(propertyPathToString(path), safeToJson(value), 'my custom error')
  })
  expect(vCustom.validate(null)).toMatchObject({
    ok: false,
    value: null,
    error: {
      name: 'Jnv.FaultyValueError',
      message: 'my custom error'
    }
  })

  // Даже если пользовательский валидатор упадет, ошибка будет поймана на верхнем уровне
  const mUnknownCustomError = v.union(1, 'ok', v.custom((_path: TPropertyName[], _value: any) => {
    // Исключение попадет в cause, а ошибка примет вид UnknownError
    throw 12345
  }))
  expect(mUnknownCustomError.validate(null)).toMatchObject({
    ok: false,
    value: null,
    error: {
      name: 'Jnv.UnknownError',
      detail: {
        message: expect.any(String), // Скорее всего здесь будет 'IErrorLike was not created'
        cause: 12345
      }
    }
  })

  // Независимо от внутренних исключений, валидатор обязан вернуть предустановленную ошибку
  // Для контроля собственных ошибок можно установить пользователькое поле и передать ошибки в cause,
  // но обязательно указать известные для jnv ошибки в IErrorDetail.name
  const vs = new Factory({ removeFaulty: true })

  const vControlledError = vs.obj({
    array: ['any string'],
    field: vs.custom((_path: TPropertyName[], _value: any) => {
      throw {
        // Пользовательское поле - любое имя со значением пригодным для приведения к строке toString() или toJSON()
        meta: 'My.Id.Error',
        cause: new Error('My internal error')
      }
    })
  })

  expect(vControlledError.validate({ array: [123], field: null })).toMatchObject({
    ok: false,
    value: null,
    error: {
      detail: {
        // Стандартизированные поля валидатора
        name: 'Jnv.UnknownError',
        // Пользовательское поле
        meta: 'My.Id.Error',
        // Ошибка
        cause: expect.objectContaining({ message: expect.stringContaining('My internal error') }),
        warnings: expect.arrayContaining([expect.objectContaining({
          propertyPath: 'array.[0]'
        })])
      }
    }
  })
})

test('Partial validation', () => {
  const v = new Factory({
    throwIfConfigureError: true,
    // массивы и объекты перезаписываются, объекты сохраняют свойства не предусмотренные моделью данных.
    createMode: 'none',
  })

  // Аналоги с интерфейсом, где у всех моделей должен быть id
  const tableRecord = v.obj({
    id: v.positive()
  })

  // Частичные модели для разных таблиц
  const userRecordPart = v.obj({
    name: v.str().nonempty()
  })
  const tagRecordPart = v.obj({
    tag: v.str().nonempty()
  })

  // Pipe-ы можно создавать с нуля, это требует минимум две модели валидации
  const userRecord = v.pipe(tableRecord, userRecordPart)
  // или просто расширить уже имеющуюся модель
  const tagRecord = tableRecord.pipe(tagRecordPart)

  expect(userRecord.validate({ id: 1, name: 'Jack' }).value).toStrictEqual({ id: 1, name: 'Jack' })
  expect(tagRecord.validate({ id: 2, tag: 'best' }).value).toStrictEqual({ id: 2, tag: 'best' })

  // ошибка на первом tableRecord - id не может быть 0
  expect(userRecord.validate({ id: 0, name: 'Jack' })).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })
  // ошибка на втором tagRecord tag - пустая строка
  expect(tagRecord.validate({ id: 2, tag: '' })).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })

  // У моделей созданных с опцией createMode:'none' не затираются свойства
  expect(tagRecord.validate({ id: 2, tag: 'best', any: null }).value).toStrictEqual({ id: 2, tag: 'best', any: null })

  // pipe может трансформировать любой тип данных.
  // важно помнить - каждая следующая модель получит то что удачно валидировала предыдущая
  const preValidator = v.str().pipe(v.custom((_, json) => {
    const value = JSON.parse(json)
    value.id += 5
    return { ok: true, value }
  }))
  expect(preValidator.pipe(tagRecord).validate('{"id":1, "tag":"json"}').value).toStrictEqual({ id: 6, tag: 'json' })

  // проверять объект внутри пользовательского валидатора нет никакой необходимости,
  // структура будет проверена дальше, а любая ошибка обработается валидатором
  expect(preValidator.pipe(tagRecord).validate('{"i...')).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })
})

test('All types', () => {
  const v = new Factory()

  // Тип не проверяется и всегда возвращает любое значение как есть.
  expect(v.raw().validate(undefined)).toStrictEqual({ ok: true, value: undefined })
  expect(v.obj({ foo: v.raw() }).def({ foo: 'bar' }).stopError().validate({}))
    .toStrictEqual({ ok: true, value: { foo: 'bar' }, warning: expect.any(Object) })
  expect(v.obj({ foo: v.raw().optional(123) }).validate({}))
    .toStrictEqual({ ok: true, value: { foo: 123 } })

  // Авто-парсер любого JsonLike типа + Regexp для строк + вложенные типы Model
  expect(v.of({ foo: /[0-7]{1}/ }).validate({ foo: '6' })).toStrictEqual({ ok: true, value: { foo: '6' } })
  expect(v.of({ foo: /[0-7]{1}/ }).validate({ foo: '8' })).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })

  expect(v.bool().validate(true)).toStrictEqual({ ok: true, value: true })
  expect(v.bool().validate(false)).toStrictEqual({ ok: true, value: false })
  expect(v.bool().validate(null)).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })

  expect(v.num().validate(1.23)).toStrictEqual({ ok: true, value: 1.23 })
  expect(v.num().validate('1')).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })
  expect(v.num().validate(BigInt(0))).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })
  expect(v.num().min(5).validate(5)).toStrictEqual({ ok: true, value: 5 })
  expect(v.num().max(5).validate(5)).toStrictEqual({ ok: true, value: 5 })
  expect(v.num().min(5).validate(4.9)).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })
  expect(v.num().max(5).validate(5.1)).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })
  expect(v.num().min(-10).max(+10).validate(-2)).toStrictEqual({ ok: true, value: -2 })
  expect(v.num().min(-10).max(+10).validate(-12))
    .toStrictEqual({ ok: false, value: null, error: expect.any(Object) })
  expect(v.num().min(-10).max(+10).validate(+12))
    .toStrictEqual({ ok: false, value: null, error: expect.any(Object) })
  // exclusive: true
  expect(v.num().min(5, true).validate(5)).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })
  expect(v.num().max(5, true).validate(5)).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })

  // альтернатива min(0) float >= 0
  expect(v.nonnegative().validate(0)).toStrictEqual({ ok: true, value: 0 })
  expect(v.nonnegative().validate(-0.0001)).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })

  // альтернатива v.num().int()
  expect(v.int().validate(5)).toStrictEqual({ ok: true, value: 5 })
  expect(v.int().validate(5.8)).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })

  // альтернатива v.num().int().min(1)
  expect(v.positive().validate(1)).toStrictEqual({ ok: true, value: 1 })
  expect(v.positive().validate(0)).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })
  expect(v.positive().validate(1.2)).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })

  expect(v.range(-10, +10).validate(0)).toStrictEqual({ ok: true, value: 0 })
  expect(v.range(-10, +10).validate(-12)).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })
  expect(v.range(-10, +10).validate(+12)).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })
  expect(v.range(-10, +10, true).validate(9.9)).toStrictEqual({ ok: true, value: 9.9 })
  expect(v.range(-10, +10, true).validate(10)).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })

  expect(v.str().validate('')).toStrictEqual({ ok: true, value: '' })
  expect(v.str().nonempty().validate('any value')).toStrictEqual({ ok: true, value: 'any value' })
  expect(v.str().nonempty().validate('')).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })

  expect(v.re(/abc/).validate('_abc_')).toStrictEqual({ ok: true, value: '_abc_' })
  expect(v.re(/abc/).min(5).validate('_abc_')).toStrictEqual({ ok: true, value: '_abc_' })
  expect(v.re(/abc/).min(6).validate('_abc_')).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })
  expect(v.re(/abc/).validate('_abXc_')).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })
  expect(v.re(/abc/, /bXc/).validate('_abXc_')).toStrictEqual({ ok: true, value: '_abXc_' })

  // null - это псевдоним v.literal(null)
  expect(v.null().validate(null)).toStrictEqual({ ok: true, value: null })
  expect(v.null().validate('not null')).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })
  expect(v.literal(1).validate(1)).toStrictEqual({ ok: true, value: 1 })
  expect(v.literal('off').validate('off')).toStrictEqual({ ok: true, value: 'off' })
  expect(v.literal('off').validate('on')).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })

  // Несколько литералов
  expect(v.enum(false, true, 'on', 'off').validate('on')).toStrictEqual({ ok: true, value: 'on' })
  expect(v.enum(false, true, 'on', 'off').validate(1)).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })

  const simpleObj = v.obj({
    a: null,
    b: true,
    c: 0,
    d: 'any str',
    e: /re/,
    nested: { f: ['str array'] },
    array: [0],
  })
  expect(simpleObj.validate({
    a: null,
    b: false,
    c: 123,
    d: 'hello',
    e: '_re_',
    nested: { f: ['one', 'two'] },
    array: [1, 2, 3],
  })).toStrictEqual({
    ok: true, value: {
      a: null,
      b: false,
      c: 123,
      d: 'hello',
      e: '_re_',
      nested: { f: ['one', 'two'] },
      array: [1, 2, 3],
    }
  })
  expect(simpleObj.validate({
    a: 'error value', // <= error type
    b: false,
    c: 123,
    d: 'hello',
    e: '_re_',
    nested: { f: ['one', 'two'] },
    array: [1, 2, 3],
  })).toStrictEqual({ ok: false, value: null, error: expect.any(Object) })

  const simpleArr = v.arr([{ foo: 0 }, { bar: '' }])
  expect(simpleArr.validate([{ foo: 123 }]))
    .toStrictEqual({ ok: true, value: [{ foo: 123 }] })
  expect(simpleArr.validate([{ foo: 123 }, { bar: 'str' }]))
    .toStrictEqual({ ok: true, value: [{ foo: 123 }, { bar: 'str' }] })
  expect(simpleArr.validate([{ foo: 123 }, { bar: 456 }]))
    .toStrictEqual({ ok: false, value: null, error: expect.any(Object) })
  // Вариант с min/max
  const numArray = v.arr([0]).range(1, 4)
  expect(numArray.validate([1, 2]))
    .toStrictEqual({ ok: true, value: [1, 2] })
  expect(numArray.validate([1, 2, 3, 4, 5]))
    .toStrictEqual({ ok: false, value: null, error: expect.any(Object) })

  // точное количество элементов и последовательность типов
  const simpleTuple = v.tuple(['str', { prop: v.enum('on', 'off') }])
  expect(simpleTuple.validate(['abc', { prop: 'on' }]))
    .toStrictEqual({ ok: true, value: ['abc', { prop: 'on' }] })
  expect(simpleTuple.validate(['abc', 'xyz', { prop: 'on' }]))
    .toStrictEqual({ ok: false, value: null, error: expect.any(Object) })

  // один из вариантов типа
  const simpleUnion = v.union(v.enum('on', 'off'), true)
  expect(simpleUnion.validate('on')).toStrictEqual({ ok: true, value: 'on' })
  expect(simpleUnion.validate(false)).toStrictEqual({ ok: true, value: false })
  expect(simpleUnion.validate('true'))
    .toStrictEqual({ ok: false, value: null, error: expect.any(Object) })

  // Пользовательская функция
  let err: null | IErrorLike | IErrorDetail = null
  function customValidate (_path: TPropertyName[], value: any): TResult<JsonLike> | TCustomResult<JsonLike> {
    if (err) {
      // @ts-expect-error Значение ok будет установлено в false, автоматически, если есть поле errors
      return { ok: true, value, error: err }
    }
    return { ok: true, value }
  }
  const simpleCustom = v.custom(customValidate)
  expect(simpleCustom.validate('my value')).toStrictEqual({ ok: true, value: 'my value' })
  err = { name: 'Jnv.UnknownError', /* propertyPath: 'это поле будет заменено, здесь нужно оставить пустую строку' */  message: 'Ошибка' }
  const result = simpleCustom.validate('my value')
  expect(result.ok).toBe(false)
  expect(result.value).toBe(null)
  expect(result?.warning ?? null).toBe(null)
  expect((result as any).error).toMatchObject({ name: 'Jnv.UnknownError', message: 'Ошибка' })

  const pipeModel = v.str().pipe(v.custom((_path, value) => ({ ok: true, value: JSON.parse(value) })))
  expect(pipeModel.validate('{"foo":1}').value).toStrictEqual({ foo: 1 })
})

test('Decomposition of an object', () => {
  const v = new Factory()

  const obj = v.obj({
    foo: v.int(),
    bar: v.str()
  })

  const name2Model = obj.decompose()

  expect(Object.keys(name2Model)).toStrictEqual(['foo', 'bar'])
  expect(name2Model.foo).toBeInstanceOf(NumModel)
  expect(name2Model.bar).toBeInstanceOf(StrModel)
})
