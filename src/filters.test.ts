import { test, expectTypeOf } from 'vitest'
import type { JsonPrimitive, JsonLike, TPropertyName, TResult } from './types.js'
import { Factory } from './models.js'

// NOTE Это тест вывода типов TS и он не для запуска. Не будет работать без подключения рекурсивных фильтров типов.
// Описание в ./filters.ts
// https://vitest.dev/guide/testing-types

const v = new Factory()

test('simple types', () => {
  const mRaw = v.raw().validate(null).value
  expectTypeOf(mRaw).toEqualTypeOf<JsonLike>()

  const mNull = v.null().validate(null).value
  expectTypeOf(mNull).toEqualTypeOf<null>()

  const mBool = v.bool().validate(null).value
  expectTypeOf(mBool).toEqualTypeOf<null | boolean>()

  const mNum = v.num().validate(null).value
  expectTypeOf(mNum).toEqualTypeOf<null | number>()
  const mInt = v.int().validate(null).value
  expectTypeOf(mInt).toEqualTypeOf<null | number>()
  const mPositive = v.positive().validate(null).value
  expectTypeOf(mPositive).toEqualTypeOf<null | number>()
  const mRange = v.range(1, 2).validate(null).value
  expectTypeOf(mRange).toEqualTypeOf<null | number>()

  const mStr = v.str().validate(null).value
  expectTypeOf(mStr).toEqualTypeOf<null | string>()
  const mRe = v.re(/re/).validate(null).value
  expectTypeOf(mRe).toEqualTypeOf<null | string>()

  const mLiteral = v.literal('foo').validate(null).value
  expectTypeOf(mLiteral).toEqualTypeOf<null | 'foo'>()

  // @ts-expect-error Expected at least 1 arguments, but got 0.
  const mEnum0 = v.enum().validate(null).value
  expectTypeOf(mEnum0).toEqualTypeOf<null | JsonPrimitive>()
  const mEnum1 = v.enum('foo').validate(null).value
  expectTypeOf(mEnum1).toEqualTypeOf<null | 'foo'>()
  const mEnum2 = v.enum(1, 'foo', true).validate(null).value
  expectTypeOf(mEnum2).toEqualTypeOf<null | 1 | 'foo' | true>()
  const mEnum3 = v.enum(1, 'foo', true, null, 'bar').validate(null).value
  expectTypeOf(mEnum3).toEqualTypeOf<null | 1 | 'foo' | true | 'bar'>()

  const mObj = v.obj({ foo: 1, bar: 'any string' }).validate(null).value
  expectTypeOf(mObj).toEqualTypeOf<null | { foo: number, bar: string }>()

  const mArr = v.arr([0, null, v.literal('foo')]).validate(null).value
  expectTypeOf(mArr).toEqualTypeOf<null | (number | null | 'foo')[]>()

  const mTuple = v.tuple([1, { foo: v.literal('bar') }])
  expectTypeOf(mTuple.validate(null).value).toEqualTypeOf<null | ((number | { foo: 'bar' })[])>()

  const mUnion = v.union(1, { foo: /re/, bar: v.enum('on', 'off') }).validate(null).value
  expectTypeOf(mUnion).toEqualTypeOf<null | number | { foo: string, bar: 'on' | 'off' }>()

  const mCustom = v.custom((_path: TPropertyName[], _value: any): TResult<{ foo: string }> => { throw 0 })
  expectTypeOf(mCustom.validate(null).value).toEqualTypeOf<null | { foo: string }>()
})

test('object types', () => {
  const simpleObj = v.obj({
    id: 1,
    name: 'user',
    re: /re/,
    none: null,
    active: true,
    nested: {
      foo: 'str',
      array: [0],
      nested: { bar: /re/ }
    },
    array: [1, 'str', false]
  })

  type TExpected = {
    id: number
    name: string
    re: string
    none: null
    active: boolean
    nested: {
      foo: string
      array: number[]
      nested: {
        bar: string
      }
    }
    array: (string | number | boolean)[]
  }

  expectTypeOf(simpleObj.validate(null).value).toEqualTypeOf<null | TExpected>()
})

test('literal types', () => {
  const simpleObj = v.obj({
    name: v.literal('foo'),
    nested: {
      bar: v.enum('on', 'off'),
    },
    array: [null, v.enum(true, 'on')]
  })

  type TExpected = {
    name: 'foo'
    nested: {
      bar: 'on' | 'off'
    }
    array: (null | true | 'on')[]
  }

  expectTypeOf(simpleObj.validate(null).value).toEqualTypeOf<null | TExpected>()
})

test('optional types', () => {
  const simpleObj = v.obj({
    name: 1,
    optional: v.str().optional(), // Опциональные свойства не работают в типах
    nested: {
      bar: v.enum('on', 'off').optional()
    }
  })

  type TExpected = {
    name: number
    optional: string
    nested: {
      bar: 'on' | 'off'
    }
  }

  expectTypeOf(simpleObj.validate(null).value).toEqualTypeOf<null | TExpected>()
})

test('pipe types', () => {
  const strModel = v.str()
  const customModel = v.custom((_path, _value) => null as any)
  const objModel = v.obj({
    id: 1,
    name: 'any string',
    nested: {
      arr: [0]
    }
  })

  type TExpected = {
    id: number,
    name: string,
    nested: {
      arr: number[]
    }
  }

  // Вариант экземпляра
  // @ts-expect-error нужен хотя бы один аргумент
  expectTypeOf(strModel.pipe().validate(null).value).toEqualTypeOf<null | string>()
  expectTypeOf(strModel.pipe(objModel).validate(null).value).toEqualTypeOf<null | TExpected>()
  expectTypeOf(strModel.pipe(customModel, objModel).validate(null).value).toEqualTypeOf<null | TExpected>()
  // Вариант фабрики
  // @ts-expect-error нельзя вызвать с одним аргументом
  expectTypeOf(v.pipe(strModel).validate(null).value).toEqualTypeOf<null | JsonLike>()
  expectTypeOf(v.pipe(strModel, objModel).validate(null).value).toEqualTypeOf<null | TExpected>()
  expectTypeOf(v.pipe(strModel, customModel, objModel).validate(null).value).toEqualTypeOf<null | TExpected>()

  // Вложенный pipe
  const withPipe = v.obj({
    nested: {
      pipe: v.str().pipe(v.obj({ foo: 123 }))
    }
  })
  type TPipeExpected = {
    nested: {
      pipe: {
        foo: number
      }
    }
  }
  expectTypeOf(withPipe.validate(null).value).toEqualTypeOf<null | TPipeExpected>()
})
