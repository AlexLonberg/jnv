import { test, expect } from 'vitest'
import {
  type JsonLike,
  type TPropertyName,
  type TRes,
  type TResult,
  type TErrorDetail,
  type TValidateOptions,
  type TOptions,
  type Context,
  type Re,
  defaultRootName,
  isString,
  plainCopy,
  propertyNameToString,
  errorCodes,
  errorMessages,
  ConfigureError,
  NotConfiguredError,
  RequiredPropertyError,
  FaultyValueError,
  UnknownError,
  Metadata,
  DefaultConfig,
  DefaultSettings,
  NoneModel,
  BaseModel,
  ObjModel,
  RootFactory,
  Factory
} from './index.js'

test('Быстрый старт', () => {
  const v = new Factory()

  // Корневая модель может быть создана как с областью, так и без имени.
  const userModel = v/*.scope('UserModel')*/.obj({
    id: v.positive(), // эквивалентно int().min(1)
    name: v.str().min(3),
    email: /^[0-9a-z]+@[0-9a-z]+\.[a-z]+$/i, // эквивалентно v.re(...)
    gender: v.enum('male', 'female').optional(),
    // Оборачиваем объект в тип, для возможности применения .stopError() - игнорировать
    // ошибку и установить значение по умолчанию или `null`(если его нет).
    address: v.obj({
      city: v.str().nonempty(), // эквивалентно .str().min(1)
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
      details: { warnings: expect.any(Object) }
    })
  // Ошибка в User остановит валидацию
  sampleUser.id = 0
  expect(userModel.validate(plainCopy(sampleUser)))
    .toStrictEqual({
      ok: false,
      value: null,
      details: { errors: expect.any(Object) }
    })
})

test('Замена недопустимого типа', () => {
  // Параметры конфигурации доступны через JSDoc.
  const v = new Factory({
    throwIfConfigureError: true,
    createMode: 'obj'
  })

  const arrModel = v.arr([
    v.obj({ enabled: v.enum('on', 'off') })
      .def({ AhHaHa: '😋' }) // значение по умолчанию
      .stopError()           // не поднимать ошибку
  ]).freeze()

  expect(arrModel.validate([
    { enabled: 'on' },
    { enabled: 'oh no' },
    { enabled: 'off' }
  ]).value).toStrictEqual([
    { enabled: 'on' },
    { AhHaHa: '😋' },
    { enabled: 'off' }
  ])
})

test('Расширяемые области scope(Scope name, options)', () => {
  // Модели типов имеют два вида настроек обработки ошибок:
  //  + Глобальная конфигурация - определяется параметрами конструктора фабрики.
  //  + Локальные установки     - определяется методами инстанса валидатора.
  //
  // Локальная установка всегда переопределяет глобальный конфиг для любой вложенности элемента.
  // Глобальная конфигурация лишь определяет поведение по умолчанию, без необходимости явно вызвать методы инстанса.
  // Например { stopIfError: true, removeFaulty: true } автоматически установит для всех моделей model.stopError().removeFaulty().

  const v = new Factory()

  // Расширяем конфигурацию. Можно создать и вторую фабрику, но мы потеряем связь кеша regExp.
  // Параметр имени не имеет никакого значения.
  const vNullable = v.scope('Nullable', { stopIfError: true })
  const vRemovable = v.scope('Removable', { removeFaulty: true })
  const vCombined = v.scope('Combined', { stopIfError: true, removeFaulty: true })
  const itemModel = v.enum(1, 2)

  const model = v.obj({
    // При входе в эту область, элементы вернут ok:false, но контекст получит указание затереть элементы нулями(или значением по умолчанию).
    // Массив оставит элементы как валидные и не будет знать об ошибках.
    nullable: vNullable.arr([itemModel]),
    // При входе в эту область, элементы вернут ok:false, но массив получит указание проигнорировать ошибку и удалить элемент.
    removable: vRemovable.arr([itemModel]),
    // Сработает только stopIfError, removeFaulty игнорируется, так как массив не узнает об ошибках.
    combined: vCombined.arr([itemModel]),
    // А здесь мы явно говорим элементу при ошибке вернуть дефолтное значение. Массив не будет знать об ошибках.
    replace: v.arr([itemModel.def('faulty').stopError()])
  })

  expect(model.validate({
    nullable: [1, 2, 3, 1],
    removable: [1, 2, 3, 1],
    combined: [1, 2, 3, 1],
    replace: [1, 2, 3, 1]
  })).toStrictEqual({
    ok: true,
    value: {
      nullable: [1, 2, null, 1],
      removable: [1, 2, 1],
      combined: [1, 2, null, 1],
      replace: [1, 2, 'faulty', 1]
    },
    details: { warnings: expect.any(Object) }
  })

  expect(model.validate({
    nullable: [],
    removable: [3, 4, 5],
    combined: [3, 4, 5],
    replace: [3, 4, 5]
  })).toStrictEqual({
    ok: true,
    value: {
      nullable: [],
      removable: [],
      combined: [null, null, null],
      replace: ['faulty', 'faulty', 'faulty']
    },
    details: { warnings: expect.any(Object) }
  })
})

test('Заморозка freeze()', () => {
  // throwIfConfigureError - Ошибка при конфигурировании модели
  const v = new Factory({ throwIfConfigureError: true })

  const model = v.of({ foo: 1, bar: 2 })
  expect(model.isFrozen()).toBe(false)
  const modelFrozen = model.freeze()
  expect(model).not.toBe(modelFrozen)

  // После заморозки модели не могут менять параметры ...
  const re = new RegExp(errorMessages.ModelIsFrozenError(null).message.slice(0, 10))
  expect(() => (modelFrozen as ObjModel<any>).optional()).toThrow(re)
  // ... но могут копировать модель, опция заморозки будет новой обертки сброшена
  const unfreeze = modelFrozen.copy() as ObjModel<any>
  expect(unfreeze.optional()).toBeInstanceOf(ObjModel)

  expect(model.validate({ foo: 2, bar: 3 })).toStrictEqual({ ok: true, value: { foo: 2, bar: 3 } })
  expect(modelFrozen.validate({ foo: 4, bar: 5 })).toStrictEqual({ ok: true, value: { foo: 4, bar: 5 } })
  expect(unfreeze.validate({ foo: 6, bar: 7 })).toStrictEqual({ ok: true, value: { foo: 6, bar: 7 } })
})

test('Расширение классов', () => {
  // Класс валидатора обязан реализовать единственный абстрактный метод `_validate()`
  class PhoneNumberModel extends BaseModel<string> {
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

  // Есть два варианта добавления фабричной функции:
  //  1. Добавить фабричный метод к `RootFactory` и обновить конструктор удалив ненужный `RegExpCache`.
  //  2. Добавить фабричный метод к `RootFactory` и обновить класс `Factory` - это позволяет расширять конфигурацию,
  //     но чаще всего избыточно, так как методы настроек(`stopError()/removeFaulty()`) доступны на экземплярах.

  // Вариант 1 - Предполагает что MySimpleFactory станет публичной фабрикой
  class MySimpleFactory extends RootFactory {
    // Копируем сигнатуру RootFactory без RegExpCache
    constructor(options?: undefined | null | TOptions) {
      super(options)
    }

    phoneNumber (): PhoneNumberModel {
      // Добавим к фабрике новый тип, используя кеш regExp
      const re = this._regExpCache.getOf(/^\d{3}-\d{3}-\d{4}$/)
      const meta = Metadata.re(re, /* ...rest: Re[] */)
      // Последний параметр null, это ключ Model.key и здесь он не нужен.
      // Это свойство будет автоматически привязано к свойству объекта.
      return new PhoneNumberModel(this._config, this._defaultSettings, meta, null)
    }
  }

  // Вариант 2.1 - Не трогаем конструктор
  class MyRootFactory extends RootFactory {
    phoneNumber (): PhoneNumberModel {
      const re = this._regExpCache.getOf(/^\d{3}-\d{3}-\d{4}$/)
      const meta = Metadata.re(re, /* ...rest: Re[] */)
      return new PhoneNumberModel(this._config, this._defaultSettings, meta, null)
    }
  }

  // Вариант 2.2 - Полностью копируем основную Factory и заменяем RootFactory на MyRootFactory в трех местах
  class MyFactory extends MyRootFactory {
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

    scope (name: string, options?: undefined | null | TValidateOptions): MyRootFactory {
      const config = this._config.extends(options ?? null, this._getScopeNameOf(isString(name) ? name : ''))
      return new MyRootFactory(config, this._regExpCache)
    }
  }

  // Используем наш валидатор

  // Вариант 1
  const v = new MySimpleFactory()

  const phoneModel = v.phoneNumber()
  expect(phoneModel.validate('123-456-7890').value)
    .toBe('123-456-7890')
  // @ts-expect-error
  expect(phoneModel.validate('123-456-789').details.errors[0].message)
    .toContain('Invalid phone number format')

  // Вариант 2 полность эквивалентен и позволяет расширять конфигурацию
  const v2 = new MyFactory()

  const phoneModel2 = v2.phoneNumber()
  expect(phoneModel2.validate('123-456-7890').value)
    .toBe('123-456-7890')
  // @ts-expect-error
  expect(phoneModel2.validate('123-456-789').details.errors[0].message)
    .toContain('Invalid phone number format')
})

test('Ошибки конфигурирования типов getConfigureError()', () => {
  const v = new Factory()

  // Тип None не доступен через публичную фабрику, но внутренне используется для значений не прошедших проверку при конфигурировании.
  // Если отключены ошибки конфигурирования, любое свойство этого типа получит ошибку {ok: false, value: null}.
  // Поднятие этой ошибки будет зависеть от опций валиции.
  const none = new NoneModel(new DefaultConfig(), new DefaultSettings(), Metadata.none(), null)
  expect(none.validate(null)).toStrictEqual({ ok: false, value: null, details: expect.any(Object) })

  // Эмулировать такой тип можно установив неподдерживаемое для json значение
  // @ts-expect-error
  const unsupported = v.obj({ foo: BigInt(0) })
  expect(unsupported.validate({ foo: BigInt(0) })).toStrictEqual({ ok: false, value: null, details: expect.any(Object) })

  // Описание всех ошибок доступно через getConfigureError()
  // Этот метод рекурсивно собирает ошибки от корня исследуемого типа.
  const errors: TErrorDetail[] | null = unsupported.getConfigureError()
  expect(errors).toBeInstanceOf(Array)
  // Первый вызов этого метода удаляет все полученные ошибки.
  expect(unsupported.getConfigureError()).toBe(null)

  // Путь к ошибке состоит из <root>.foo, здесь null это наш коревой объект без имени
  const propPath = `${propertyNameToString(null)}.foo`
  // Найдем ожидаемую ошибку с кодом ConfigureError
  const errorValue: TErrorDetail = errors!.find(({ code, path }) => code === errorCodes.ConfigureError && path === propPath)!
  // Проверим сходится ли начало описания ошибки, для примера получим сообщение с константным началом в описании
  const errorMessage = errorMessages.ConfigureError('foo').message.slice(0, 10)

  expect(errorValue).toStrictEqual({ code: errorCodes.ConfigureError, path: propPath, message: expect.stringContaining(errorMessage) })

  // throw при конфигурации
  const vError = new Factory({ throwIfConfigureError: true })
  // @ts-expect-error
  expect(() => vError.arr([BigInt(1)])).toThrow(ConfigureError)

  expect(() => vError.num().range(10, 0)).toThrow(ConfigureError)
})

test('Ошибки валидации throw', () => {
  const v = new Factory({ throwIfError: true })

  const nested = v.obj({ prop: v.enum(1, 2) })
  const sampleModel = v.obj({
    id: v.positive(),
    nested: nested
  })

  expect(sampleModel.validate({ id: 1, nested: { prop: 2 } })).toStrictEqual({ ok: true, value: { id: 1, nested: { prop: 2 } } })

  expect(() => sampleModel.validate({ id: 1, nested: { prop: 'error value' } })).toThrow(FaultyValueError)
  expect(() => sampleModel.validate({ id: 0, nested: { prop: 2 } })).toThrow(FaultyValueError)
  expect(() => sampleModel.validate({ id: 1 })).toThrow(RequiredPropertyError)

  // Для массивов [BigInt(1)] такое не сработает из-за отключения ошибок при подборе и ошибка будет другой
  // @ts-expect-error
  const mBigint = v.obj({ prop: BigInt(1) })
  expect(() => mBigint.validate({ prop: 1 })).toThrow(NotConfiguredError)

  const mCustom = v.union(1, 'ok', v.custom((_path: TPropertyName[], _value: any) => {
    return {
      ok: false,
      value: null,
      details: { errors: [{ path: 'это значение игнорируется', code: errorCodes.FaultyValueError, message: '...' }] }
    }
  }))
  expect(() => mCustom.validate(null)).toThrow(FaultyValueError)

  const mUnknownError = v.union(1, 'ok', v.custom((_path: TPropertyName[], _value: any) => {
    throw 0
  }))
  expect(() => mUnknownError.validate(null)).toThrow(UnknownError)

  const vCustom = new Factory()
  const mUnknownCustomError = vCustom.union(1, 'ok', v.custom((_path: TPropertyName[], _value: any) => {
    throw 0
  }))
  expect(mUnknownCustomError.validate(null)).toStrictEqual({
    ok: false,
    value: null,
    details: { errors: [expect.any(Object)] }
  })
})

test('Все типы', () => {
  const v = new Factory()

  // Тип не проверяется и всегда возвращает любое значение как есть.
  expect(v.raw().validate(undefined)).toStrictEqual({ ok: true, value: undefined })
  expect(v.obj({ foo: v.raw() }).def({ foo: 'bar' }).stopError().validate({}))
    .toStrictEqual({ ok: true, value: { foo: 'bar' }, details: { warnings: expect.any(Object) } })
  expect(v.obj({ foo: v.raw().optional(123) }).validate({}))
    .toStrictEqual({ ok: true, value: { foo: 123 } })

  // Авто-парсер любого JsonLike типа + Regexp для строк + вложенные типы Model
  expect(v.of({ foo: /[0-7]{1}/ }).validate({ foo: '6' })).toStrictEqual({ ok: true, value: { foo: '6' } })
  expect(v.of({ foo: /[0-7]{1}/ }).validate({ foo: '8' })).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })

  expect(v.bool().validate(true)).toStrictEqual({ ok: true, value: true })
  expect(v.bool().validate(false)).toStrictEqual({ ok: true, value: false })
  expect(v.bool().validate(null)).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })

  expect(v.num().validate(1.23)).toStrictEqual({ ok: true, value: 1.23 })
  expect(v.num().validate('1')).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })
  expect(v.num().validate(BigInt(0))).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })
  expect(v.num().min(5).validate(5)).toStrictEqual({ ok: true, value: 5 })
  expect(v.num().max(5).validate(5)).toStrictEqual({ ok: true, value: 5 })
  expect(v.num().min(5).validate(4.9)).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })
  expect(v.num().max(5).validate(5.1)).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })
  expect(v.num().min(-10).max(+10).validate(-2)).toStrictEqual({ ok: true, value: -2 })
  expect(v.num().min(-10).max(+10).validate(-12))
    .toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })
  expect(v.num().min(-10).max(+10).validate(+12))
    .toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })
  // exclusive: true
  expect(v.num().min(5, true).validate(5)).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })
  expect(v.num().max(5, true).validate(5)).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })

  // альтернатива min(0) float >= 0
  expect(v.nonnegative().validate(0)).toStrictEqual({ ok: true, value: 0 })
  expect(v.nonnegative().validate(-0.0001)).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })

  // альтернатива v.num().int()
  expect(v.int().validate(5)).toStrictEqual({ ok: true, value: 5 })
  expect(v.int().validate(5.8)).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })

  // альтернатива v.num().int().min(1)
  expect(v.positive().validate(1)).toStrictEqual({ ok: true, value: 1 })
  expect(v.positive().validate(0)).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })
  expect(v.positive().validate(1.2)).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })

  expect(v.range(-10, +10).validate(0)).toStrictEqual({ ok: true, value: 0 })
  expect(v.range(-10, +10).validate(-12)).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })
  expect(v.range(-10, +10).validate(+12)).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })
  expect(v.range(-10, +10, true).validate(9.9)).toStrictEqual({ ok: true, value: 9.9 })
  expect(v.range(-10, +10, true).validate(10)).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })

  expect(v.str().validate('')).toStrictEqual({ ok: true, value: '' })
  expect(v.str().nonempty().validate('any value')).toStrictEqual({ ok: true, value: 'any value' })
  expect(v.str().nonempty().validate('')).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })

  expect(v.re(/abc/).validate('_abc_')).toStrictEqual({ ok: true, value: '_abc_' })
  expect(v.re(/abc/).min(5).validate('_abc_')).toStrictEqual({ ok: true, value: '_abc_' })
  expect(v.re(/abc/).min(6).validate('_abc_')).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })
  expect(v.re(/abc/).validate('_abXc_')).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })
  expect(v.re(/abc/, /bXc/).validate('_abXc_')).toStrictEqual({ ok: true, value: '_abXc_' })

  // null - это псевдоним v.literal(null)
  expect(v.null().validate(null)).toStrictEqual({ ok: true, value: null })
  expect(v.null().validate('not null')).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })
  expect(v.literal(1).validate(1)).toStrictEqual({ ok: true, value: 1 })
  expect(v.literal('off').validate('off')).toStrictEqual({ ok: true, value: 'off' })
  expect(v.literal('off').validate('on')).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })

  // Несколько литералов
  expect(v.enum(false, true, 'on', 'off').validate('on')).toStrictEqual({ ok: true, value: 'on' })
  expect(v.enum(false, true, 'on', 'off').validate(1)).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })

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
  })).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })

  const simpleArr = v.arr([{ foo: 0 }, { bar: '' }])
  expect(simpleArr.validate([{ foo: 123 }]))
    .toStrictEqual({ ok: true, value: [{ foo: 123 }] })
  expect(simpleArr.validate([{ foo: 123 }, { bar: 'str' }]))
    .toStrictEqual({ ok: true, value: [{ foo: 123 }, { bar: 'str' }] })
  expect(simpleArr.validate([{ foo: 123 }, { bar: 456 }]))
    .toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })
  // Вариант с min/max
  const numArray = v.arr([0]).range(1, 4)
  expect(numArray.validate([1, 2]))
    .toStrictEqual({ ok: true, value: [1, 2] })
  expect(numArray.validate([1, 2, 3, 4, 5]))
    .toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })

  // точное количество элементов и последовательность типов
  const simpleTuple = v.tuple(['str', { prop: v.enum('on', 'off') }])
  expect(simpleTuple.validate(['abc', { prop: 'on' }]))
    .toStrictEqual({ ok: true, value: ['abc', { prop: 'on' }] })
  expect(simpleTuple.validate(['abc', 'xyz', { prop: 'on' }]))
    .toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })

  // один из вариантов типа
  const simpleUnion = v.union(v.enum('on', 'off'), true)
  expect(simpleUnion.validate('on')).toStrictEqual({ ok: true, value: 'on' })
  expect(simpleUnion.validate(false)).toStrictEqual({ ok: true, value: false })
  expect(simpleUnion.validate('true'))
    .toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })

  // Пользовательская функция
  let err: null | TErrorDetail = null
  function customValidate (_path: TPropertyName[], value: any): TResult<JsonLike> {
    if (err) {
      // @ts-expect-error Значение ok будет установлено в false, автоматически, если есть поле errors
      return { ok: true, value, details: { errors: [err] } }
    }
    return { ok: true, value }
  }
  const simpleCustom = v.custom(customValidate)
  expect(simpleCustom.validate('my value')).toStrictEqual({ ok: true, value: 'my value' })
  err = { code: 0, path: 'это поле будет заменено, здесь нужно оставить пустую строку', message: 'Ошибка' }
  const result = simpleCustom.validate('my value')
  expect(result.ok).toBe(false)
  expect(result.value).toBe(null)
  expect(result.details?.warnings ?? null).toBe(null)
  expect((result.details as any).errors[0]).toStrictEqual({ code: 0, path: defaultRootName, message: 'Ошибка' })

  const pipeModel = v.str().pipe(v.custom((_path, value) => ({ ok: true, value: JSON.parse(value) })))
  expect(pipeModel.validate('{"foo":1}').value).toStrictEqual({ foo: 1 })
})

test('Частичная валидация', () => {
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
  expect(userRecord.validate({ id: 0, name: 'Jack' })).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })
  // ошибка на втором tagRecord tag - пустая строка
  expect(tagRecord.validate({ id: 2, tag: '' })).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })

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
  expect(preValidator.pipe(tagRecord).validate('{"i...')).toStrictEqual({ ok: false, value: null, details: { errors: expect.any(Object) } })
})
