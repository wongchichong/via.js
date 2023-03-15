import { ArgEnum, CallbackArgType, CallType, CmdType, ConstructorType, ObjectArgType, ObjectPropertyArgType, PrimitiveArgType, SetType } from "../utils/types"

export { }


declare global {
    interface Window {
        Via: ViaClass & Window & typeof globalThis
        get<T>(proxy: any): Promise<T>
        via: ViaClass & Window & typeof globalThis
    }

    const Via: ViaClass & Window & typeof globalThis
    function get<T>(proxy: any): Promise<T>
    const via: ViaClass & Window & typeof globalThis
}

// declare class FinalizationRegistry {
//     constructor(id: (id: any) => void)
//     readonly [Symbol.toStringTag]: "FinalizationRegistry"

//     /**
//      * Registers an object with the registry.
//      * @param target The target object to register.
//      * @param heldValue The value to pass to the finalizer for this object. This cannot be the
//      * target object.
//      * @param unregisterToken The token to pass to the unregister method to unregister the target
//      * object. If provided (and not undefined), this must be an object. If not provided, the target
//      * cannot be unregistered.
//      */
//     register(target: object, heldValue: any, unregisterToken?: object): void

//     /**
//      * Unregisters an object from the registry.
//      * @param unregisterToken The token that was used as the unregisterToken argument when calling
//      * register to register the target object.
//      */
//     unregister(unregisterToken: object): void

// }

export const __TargetSymbol = Symbol("TARGET")
export const __ObjectSymbol = Symbol("ID")
export const __ArgsSymbol = Symbol("ARGS")
export const __IsViaSymbol = Symbol('IsVia')

/** example
 *  [SYMBOL_$]: SYMBOL_$ * 
 */
export const IgnoreSymbols = {
    [__ArgsSymbol]: __ArgsSymbol,
    [__IsViaSymbol]: __IsViaSymbol
}


export class ViaClass {

    /**
     * Namespace for controller side (note the uppercase)
     * if (!self.Via)
     *     self.Via = {}
     * 
     * Symbols used to look up the hidden values behind the Proxy objects.
     * 
     * A FinalizationRegistry (if supported) that can identify when objects are garbage collected to notify the
     * receiver to also drop references. If this is not supported, it will unavoidably leak memory.
     */
    private finalizationRegistry = (typeof FinalizationRegistry === "undefined" ? null : new FinalizationRegistry(this.FinalizeID.bind(this)))

    constructor() {
        if (!this.finalizationRegistry)
            console.warn("[Via.js] No WeakRefs support - will leak memory")
    }
    /**
     * FinalizeID is called once per ID. To improve the efficiency when posting cleanup messages to the other
     * side, batch together all finalized IDs that happen in an interval using a timer, and post one message
     * at the end of that timer.
     */
    private finalizeTimerId = -1
    private readonly finalizeIntervalMs = 10
    private readonly finalizeIdQueue: any[] = []

    FinalizeID(id: any) {
        this.finalizeIdQueue.push(id)

        if (this.finalizeTimerId === -1)
            this.finalizeTimerId = setTimeout(this.CleanupIDs.bind(this), this.finalizeIntervalMs) as any
    }

    CleanupIDs() {
        this.finalizeTimerId = -1

        this.postMessage({
            "type": "cleanup",
            "ids": this.finalizeIdQueue
        })

        this.finalizeIdQueue.length = 0
    }

    private nextObjectId = 1						// next object ID to allocate (controller side uses positive IDs)
    private readonly queue: any[] = []				// queue of messages waiting to post
    private nextGetId = 0							// next get request ID to allocate
    private readonly pendingGetResolves = new Map()	// map of get request ID -> promise resolve function
    private nextFlushId = 0							// next flush ID to allocate
    private readonly pendingFlushResolves = new Map()	// map of flush ID -> promise resolve function
    private isPendingFlush = false						// has set a flush to run at the next microtask

    /**
     * Callback functions are assigned an ID which is passed to a call's arguments.
     * The receiver creates a shim which forwards the callback back to the controller, where
     * it's looked up in the map by its ID again and then the controller-side callback invoked.
     */
    private nextCallbackId = 0
    private readonly callbackToId = new Map<Function, number>()
    private readonly idToCallback = new Map<number, Function>()

    getNextObjectId() {
        return this.nextObjectId++
    }

    postMessage: (arg0: { type: string; ids?: any[], cmds?: any[], flushId?: number }) => any

    addToQueue(d: any) {
        this.queue.push(d)

        // Automatically flush queue at next microtask
        if (!this.isPendingFlush) {
            this.isPendingFlush = true
            Promise.resolve().then(this.flush.bind(this))
        }
    }

    // Post the queue to the receiver. Returns a promise which resolves when the receiver
    // has finished executing all the commands.
    flush() {
        this.isPendingFlush = false

        if (!this.queue.length)
            return Promise.resolve()

        const flushId = this.nextFlushId++

        this.postMessage({
            "type": "cmds",
            "cmds": this.queue,
            "flushId": flushId
        })

        this.queue.length = 0

        return new Promise(resolve => {
            this.pendingFlushResolves.set(flushId, resolve)
        })
    }

    // Called when a message received from the receiver
    onMessage(data: { type: string, getResults: any, flushId: any, id: any, args: any[], }) {
        switch (data.type) {
            case "done":
                this.onDone(data)
                break
            case "callback":
                this.onCallback(data)
                break
            default:
                throw new Error("invalid message type: " + data.type)
        }
    }

    // Called when the receiver has finished a batch of commands passed by a flush.
    onDone(data: { getResults: any; flushId: any }) {
        // Resolve any pending get requests with the values retrieved from the receiver.
        for (const [getId, valueData] of data.getResults) {
            const resolve = this.pendingGetResolves.get(getId)
            if (!resolve)
                throw new Error("invalid get id")

            this.pendingGetResolves.delete(getId)
            resolve(this.unwrapArg(valueData))
        }

        // Resolve the promise returned by the original Flush() call.
        const flushId = data.flushId
        const flushResolve = this.pendingFlushResolves.get(flushId)
        if (!flushResolve)
            throw new Error("invalid flush id")

        this.pendingFlushResolves.delete(flushId)
        flushResolve()
    }

    // Called when a callback is invoked on the receiver and this was forwarded to the controller.
    onCallback(data: { id: number; args: any[] }) {
        const func = this.idToCallback.get(data.id)
        if (!func)
            throw new Error("invalid callback id")

        const args = data.args.map(this.unwrapArg.bind(this))
        func(...args)
    }

    getCallbackId(func: Function) {
        // Lazy-create IDs
        let id = this.callbackToId.get(func)

        if (typeof id === "undefined") {
            id = this.nextCallbackId++
            this.callbackToId.set(func, id)
            this.idToCallback.set(id, func)
        }

        return id
    }
    getIdToCallback(id: number) {
        return this.idToCallback.get(id)
    }

    viaObjectHandler() {
        const THIS = this
        return {
            get(target: { /* _objectId */[__ObjectSymbol]: number }, property: any, receiver: any) {
                // Return a Via property proxy, unless the special object symbol is passed,
                // in which case return the backing object ID.
                if (property === __ObjectSymbol)
                    return target[__ObjectSymbol] //._objectId
                else if (IgnoreSymbols[property])
                    return target[IgnoreSymbols[property]]
                // else if (typeof property === 'symbol')
                //     debugger

                return THIS.makeProperty(target[__ObjectSymbol] /* ._objectId */, [property])
            },

            set(target: { /* _objectId */[__ObjectSymbol]: number }, property: any, value: any, receiver: any) {
                if (IgnoreSymbols[property])
                    target[IgnoreSymbols[property]] = value
                else if (typeof property === 'symbol')
                    debugger
                else
                    // Add a set command to the queue.
                    THIS.addToQueue([1 /* set */, target[__ObjectSymbol] /* ._objectId */, [property], THIS.wrapArg(value)])

                return true
            }
        }
    }

    ViaPropertyHandler() {
        const THIS = this

        return {
            get(target: { _nextCache: any; _path: any[]; /* _objectId */[__ObjectSymbol]: number }, property: symbol, receiver: any) {
                // Return another Via property proxy with an extra property in its path,
                // unless the special target symbol is passed, in which case return the actual target.
                if (property === __TargetSymbol)
                    return target
                if (IgnoreSymbols[property])
                    return target[property]
                // else if (property === __$Symbol)
                //     debugger
                // else if (property === __ObjectSymbol)
                //     debugger

                // It's common to repeatedly look up the same properties, e.g. calling
                // via.document.body.appendChild() in a loop. To speed this up and relieve pressure on the GC,
                // cache the proxy for the next property in the chain, so we return the same proxy every time.
                // Proxys are immutable (apart from this cache) so this doesn't change any behavior, and avoids
                // having to repeatedly re-create the Proxy and property array. Profiling shows this does help.
                const nextCache = target._nextCache
                const existing = nextCache.get(property)
                if (existing)
                    return existing

                const path = target._path.slice(0)
                path.push(property)
                const ret = THIS.makeProperty(target[__ObjectSymbol] /* ._objectId */, path)
                nextCache.set(property, ret)		// add to next property cache
                return ret
            },

            set(target: { _path: any[]; /* _objectId */[__ObjectSymbol]: any }, property: any, value: any, receiver: any) {
                if (IgnoreSymbols[property])
                    target[property] = value
                else {
                    // Add a set command to the queue, including a copy of the property path.
                    const path = target._path.slice(0)
                    path.push(property)

                    THIS.addToQueue([CmdType.Set, target[__ObjectSymbol] /* ._objectId */, path, THIS.wrapArg(value)] as SetType)
                }

                return true
            },

            apply(target: { /* _objectId */[__ObjectSymbol]: number; _path: any }, thisArg: any, argumentsList: any[]) {
                // Allocate a new object ID for the return value, add a call command to the queue, and then return
                // a Via object proxy representing the returned object ID.
                const returnObjectId = THIS.getNextObjectId()

                //todo 
                // if (target._path[0] === 'removeEventListener') {
                //     const id = THIS.callbackToId.get(argumentsList[1])

                //     THIS.idToCallback.delete(id)
                //     THIS.callbackToId.delete(argumentsList[1])
                // }

                const args = argumentsList.map(THIS.wrapArg.bind(THIS))
                target[__ArgsSymbol] = args.map(toArg)

                THIS.addToQueue([CmdType.Call, target[__ObjectSymbol] /* ._objectId */, target._path, args, returnObjectId] as CallType)

                return THIS._MakeObject(returnObjectId)
            },

            construct(target: { /* _objectId */[__ObjectSymbol]: number; _path: any }, argumentsList: any[], newTarget: any): { /* _objectId: any */[__ObjectSymbol]: number } {
                // This is the same as the apply trap except a different command is used for construct instead of call.
                // The command handler is also the same as when calling a function, except it uses 'new'.
                const returnObjectId = THIS.getNextObjectId()

                const args = argumentsList.map(THIS.wrapArg.bind(THIS))
                target[__ArgsSymbol] = args.map(toArg)
                THIS.addToQueue([CmdType.Constructor, target[__ObjectSymbol] /* ._objectId */, target._path, args, returnObjectId] as ConstructorType)

                return THIS._MakeObject(returnObjectId)
            }
        }
    }

    _MakeObject(id: number) {
        // For the apply and construct traps to work, the target must be callable.
        // So use a function object as the target, and stash the object ID on it.
        const func = function () { }
        func[__ObjectSymbol] = id //._objectId = id
        func[__IsViaSymbol] = true

        const ret = new Proxy(func, this.viaObjectHandler() as any)

        // When supported, register the returned object in the finalization registry with
        // its associated ID. This allows GC of the Proxy object to notify the receiver
        // side that its ID can be dropped, ensuring the real object can be collected
        // as well. If this is not supported it will leak memory!
        if (this.finalizationRegistry)
            this.finalizationRegistry.register(ret, id)

        return ret as any
    }

    // Wrap an argument to a small array representing the value, object, property or callback for
    // posting to the receiver.
    wrapArg(arg, _i?: number, _a?: any[]) {
        // The Proxy objects used for objects and properties identify as functions.
        // Use the special accessor symbols to see what they really are. If they're not a Proxy
        // that Via knows about, assume it is a callback function instead.
        if (typeof arg === "function") {
            // Identify Via object proxy by testing if its object symbol returns a number
            const objectId = arg[__ObjectSymbol]
            if (typeof objectId === "number")
                return [ArgEnum.Object, objectId] as ObjectArgType

            // Identify Via property proxy by testing if its target symbol returns anything
            const propertyTarget = arg[__TargetSymbol]

            if (propertyTarget)
                return [ArgEnum.ObjectProperty, propertyTarget[__ObjectSymbol] /* ._objectId */, propertyTarget._path] as ObjectPropertyArgType

            // Neither symbol applied; assume an ordinary callback function
            return [ArgEnum.Callback, this.getCallbackId(arg)] as CallbackArgType
        }
        // Pass basic types that can be transferred via postMessage as-is.
        else if (CanStructuredClone(arg)) {
            return [ArgEnum.Primitive, arg] as PrimitiveArgType
        }
        else
            throw new Error("invalid argument")
    }

    /**
     * Unwrap an argument for a callback sent by the receiver.
     * @param arr 
     * @returns 
     */
    unwrapArg(arr: any[]) {
        switch (arr[0]) {
            case 0:		// primitive
                return arr[1]
            case 1:		// object
                return this._MakeObject(arr[1])
            default:
                throw new Error("invalid arg type")
        }
    }

    // Add a command to the queue representing a get request.
    addGet<T>(objectId: number, path: string | null) {
        const getId = this.nextGetId++

        this.addToQueue([2 /* get */, getId, objectId, path])

        return new Promise<T>(resolve => {
            this.pendingGetResolves.set(getId, resolve)
        })
    }

    // Return a promise that resolves with the real value of a property, e.g. get(via.document.title).
    // This involves a message round-trip, but multiple gets can be requested in parallel, and they will
    // all be processed in the same round-trip.
    get<T>(proxy: any): Promise<T> {
        if (typeof proxy === "function") {
            // Identify Via object proxy by testing if its object symbol returns a number
            const objectId = proxy[__ObjectSymbol]
            if (typeof objectId === "number")
                return this.addGet(objectId, null)		// null path will return object itself (e.g. in case it's a primitive)

            // Identify Via property proxy by testing if its target symbol returns anything
            const target = proxy[__TargetSymbol] as any
            if (target)
                return this.addGet(target[__ObjectSymbol] /* ._objectId */, target._path)
        }

        // If the passed object isn't recognized as a Via object, just return it wrapped in a promise.
        return Promise.resolve(proxy)
    }

    makeProperty(objectId: number, path: any[]) {
        // For the apply and construct traps to work, the target must be callable.
        // So use a function object as the target, and stash the object ID and
        // the property path on it.
        const func = function () { }
        func[__ObjectSymbol] = objectId //._objectId = objectId
        func[__IsViaSymbol] = true
        func._path = path
        func._nextCache = new Map()		// for recycling sub-property lookups
        return new Proxy(func, this.ViaPropertyHandler() as any)
    }
}

// Create a default 'via' object (note the lowercase) representing the
// global object on the receiver side

if (!self.Via)
    self.Via = new ViaClass() as any

self.via = self.Via._MakeObject(0) as any
self.get = self.Via.get.bind(self.Via)


const isProxy = (proxy: any): proxy is typeof Proxy => {
    return proxy == null ? false : !!proxy[__IsViaSymbol] //!!proxy[Symbol.for("__isProxy")]
}

function CanStructuredClone<T>(o: T): o is T {
    const type = typeof o
    return type === "undefined" || o === null || type === "boolean" || type === "number" || type === "bigint" || type === "string" ||
        (o instanceof Blob) || (o instanceof ArrayBuffer) || (o instanceof ImageData) || (Array.isArray(o) && o.every(oo => isProxy(oo)) ||
            Object.keys(o).every(k => CanStructuredClone(o[k])))
}

const toArg = (arg: ObjectArgType | ObjectPropertyArgType | CallbackArgType | PrimitiveArgType, _i, _a) => arg[1]

