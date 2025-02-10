
# Dev

## Архитектура

Основные классы:

* [Factory](./src/models.ts) - Фабрика типов.
* [Config](./src/config.ts) - Базовые настройки для всех создаваемых типов.
* [Settings](./src/settings.ts) - Локальные настройки типа.
* [Metadata](./src/metadata.ts) - Контейнер хранения информации о типе.
* [*Model](./src/models.ts) - Обертки над типами с привязкой к свойствам объектов `{config, settings, meta, key}`.
* [Context](./src/context.ts) - Временный класс для отслеживания параметров текущей ветки(свойства объекта) при валидации значений, а также регистрации ошибок.

### Устройство *Model

Классы моделей `*Model` представляют из себя легкие обертки, имеющие только ссылки на `Config/Settings/Metadata` и привязку к имени свойства объекта `key`(если она есть). Изменение любой настройки(`Settings/Metadata`) не меняет инстанс, а лишь вызывает копирование измененного параметра и оборачивание в новый экземпляр.

В этом примере все три внутренних свойства ссылаются на одни параметры типа(за исключением `box`), но обертки привязаны к разным ключам:

```ts
const numModel = v.num() // NumModel.key === null
const objModel = v.obj({
  foo: numModel, // key === 'foo'
  bar: numModel, // key === 'bar'
  box: numModel.stopError()  // key === 'box' and Settings.copy({stopIfError: true})
})
```

Структура корневой модели, например Plain-объекта, подобна вложенным массивам и соответствует первоначальному определению модели:

```
ObjModel: [
  NumModel:'foo',
  NumModel:'bar',
  NumModel:'box'
]
```

### Обход дерева моделей

Проверка входного типа начинается с обхода дерева моделей и передает текущую ветку(свойство объекта) ожидаемой модели. Модель проверяет соответствие значения ожидаемому типу(используя `Metadata` как контейнер для хранения информации о типе) и возвращает соответствующий результат `{ok, value}`. 

```ts
// StrModel
if(!isString(value)){
  return ctx.throwFaultyValueError(value, 'Ожидался type string.') // {ok: false, ...}
}
return { ok: true, value }
```

Модели всегда возвращают `{ok: true, ...}` или вызывают функции контекста. Роль `Context`: определить текущие параметры ветки и вернуть ожидаемый результат при ошибке(например `null` при `stopError()`) или поднять исключение. Если контекст возвращает `{ok: false}`, модель прерывает валидацию и поднимает ошибку выше по дереву. `Context` регистрирует ошибки и предупреждения, которые можно получить по окончании валидации типа.

Внутренний механизм валидации свойства объекта выглядит так:

```ts
if (hasOwn(value, key)) {
  const { ok, value: v } = privateValidate(model, ctx, value[key])
  if (!ok) {
    // Нет смысла продолжать обход свойств,
    // объект уже не прошел проверку и мы поднимаем ошибку
    return ctx.throwFaultyValueError(value[key], '...')
  }
  target[key] = v
}
```

### Расширение типов и ограничения

Как видно из описания выше: модели, привязываясь к свойствам или изменяя параметры, копируют ссылки на внутренние параметры(`Config/Settings/Metadata`) и вызывают конструкторы со строго определенным списком параметров `constructor(config, settings, meta, key)`. Из чего следует: расширяемые классы не могут иметь собственных конструкторов и свойств.

Добавление пользовательского типа к API Factory предполагает:

* Расширение базового класса `Model/BaseModel/BaseRangeModel`, чаще всего это `BaseModel`(у него есть минимальные `def()/optional()/stopError()`), и реализация единственного метода `protected _validate(ctx, value)`.
* Добавление функции к фабрике моделей `RootFactory.myType(): MyType`.

Расширяемые классы, для хранения параметров типа, должны использовать базовые подтипы `Metadata`. Базовые подтипы `Metadata` покрывают все варианты хранения информации о Json-типе: литералы, min/max для чисел, список регулярных выражений для строк или список дочерних моделей.

Если типу не нужны данные, можно и вовсе не использовать `Metadata`, а выбрать любой подходящий подтип. Например мы можем использовать `RegExp` не прибегая к кешу фабрики `RootFactory._regExpCache`:

```ts
// Здесь мы укажем дженерик подтипа string
class StrNumberModel extends BaseModel<string> {
  protected override _validate (ctx: Context, value: any): TRes<string> {
    if (isString(value) && /^[0-9]+$/.test(value)) {
      return {ok: true, value}
    }
    return ctx.throwFaultyValueError(value, 'Invalid number format')
  }
}
```

Тогда стандартная реализация фабричной функции может быть очень простой:

```ts
import { RootFactory as _RootFactory, Factory as _Factory } from 'jnv'

class RootFactory extends _RootFactory {
  strNumber (): StrNumberModel {
    // Стандартный конструктор должен получить:
    // + ссылку на общую конфигурацию
    // + настройки по умолчанию, пока они не меняются копия не нужна    
    // + метаданные типа для реализованного типа StrNumberModel,
    //   но в примере мы его не используем и берем подходящий подтип
    // + ключ(имя свойства) будет привязан автоматически и здесь он остается null
    return new StrNumberModel(this._config, this._defaultSettings, Metadata.str(), null)
  }
}
```

Здесь не приводится пример реализации `Factory` для обновленного `RootFactory`, но пример можно увидеть в [index.test.ts](./src/index.test.ts) - все сводится к банальному копированию класса и замене `RootFactory` на пользовательский.

> Несмотря на то что `jnv` предназначен для валидации `JsonLike` типов, модели могут возвратить любой тип и даже класс. Результат после валидации применяется к свойству и не модифицируется.

Если модель должна хранить метаданные, не предусмотренные стандартными подтипами `Metadata`, можно расширить свой класс. Основная задача правильно реализовать функцию `Metadata.copy()`.

```ts
class MyMetadata<T> extends Metadata<T> {
  myPropertyForMyType: T

  override copy(): Metadata<T> {
    const meta = new Metadata<any>(this._type)
    // копируем стандартное тело этого метода
    // ...
    // и добавляем копирование собственного свойства
    meta.myPropertyForMyType = copyMyProperty(this.myPropertyForMyType)
  }
}
```

Остается применить этот класс в функции фабрики и, если нужно, передать аргументы:

```ts
class RootFactory extends _RootFactory {
  strNumber (args: any): StrNumberModel {
    return new StrNumberModel(this._config, this._defaultSettings, new MyMetadata(args), null)
  }
}
```

Теперь обратится к метаданным можно из собственного класса и, при необходимости, создать функции модификации похожие на `min()/max()` и т.п.

```ts
class StrNumberModel extends BaseModel<string> {

  // Добавляем любые методы модификации типа
  myModifier(newValue: type): this {
    // Обязательно проверяем не заморожен ли объект
    if (this._meta.myPropertyForMyType === newValue || this._throwIfFrozen()) {
      return this
    }
    const meta = this._meta.copy()
    meta.myPropertyForMyType = newValue
    // Передаем копию meta в функцию копирования текущего инстанса.
    // config и settings передаются конструктору по ссылке, так как не модифицированы
    return this._copyWith(null, null, meta)
  }

  protected override _validate (ctx: Context, value: any): TRes<string> {
    const meta = this._meta as MyMetadata
    // ...
  }
}
```

## Использование проекта с *.ts файлами без предварительной компиляции

Сырой проект может использоваться как локальная зависимость для `Vite/Vue` или бандлеров разрешающих пути `.ts` файлов из `package.json` и позволяющих использовать TS-типы.

Локальная зависимость устанавливается как и обычный пакет `npm`:

    npm i C:/.../jnv
