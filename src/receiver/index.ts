export { }

import '../controller/index'
import { PrimitiveType, SerializeType, ArgType, ArgEnum, ArgsType, CmdType } from '../utils/types'

const attributesBoolean = new Set(['allowfullscreen', 'async', 'autofocus', 'autoplay', 'checked', 'controls', 'default', 'disabled', 'formnovalidate', 'hidden', 'indeterminate', 'ismap', 'loop', 'multiple', 'muted', 'nomodule', 'novalidate', 'open', 'playsinline', 'readonly', 'required', 'reversed', 'seamless', 'selected'])
const attributeCamelCasedRe = /e(r[HRWrv]|[Vawy])|Con|l(e[Tcs]|c)|s(eP|y)|a(t[rt]|u|v)|Of|Ex|f[XYa]|gt|hR|d[Pg]|t[TXYd]|[UZq]/ //URL: https://regex101.com/r/I8Wm4S/1
const attributesCache: Record<string, string> = {}
const uppercaseRe = /[A-Z]/g

const normalizeKeySvg = (key: string): string => attributesCache[key] || (attributesCache[key] = attributeCamelCasedRe.test(key) ? key : key.replace(uppercaseRe, char => `-${char.toLowerCase()}`))
const isNil = (value: unknown): value is null | undefined => value === null || value === undefined
const toKey = (key: string) => key === 'xlinkHref' || key === 'xlink:href' ? 'href' : normalizeKeySvg(key)

// Namespace for receiver side (which receives calls from the controller side)
class ViaReceiverClass {

    // The master map of object ID to the real object. Object ID 0 is always the global object on
    // the receiver (i.e. window or self). IDs are removed by cleanup messages, which are sent
    // by the controller when the Proxy with that ID is garbage collected (which requires WeakCell
    // support), indicating it cannot be used any more. This is important to avoid a memory leak,
    // since if the IDs are left behind they will prevent the associated object being collected.
    readonly idMap = new Map([[0, self]])

    // Some objects are allocated an ID here on the receiver side, when running callbacks with
    // object parameters. To avoid ID collisions with the controller, receiver object IDs are
    // negative and decrement, and controller object IDs are positive and increment.
    nextObjectId = -1
    postMessage: (arg0: { type?: string; id?: number, args?: any[], cmds?: any[], flushId?: number, getResults?: any[] }) => any

    // Wrap an argument. This is used for sending values back to the controller. Anything that can be directly
    // posted is sent as-is, but any kind of object is represented by its object ID instead.
    WrapArg<T extends PrimitiveType | Function | Object>(arg: T): [number, PrimitiveType | T] {
        if (CanStructuredClone(arg))
            return [SerializeType.Primitive, arg as T]
        else
            return [SerializeType.Object, this.ObjectToId(arg)]
    }


    // Get the real object from an ID.
    IdToObject(id: number) {
        const ret = this.idMap.get(id)

        if (typeof ret === "undefined")
            throw new Error("missing object id: " + id)

        return ret
    }

    // Allocate new ID for an object on the receiver side.
    // The receiver uses negative IDs to prevent ID collisions with the controller.
    ObjectToId(object) {
        const id = this.nextObjectId--
        this.idMap.set(id, object)
        return id
    }

    // Get the real value from an ID and a property path, e.g. object ID 0, path ["document", "title"]
    // will return window.document.title.
    IdToObjectProperty(id: number, path: string[]) {
        const ret = this.idMap.get(id)

        if (typeof ret === "undefined")
            throw new Error("missing object id: " + id)

        let base = ret

        for (let i = 0, len = path.length; i < len; ++i)
            base = base[path[i]]

        return base
    }

    private readonly callbackToId = new Map<Function, number>()
    private readonly idToCallback = new Map<number, Function>()

    // Get a shim function for a given callback ID. This creates a new function that forwards the
    // call with its arguments to the controller, where it will run the real callback.
    // Callback functions are not re-used to allow them to be garbage collected normally.
    GetCallbackShim(id: number) {
        if (this.idToCallback.has(id)) {
            // console.log('GetCallbackShim ret: ', id)
            return this.idToCallback.get(id)
        }

        const f = (...args: any[]) => this.postMessage({
            "type": "callback",
            "id": id,
            "args": args.map(this.WrapArg.bind(this))
        })

        // console.log('GetCallbackShim add: ', id)

        this.callbackToId.set(f, id)
        this.idToCallback.set(id, f)
        return f
    }


    // Unwrap an argument sent from the controller. Arguments are transported as small arrays indicating
    // the type and any object IDs/property paths, so they can be looked up on the receiver side.
    UnwrapArg(arr: ArgType) {
        switch (arr[0]) {
            case ArgEnum.Primitive:
                return arr[1]
            case ArgEnum.Object:
                return this.IdToObject(arr[1])
            case ArgEnum.Callback:
                return this.GetCallbackShim(arr[1])
            case ArgEnum.ObjectProperty:
                return this.IdToObjectProperty(arr[1], arr[2])
            default:
                throw new Error("invalid arg type")
        }
    }

    // Called when receiving a message from the controller.
    OnMessage(data) {
        switch (data.type) {
            case "cmds":
                this.OnCommandsMessage(data)
                break
            case "cleanup":
                this.OnCleanupMessage(data)
                break
            default:
                console.error("Unknown message type: " + data.type)
                break
        }
    }


    OnCommandsMessage(data: { cmds: any[], flushId: number }) {
        const getResults = []		// list of values requested to pass back to controller

        // Run all sent commands
        // for (const cmd of data.cmds) {
        //     RunCommand(cmd, getResults)
        // }
        data.cmds.forEach((cmd, i, a) => {
            // if (i === 14)
            //     debugger
            this.RunCommand(cmd, getResults)
        })
        //
        // Post back that we're done (so the flush promise resolves), and pass along any get values.
        this.postMessage({
            type: "done",
            flushId: data.flushId,
            getResults: getResults
        })
    }

    RunCommand(arr: ArgsType, getResults: [number, [number, PrimitiveType]][]) {
        const type = arr[0]
        //const ViaCall = this.ViaCall.bind(this)

        switch (type) {
            case CmdType.Call:
                this.ViaCall(arr[1], arr[2], arr[3], arr[4])
                break
            case CmdType.Set:
                this.ViaSet(arr[1], arr[2], arr[3])
                break
            case CmdType.Get:
                this.ViaGet(arr[1], arr[2], arr[3], getResults)
                break
            case CmdType.Constructor:
                this.ViaConstruct(arr[1], arr[2], arr[3], arr[4])
                break
            default:
                throw new Error("invalid cmd type: " + type)
        }
    }

    ViaCall(objectId: number, path: string[], argsData: ArgType, returnObjectId: number) {
        const obj = this.IdToObject(objectId)
        const args = argsData.map(this.UnwrapArg.bind(this))
        const methodName = path[path.length - 1]

        let base = obj as any

        for (let i = 0, len = path.length - 1; i < len; ++i)
            base = base[path[i]]

        if (methodName === "removeEventListener") {
            // debugger
            const key = argsData[0][1]
            const id = argsData[1][1]
            console.log("removeEventListener", key, id)
            const f = this.idToCallback.get(id)
            const ret = base.removeEventListener(key, f)

            this.idToCallback.delete(id)
            this.callbackToId.delete(f)

            // base[methodName] = null
            this.idMap.set(returnObjectId, ret)
        }
        else if (methodName === 'setAttribute' && (args[0] === 'tabIndex' || base['isSVG'])) {
            if (args[0] === 'tabIndex') {//already set in ViaSet
            }
            else {
                const ret = base.setAttribute(toKey(args[0] as string), args[1])
                this.idMap.set(returnObjectId, ret)
            }
        }
        else {
            const ret = base[methodName](...args.map(a => Array.isArray(a) ? [].slice.call(a) : a).flat())
            this.idMap.set(returnObjectId, ret)
        }
    }

    ViaConstruct(objectId: number, path: string[], argsData: ArgType, returnObjectId: number) {
        const obj = this.IdToObject(objectId)
        const args = argsData.map(this.UnwrapArg.bind(this))
        const methodName = path[path.length - 1]

        let base = obj as any

        for (let i = 0, len = path.length - 1; i < len; ++i)
            base = base[path[i]]

        const ret = new base[methodName](...args)
        this.idMap.set(returnObjectId, ret)
    }

    ViaSet(objectId: number, path: string[], valueData: ArgType) {
        const obj = this.IdToObject(objectId)
        const value = this.UnwrapArg(valueData)
        const propertyName = path[path.length - 1]

        let base = obj as any as HTMLElement

        for (let i = 0, len = path.length - 1; i < len; ++i)
            base = base[path[i]]

        if (propertyName === 'tabIndex' && typeof value === 'undefined')
            base.removeAttribute('tabIndex')
        else if (base['isSVG']) {
            const key = toKey(propertyName)

            if (isNil(value) || ((value === false) && attributesBoolean.has(key)))
                base.removeAttribute(key)
            else
                base.setAttribute(key, String(value))
        }
        else
            base[propertyName] = value
    }

    ViaGet(getId: number, objectId: number, path: string[], getResults: [number, [number, PrimitiveType]][]) {
        const obj = this.IdToObject(objectId)

        if (path === null) {
            getResults.push([getId, this.WrapArg(obj) as [number, PrimitiveType]])
            return
        }

        const propertyName = path[path.length - 1]

        let base = obj as any as HTMLElement

        for (let i = 0, len = path.length - 1; i < len; ++i)
            base = base[path[i]]

        const value = base['isSVG'] ? base.getAttribute(toKey(propertyName)) : base[propertyName]
        getResults.push([getId, this.WrapArg(value)])
    }

    OnCleanupMessage(data) {
        // Delete a list of IDs sent from the controller from the ID map. This happens when
        // the Proxys on the controller side with these IDs are garbage collected, so the IDs
        // on the receiver can be dropped ensuring the associated objects can be collected.
        for (const id of data.ids)
            this.idMap.delete(id)
    }
}


function CanStructuredClone<T>(o: T): o is T {
    const type = typeof o
    return type === "undefined" || o === null || type === "boolean" || type === "number" || type === "bigint" || type === "string" ||
        (o instanceof Blob) || (o instanceof ArrayBuffer) || (o instanceof ImageData) //|| (Array.isArray(o) && o.every(oo => isProxy(oo)) ||
    // Object.keys(o).every(k => CanStructuredClone(o[k])))
}


declare global {
    interface Window {
        ViaReceiver: ViaReceiverClass & Window & typeof globalThis
    }
}


self.ViaReceiver = new ViaReceiverClass() as any
