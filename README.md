
# 🎲 jnv | JSON Validator

Быстрый и расширяемый JSON-Валидатор.

* Простая декларативная схема.
* Смешанная декларация моделей `JsonLike + *Model<JsonLike>`.
* Регистрация ошибок конфигурирования и результата.
* Композиция валидаторов через `.pipe()`.
* Расширяемый API.
* Поддержка `TypeScript`.
* Без зависимостей.

## Установка

    npm i jnv

## 🔥 Пример использования

```ts
import { Factory } from 'jnv'

const v = new Factory()

const userModel = v.obj({
  id: v.positive(), // эквивалентно int().min(1)
  name: v.str().min(3),
  email: /^[0-9a-z]+@[0-9a-z]+\.[a-z]+$/i, // эквивалентно v.re(...)
  gender: v.enum('male', 'female').optional(),
  // stopIfError эквивалент model.stopError(null)
  // игнорировать ошибку и установить значение по умолчанию,
  // или `null` если его нет.
  address: v.scope('AddressModel', { stopIfError: true }).obj({
    city: v.str().nonempty(), // эквивалентно .str().min(1)
    street: 'any string',     // эквивалентно .str()
    zipCode: ''
  })
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
expect(userModel.validate(sampleUser)).toStrictEqual({ ok: true, value: sampleUser })
```

## API(Кратко)

**Базовые типы**

* **of()** - Автоматический парсер.
* **raw()** - Необработанный `JsonLike`.
* **bool()** - `boolean`.
* **num()/nonnegative()/int()/positive()/range()** - `number`.
* **str()/re()** - `string`
* **literal()/enum()/null()** - Литералы.
* **union()** - Один из вариантов `JsonLike`.
* **obj()** - `PlainObject`.
* **arr()** - Массивы `JsonLike[]`.
* **tuple()** - Эмуляция `Tuple`.
* **custom()** - Пользовательская функция.

**Модификаторы**

* **min()/max()/range()** - Для чисел, строк и массивов.
* **nonempty()** - Непустая строка.
* **def()** - Значение по умолчанию.
* **optional()** - Аналог необязательного свойства TS `{ prop?: type }`

**Дополнительно**

* **pipe()** - Цепочка `Model<JsonLike>`.
* **stopError()** - Не поднимать ошибку и заменить на значение по умолчанию для недопустимого типа.
* **removeFaulty()** - Удалить недопустимый элемент массива.
* **freeze()** - Запрещает дальнейшие изменения.
* **getConfigureError()** - Ошибки конфигурирования типа.

**Результат model.validate(...)**

```ts
{
  ok: boolean,
  value: T,
  details?: {
    errors?: TErrorDetail[],
    warnings?: TErrorDetail[]
  }
}
```

> Выходной объект пересоздается, но массивы используются как есть. Если вам нужна копия, следует предварительно клонировать объект.

## Больше примеров

Необязательно определять каждому вложенному типу собственный класс модели, если он не использует модификаторы. Любой Json-тип будет выведен из его JS-типа:

```ts
// Это ...
v.arr([v.obj({...})])
// ... эквивалентно
v.arr([{...}])
```

> Регулярное выражение `RegExp` приводится к типу `string` с проверкой по регулярному выражению: `{foo: /re/} => {foo: v.re(/re/, ...)}`

Единственные типы которые невозможно вывести, это литералы. Литералы допускают только Json-примитивы:

```ts
const myLiteral = v.literal('ABBR')
const myLiteral = v.enum(false, true, 0, 1, 'off', 'on')
```

Как заменить недопустимый тип массива:

```ts
const v = new Factory()

const arrModel = v.arr([
  v.obj({ enabled: v.enum('on', 'off') })
    .def({ AhHaHa: '😋' })
    .stopError()
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
```

> Модель `ArrModel` так же имеет настройку удаления недопустимого типа `ArrModel.removeFaulty()`.

## Расширение классов

Класс валидатора обязан реализовать единственный абстрактный метод `_validate()`

```ts
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

// Добавим к фабрике новый тип, используя кеш regExp
class MyFactory extends Factory {
  phoneNumber (): PhoneNumberModel {
    const re = this._regExpCache.getOf(/^\d{3}-\d{3}-\d{4}$/)
    const meta = Metadata.re(re, /* ...rest: Re[] */)
    // Последний параметр null, это ключ Model.key и здесь он не нужен.
    // Это свойство будет автоматически привязано к свойству объекта.
    return new PhoneNumberModel(this._config, meta, this._defaultSettings, null)
  }
}

// Используем наш валидатор
const v = new MyFactory()

const phoneModel = v.phoneNumber()

expect(phoneModel.validate('123-456-7890').value)
  .toBe('123-456-7890')

expect(phoneModel.validate('123-456-789').details.errors[0].message)
  .toContain('Invalid phone number format')
```
