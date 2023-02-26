// export * from './object'
// export * from './property'
// export * from './controller'

export { }


declare global {
    export interface ViaType {
        // __TargetSymbol: symbol,
        // __ObjectSymbol: symbol,

        _AddToQueue(arg0: any[]): any
        _WrapArg(arg: any, i?: any, a?: any): any
        _MakeObject: (id: any) => { /* _objectId: any */[__ObjectSymbol]: number }
        finalizationRegistry: any
        postMessage(arg0: { type: string; ids?: any[], cmds?: any[], flushId?: number }): any
        _GetNextObjectId: () => number
        Flush(Flush: any): any
        OnMessage: (data: {
            type: string,
            getResults: any
            flushId: any
            id: any
            args: any[]
        }) => void
        _UnwrapArg(valueData: any): any
        _MakeProperty(_objectId: number, arg1: any[]): any
    }

    interface Window {
        Via: ViaType & Window & typeof globalThis
        get<T>(proxy: any): Promise<T>
        via: ViaType & Window & typeof globalThis
    }

    const Via: ViaType & Window & typeof globalThis
    function get<T>(proxy: any): Promise<T>
    const via: ViaType & Window & typeof globalThis

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

import { SYMBOL_$, SYMBOL_VALUE, Box, unboxing } from 'oby'
export const __TargetSymbol = Symbol("TARGET")
export const __ObjectSymbol = Symbol("ID")
// export const __$Symbol = SYMBOL_$

export const SkipSymbol = {
    [SYMBOL_$]: SYMBOL_$,
    [SYMBOL_VALUE]: SYMBOL_VALUE
}

const Via: ViaType = (!self.Via) ? self.Via = {

} as ViaType & Window & typeof globalThis : self.Via

const ViaObjectHandler =
{
    get(target: { /* _objectId */[__ObjectSymbol]: number }, property: any, receiver: any) {
        // Return a Via property proxy, unless the special object symbol is passed,
        // in which case return the backing object ID.
        if (property === __ObjectSymbol)
            return target[__ObjectSymbol] //._objectId
        else if (SkipSymbol[property])
            return target[SkipSymbol[property]]
        // else if (typeof property === 'symbol')
        //     debugger

        return Via._MakeProperty(target[__ObjectSymbol] /* ._objectId */, [property])
    },

    set(target: { /* _objectId */[__ObjectSymbol]: number }, property: any, value: any, receiver: any) {
        if (SkipSymbol[property])
            target[SkipSymbol[property]] = value
        else if (typeof property === 'symbol')
            debugger
        else
            // Add a set command to the queue.
            Via._AddToQueue([1 /* set */, target[__ObjectSymbol] /* ._objectId */, [property], Via._WrapArg(value)])

        return true
    }
}

Via._MakeObject = function (id: any) {
    // For the apply and construct traps to work, the target must be callable.
    // So use a function object as the target, and stash the object ID on it.
    const func = function () { }
    func[__ObjectSymbol] = id //._objectId = id
    const ret = new Proxy(func, ViaObjectHandler as any)

    // When supported, register the returned object in the finalization registry with
    // its associated ID. This allows GC of the Proxy object to notify the receiver
    // side that its ID can be dropped, ensuring the real object can be collected
    // as well. If this is not supported it will leak memory!
    if (Via.finalizationRegistry)
        Via.finalizationRegistry.register(ret, id)

    return ret as any
}


// Namespace for controller side (note the uppercase)
// if (!self.Via)
//     self.Via = {}

// Symbols used to look up the hidden values behind the Proxy objects.

// A FinalizationRegistry (if supported) that can identify when objects are garbage collected to notify the
// receiver to also drop references. If this is not supported, it will unavoidably leak memory.
Via.finalizationRegistry = (typeof FinalizationRegistry === "undefined" ? null : new FinalizationRegistry(FinalizeID))

if (!Via.finalizationRegistry)
    console.warn("[Via.js] No WeakRefs support - will leak memory")

// FinalizeID is called once per ID. To improve the efficiency when posting cleanup messages to the other
// side, batch together all finalized IDs that happen in an interval using a timer, and post one message
// at the end of that timer.
let finalizeTimerId = -1
const finalizeIntervalMs = 10
const finalizeIdQueue: any[] = []

function FinalizeID(id: any) {
    finalizeIdQueue.push(id)

    if (finalizeTimerId === -1)
        finalizeTimerId = setTimeout(CleanupIDs, finalizeIntervalMs) as any
}

function CleanupIDs() {
    finalizeTimerId = -1

    Via.postMessage({
        "type": "cleanup",
        "ids": finalizeIdQueue
    })

    finalizeIdQueue.length = 0
}

let nextObjectId = 1							// next object ID to allocate (controller side uses positive IDs)
const queue: any[] = []								// queue of messages waiting to post
let nextGetId = 0								// next get request ID to allocate
const pendingGetResolves = new Map()			// map of get request ID -> promise resolve function
let nextFlushId = 0							// next flush ID to allocate
const pendingFlushResolves = new Map()			// map of flush ID -> promise resolve function
let isPendingFlush = false						// has set a flush to run at the next microtask

// Callback functions are assigned an ID which is passed to a call's arguments.
// The receiver creates a shim which forwards the callback back to the controller, where
// it's looked up in the map by its ID again and then the controller-side callback invoked.
let nextCallbackId = 0
const callbackToId = new Map()
const idToCallback = new Map()

// Create a default 'via' object (note the lowercase) representing the
// global object on the receiver side
self.via = Via._MakeObject(0) as any

Via._GetNextObjectId = function () {
    return nextObjectId++
}

Via._AddToQueue = function (d: any) {
    queue.push(d)

    // Automatically flush queue at next microtask
    if (!isPendingFlush) {
        isPendingFlush = true
        Promise.resolve().then(Via.Flush)
    }
}

// Post the queue to the receiver. Returns a promise which resolves when the receiver
// has finished executing all the commands.
Via.Flush = function () {
    isPendingFlush = false

    if (!queue.length)
        return Promise.resolve()

    const flushId = nextFlushId++

    Via.postMessage({
        "type": "cmds",
        "cmds": queue,
        "flushId": flushId
    })

    queue.length = 0

    return new Promise(resolve => {
        pendingFlushResolves.set(flushId, resolve)
    })
}

// Called when a message received from the receiver
Via.OnMessage = function (data: {
    type: string,
    getResults: any
    flushId: any
    id: any
    args: any[]
}) {
    switch (data.type) {
        case "done":
            OnDone(data)
            break
        case "callback":
            OnCallback(data)
            break
        default:
            throw new Error("invalid message type: " + data.type)
    }
}

// Called when the receiver has finished a batch of commands passed by a flush.
function OnDone(data: { getResults: any; flushId: any }) {
    // Resolve any pending get requests with the values retrieved from the receiver.
    for (const [getId, valueData] of data.getResults) {
        const resolve = pendingGetResolves.get(getId)
        if (!resolve)
            throw new Error("invalid get id")

        pendingGetResolves.delete(getId)
        resolve(Via._UnwrapArg(valueData))
    }

    // Resolve the promise returned by the original Flush() call.
    const flushId = data.flushId
    const flushResolve = pendingFlushResolves.get(flushId)
    if (!flushResolve)
        throw new Error("invalid flush id")

    pendingFlushResolves.delete(flushId)
    flushResolve()
}

// Called when a callback is invoked on the receiver and this was forwarded to the controller.
function OnCallback(data: { id: any; args: any[] }) {
    const func = idToCallback.get(data.id)
    if (!func)
        throw new Error("invalid callback id")

    const args = data.args.map(Via._UnwrapArg)
    func(...args)
}

function GetCallbackId(func: any) {
    // Lazy-create IDs
    let id = callbackToId.get(func)

    if (typeof id === "undefined") {
        id = nextCallbackId++
        callbackToId.set(func, id)
        idToCallback.set(id, func)
    }

    return id
}


const isProxy = (proxy): proxy is typeof Proxy => {
    return proxy == null ? false : !!proxy[Symbol.for("__isProxy")]
}

function CanStructuredClone(o: any) {
    const type = typeof o
    return type === "undefined" || o === null || type === "boolean" || type === "number" || type === "string" ||
        (o instanceof Blob) || (o instanceof ArrayBuffer) || (o instanceof ImageData) || (Array.isArray(o) && o.every(oo => isProxy(oo)))
}

// Wrap an argument to a small array representing the value, object, property or callback for
// posting to the receiver.
Via._WrapArg = function (arg, i, a) {
    // The Proxy objects used for objects and properties identify as functions.
    // Use the special accessor symbols to see what they really are. If they're not a Proxy
    // that Via knows about, assume it is a callback function instead.
    if (typeof arg === "function") {
        // Identify Via object proxy by testing if its object symbol returns a number
        const objectId = arg[__ObjectSymbol]
        if (typeof objectId === "number") {
            return [1 /* object */, objectId]
        }

        // Identify Via property proxy by testing if its target symbol returns anything
        const propertyTarget = arg[__TargetSymbol]

        if (propertyTarget) {
            return [3 /* object property */, propertyTarget[__ObjectSymbol] /* ._objectId */, propertyTarget._path]
        }

        // Neither symbol applied; assume an ordinary callback function
        return [2 /* callback */, GetCallbackId(arg)]
    }
    // Pass basic types that can be transferred via postMessage as-is.
    else if (CanStructuredClone(arg) || arg instanceof Box) {
        return [0 /* primitive */, unboxing(arg)]
    }
    else
        throw new Error("invalid argument")
}

// Unwrap an argument for a callback sent by the receiver.
Via._UnwrapArg = function (arr: any[]) {
    switch (arr[0]) {
        case 0:		// primitive
            return arr[1]
        case 1:		// object
            return Via._MakeObject(arr[1])
        default:
            throw new Error("invalid arg type")
    }
}

// Add a command to the queue representing a get request.
function AddGet<T>(objectId: number, path: string | null) {
    const getId = nextGetId++

    Via._AddToQueue([2 /* get */, getId, objectId, path])

    return new Promise<T>(resolve => {
        pendingGetResolves.set(getId, resolve)
    })
}

// Return a promise that resolves with the real value of a property, e.g. get(via.document.title).
// This involves a message round-trip, but multiple gets can be requested in parallel, and they will
// all be processed in the same round-trip.
self.get = function <T>(proxy: any): Promise<T> {
    if (typeof proxy === "function") {
        // Identify Via object proxy by testing if its object symbol returns a number
        const objectId = proxy[__ObjectSymbol]
        if (typeof objectId === "number")
            return AddGet(objectId, null)		// null path will return object itself (e.g. in case it's a primitive)

        // Identify Via property proxy by testing if its target symbol returns anything
        const target = proxy[__TargetSymbol] as any
        if (target)
            return AddGet(target[__ObjectSymbol] /* ._objectId */, target._path)
    }

    // If the passed object isn't recognized as a Via object, just return it wrapped in a promise.
    return Promise.resolve(proxy)
}

const ViaPropertyHandler =
{
    get(target: { _nextCache: any; _path: any[]; /* _objectId */[__ObjectSymbol]: number }, property: symbol, receiver: any) {
        // Return another Via property proxy with an extra property in its path,
        // unless the special target symbol is passed, in which case return the actual target.
        if (property === __TargetSymbol)
            return target
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
        const ret = Via._MakeProperty(target[__ObjectSymbol] /* ._objectId */, path)
        nextCache.set(property, ret)		// add to next property cache
        return ret
    },

    set(target: { _path: any[]; /* _objectId */[__ObjectSymbol]: any }, property: any, value: any, receiver: any) {
        if (SkipSymbol[property])
            target[property] = value
        else {
            // Add a set command to the queue, including a copy of the property path.
            const path = target._path.slice(0)
            path.push(property)

            Via._AddToQueue([1 /* set */, target[__ObjectSymbol] /* ._objectId */, path, Via._WrapArg(value)])
        }

        return true
    },

    apply(target: { /* _objectId */[__ObjectSymbol]: number; _path: any }, thisArg: any, argumentsList: any[]) {
        // Allocate a new object ID for the return value, add a call command to the queue, and then return
        // a Via object proxy representing the returned object ID.
        const returnObjectId = Via._GetNextObjectId()

        Via._AddToQueue([0 /* call */, target[__ObjectSymbol] /* ._objectId */, target._path, argumentsList.map(Via._WrapArg), returnObjectId])

        return Via._MakeObject(returnObjectId)
    },

    construct(target: { /* _objectId */[__ObjectSymbol]: number; _path: any }, argumentsList: any[], newTarget: any): { /* _objectId: any */[__ObjectSymbol]: number } {
        // This is the same as the apply trap except a different command is used for construct instead of call.
        // The command handler is also the same as when calling a function, except it uses 'new'.
        const returnObjectId = Via._GetNextObjectId()

        Via._AddToQueue([3 /* construct */, target[__ObjectSymbol] /* ._objectId */, target._path, argumentsList.map(Via._WrapArg), returnObjectId])

        return Via._MakeObject(returnObjectId)
    }
}

Via._MakeProperty = function (objectId: number, path: any[]): any {
    // For the apply and construct traps to work, the target must be callable.
    // So use a function object as the target, and stash the object ID and
    // the property path on it.
    const func = function () { }
    func[__ObjectSymbol] = objectId //._objectId = objectId
    func._path = path
    func._nextCache = new Map()		// for recycling sub-property lookups
    return new Proxy(func, ViaPropertyHandler as any)
}