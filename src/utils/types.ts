export enum CmdType {
    Call = 0,
    Set = 1,
    Get = 2,
    Constructor = 3,
}
export enum SerializeType {
    Primitive = 0,
    Object = 1
}

export type PrimitiveType = number | string | bigint | boolean

export interface CallType { '0': CmdType.Call,/** objectId: */ '1': number, /** path: */ '2': string[], /** argsData: */'3': any, /** returnObjectId: */'4': number }
export interface SetType { '0': CmdType.Set, /** objectId: */ '1': number, /** path: */ '2': string[], /** valueData: */'3': any }
export interface GetType { '0': CmdType.Get, /** getId: */ '1': number, /** objectId: */ '2': number, /** path: */'3': string[], /** getResults: */ '4': any[][] }
export interface ConstructorType { '0': CmdType.Constructor, /** objectId: */ '1': number, /** path: */ '2': string[], /** argsData: */'3': any, /** returnObjectId: */ '4': number }

export type ArgsType = CallType | SetType | GetType | ConstructorType

export enum ArgEnum {
    Primitive = 0,
    Object = 1,
    Callback = 2,
    ObjectProperty = 3,
}

export interface PrimitiveArgType { '0': ArgEnum.Primitive, '1': PrimitiveType }
export interface ObjectArgType { '0': ArgEnum.Object, '1': number }
export interface CallbackArgType { '0': ArgEnum.Callback, '1': number }
export interface ObjectPropertyArgType { '0': ArgEnum.ObjectProperty, '1': number, '2': string[] }

export type ArgType = [] & (PrimitiveArgType | ObjectArgType | CallbackArgType | ObjectPropertyArgType)
