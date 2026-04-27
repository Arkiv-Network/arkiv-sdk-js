export enum AttributeValueType {
  Uint = 1,
  String = 2,
  EntityKey = 3,
}

export type Attribute = {
  key: string
  value: string | number
}
