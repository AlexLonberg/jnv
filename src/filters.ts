import type {
  JsonPrimitive,
  JsonObject,
  JsonArray,
  JsonLike
} from './types.js'
import type {
  TModelLiteralLike,
  TModelPrimitiveLike,
  TModelObjectLike,
  TModelArrayLike,
  TModelLike,
  Model,
  // BaseModel,
  // BaseRangeModel,
  // PipeModel,
  // RawModel,
  // CustomModel,
  // BoolModel,
  // NumModel,
  // StrModel,
  // LiteralModel,
  // EnumModel,
  // ObjModel,
  // ArrModel,
  // TupleModel,
  // UnionModel
} from './models.js'

// NOTE Этот файл содержит два набора типов:
//
// 1. РЕКУРСИВНЫЕ ТИПЫ (для проверки логики вывода типов filters.test.ts):
//    - Позволяют выводит JsonLike тип модели из смешанной декларации моделей.
//    - Используются ТОЛЬКО для проверки корректности вывода типов в тестах.
//    - НЕ используются в основном коде приложения.
//    - Вызывают жуткие тормоза IDE при редактировании кода.
//    - Чтобы включить этот режим, РАСКОММЕНТИРУЙТЕ эту секцию и ЗАКОММЕНТИРУЙТЕ секцию "Упрощенные типы".
//    - Тесты в файле `filters.test.ts`

// type UJsonLiteralFilter<T extends TModelLiteralLike> =
//   T extends JsonPrimitive
//   ? T
//   : T extends LiteralModel<infer V>
//   ? V
//   : T extends EnumModel<infer V>
//   ? V
//   : never

// type UJsonPrimitiveFilter<T extends TModelPrimitiveLike> =
//   T extends null
//   ? null
//   : T extends (boolean | BoolModel)
//   ? boolean
//   : T extends (number | NumModel)
//   ? number
//   : T extends (string | RegExp | StrModel)
//   ? string
//   : T extends LiteralModel<infer V>
//   ? V
//   : T extends EnumModel<infer V>
//   ? V
//   : T extends UnionModel<infer V>
//   ? V
//   : never

// type UJsonObjectFilter<T extends TModelObjectLike> = { [K in keyof T]: T[K] extends TModelLike ? UJsonMultiFilter<T[K]> : never }

// type UJsonArrayFilter<T extends TModelArrayLike> =
//   T extends (infer V)[]
//   ? (V extends TModelLike ? UJsonMultiFilter<V> : never)[]
//   : never

// type UJsonMultiFilter<T extends TModelLike> =
//   T extends RawModel
//   ? JsonLike
//   : T extends TModelPrimitiveLike
//   ? UJsonPrimitiveFilter<T>
//   : T extends TModelObjectLike
//   ? UJsonObjectFilter<T>
//   : T extends TModelArrayLike
//   ? UJsonArrayFilter<T>
//   : T extends TModelLiteralLike
//   ? UJsonLiteralFilter<T>
//   : T extends ObjModel<infer V>
//   ? V
//   : T extends ArrModel<infer V>
//   ? V
//   : T extends TupleModel<infer V>
//   ? V
//   : T extends UnionModel<infer V>
//   ? V
//   : T extends CustomModel<infer V>
//   ? V
//   : T extends PipeModel<infer V>
//   ? V
//   : T extends Model<infer V>
//   ? V
//   : never

// type UJsonPipeLast<L extends Model<JsonLike>, T extends Model<JsonLike>> =
//   L extends Model<infer V>
//   ? V
//   : (T extends Model<infer V> ? V : never)

// 2. УПРОЩЕННЫЕ ТИПЫ (для работы):
//    - Используются в основном коде приложения.
//    - Не обеспечивают вывода точности типов, как рекурсивные типы, но не влияют на производительность.
//    - Чтобы включить этот режим, ЗАКОММЕНТИРУЙТЕ секцию "Рекурсивные типы" и РАСКОММЕНТИРУЙТЕ эту секцию.

type UJsonLiteralFilter<_T extends TModelLiteralLike> = JsonPrimitive
type UJsonPrimitiveFilter<_T extends TModelPrimitiveLike> = JsonPrimitive
type UJsonObjectFilter<_T extends TModelObjectLike> = JsonObject
type UJsonArrayFilter<_T extends TModelArrayLike> = JsonArray
type UJsonMultiFilter<_T extends TModelLike> = JsonLike
type UJsonPipeLast<_L extends Model<JsonLike>, _T extends Model<JsonLike>> = JsonLike

export type {
  UJsonLiteralFilter,
  UJsonPrimitiveFilter,
  UJsonObjectFilter,
  UJsonArrayFilter,
  UJsonMultiFilter,
  UJsonPipeLast
}
