/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/via/controller/controller.ts":
/*!******************************************!*\
  !*** ./src/via/controller/controller.ts ***!
  \******************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
// Namespace for controller side (note the uppercase)
if (!self.Via)
    self.Via = {};
// Symbols used to look up the hidden values behind the Proxy objects.
Via.__TargetSymbol = Symbol();
Via.__ObjectSymbol = Symbol();
// A FinalizationRegistry (if supported) that can identify when objects are garbage collected to notify the
// receiver to also drop references. If this is not supported, it will unavoidably leak memory.
Via.finalizationRegistry = (typeof FinalizationRegistry === "undefined" ? null : new FinalizationRegistry(FinalizeID));
if (!Via.finalizationRegistry)
    console.warn("[Via.js] No WeakRefs support - will leak memory");
// FinalizeID is called once per ID. To improve the efficiency when posting cleanup messages to the other
// side, batch together all finalized IDs that happen in an interval using a timer, and post one message
// at the end of that timer.
var finalizeTimerId = -1;
var finalizeIntervalMs = 10;
var finalizeIdQueue = [];
function FinalizeID(id) {
    finalizeIdQueue.push(id);
    if (finalizeTimerId === -1)
        finalizeTimerId = setTimeout(CleanupIDs, finalizeIntervalMs);
}
function CleanupIDs() {
    finalizeTimerId = -1;
    Via.postMessage({
        "type": "cleanup",
        "ids": finalizeIdQueue
    });
    finalizeIdQueue.length = 0;
}
var nextObjectId = 1; // next object ID to allocate (controller side uses positive IDs)
var queue = []; // queue of messages waiting to post
var nextGetId = 0; // next get request ID to allocate
var pendingGetResolves = new Map(); // map of get request ID -> promise resolve function
var nextFlushId = 0; // next flush ID to allocate
var pendingFlushResolves = new Map(); // map of flush ID -> promise resolve function
var isPendingFlush = false; // has set a flush to run at the next microtask
// Callback functions are assigned an ID which is passed to a call's arguments.
// The receiver creates a shim which forwards the callback back to the controller, where
// it's looked up in the map by its ID again and then the controller-side callback invoked.
var nextCallbackId = 0;
var callbackToId = new Map();
var idToCallback = new Map();
// Create a default 'via' object (note the lowercase) representing the
// global object on the receiver side
self.via = Via._MakeObject(0);
Via._GetNextObjectId = function () {
    return nextObjectId++;
};
Via._AddToQueue = function (d) {
    queue.push(d);
    // Automatically flush queue at next microtask
    if (!isPendingFlush) {
        isPendingFlush = true;
        Promise.resolve().then(Via.Flush);
    }
};
// Post the queue to the receiver. Returns a promise which resolves when the receiver
// has finished executing all the commands.
Via.Flush = function () {
    isPendingFlush = false;
    if (!queue.length)
        return Promise.resolve();
    var flushId = nextFlushId++;
    Via.postMessage({
        "type": "cmds",
        "cmds": queue,
        "flushId": flushId
    });
    queue.length = 0;
    return new Promise(function (resolve) {
        pendingFlushResolves.set(flushId, resolve);
    });
};
// Called when a message received from the receiver
Via.OnMessage = function (data) {
    switch (data.type) {
        case "done":
            OnDone(data);
            break;
        case "callback":
            OnCallback(data);
            break;
        default:
            throw new Error("invalid message type: " + data.type);
    }
};
// Called when the receiver has finished a batch of commands passed by a flush.
function OnDone(data) {
    // Resolve any pending get requests with the values retrieved from the receiver.
    for (var _i = 0, _a = data.getResults; _i < _a.length; _i++) {
        var _b = _a[_i], getId = _b[0], valueData = _b[1];
        var resolve = pendingGetResolves.get(getId);
        if (!resolve)
            throw new Error("invalid get id");
        pendingGetResolves.delete(getId);
        resolve(Via._UnwrapArg(valueData));
    }
    // Resolve the promise returned by the original Flush() call.
    var flushId = data.flushId;
    var flushResolve = pendingFlushResolves.get(flushId);
    if (!flushResolve)
        throw new Error("invalid flush id");
    pendingFlushResolves.delete(flushId);
    flushResolve();
}
// Called when a callback is invoked on the receiver and this was forwarded to the controller.
function OnCallback(data) {
    var func = idToCallback.get(data.id);
    if (!func)
        throw new Error("invalid callback id");
    var args = data.args.map(Via._UnwrapArg);
    func.apply(void 0, args);
}
function GetCallbackId(func) {
    // Lazy-create IDs
    var id = callbackToId.get(func);
    if (typeof id === "undefined") {
        id = nextCallbackId++;
        callbackToId.set(func, id);
        idToCallback.set(id, func);
    }
    return id;
}
function CanStructuredClone(o) {
    var type = typeof o;
    return type === "undefined" || o === null || type === "boolean" || type === "number" || type === "string" ||
        (o instanceof Blob) || (o instanceof ArrayBuffer) || (o instanceof ImageData);
}
// Wrap an argument to a small array representing the value, object, property or callback for
// posting to the receiver.
Via._WrapArg = function (arg) {
    // The Proxy objects used for objects and properties identify as functions.
    // Use the special accessor symbols to see what they really are. If they're not a Proxy
    // that Via knows about, assume it is a callback function instead.
    if (typeof arg === "function") {
        // Identify Via object proxy by testing if its object symbol returns a number
        var objectId = arg[Via.__ObjectSymbol];
        if (typeof objectId === "number") {
            return [1 /* object */, objectId];
        }
        // Identify Via property proxy by testing if its target symbol returns anything
        var propertyTarget = arg[Via.__TargetSymbol];
        if (propertyTarget) {
            return [3 /* object property */, propertyTarget._objectId, propertyTarget._path];
        }
        // Neither symbol applied; assume an ordinary callback function
        return [2 /* callback */, GetCallbackId(arg)];
    }
    // Pass basic types that can be transferred via postMessage as-is.
    else if (CanStructuredClone(arg)) {
        return [0 /* primitive */, arg];
    }
    else
        throw new Error("invalid argument");
};
// Unwrap an argument for a callback sent by the receiver.
Via._UnwrapArg = function (arr) {
    switch (arr[0]) {
        case 0: // primitive
            return arr[1];
        case 1: // object
            return Via._MakeObject(arr[1]);
        default:
            throw new Error("invalid arg type");
    }
};
// Add a command to the queue representing a get request.
function AddGet(objectId, path) {
    var getId = nextGetId++;
    Via._AddToQueue([2 /* get */, getId, objectId, path]);
    return new Promise(function (resolve) {
        pendingGetResolves.set(getId, resolve);
    });
}
// Return a promise that resolves with the real value of a property, e.g. get(via.document.title).
// This involves a message round-trip, but multiple gets can be requested in parallel, and they will
// all be processed in the same round-trip.
self.get = function (proxy) {
    if (typeof proxy === "function") {
        // Identify Via object proxy by testing if its object symbol returns a number
        var objectId = proxy[Via.__ObjectSymbol];
        if (typeof objectId === "number")
            return AddGet(objectId, null); // null path will return object itself (e.g. in case it's a primitive)
        // Identify Via property proxy by testing if its target symbol returns anything
        var target = proxy[Via.__TargetSymbol];
        if (target)
            return AddGet(target._objectId, target._path);
    }
    // If the passed object isn't recognized as a Via object, just return it wrapped in a promise.
    return Promise.resolve(proxy);
};



/***/ }),

/***/ "./src/via/controller/index.ts":
/*!*************************************!*\
  !*** ./src/via/controller/index.ts ***!
  \*************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _object__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./object */ "./src/via/controller/object.ts");
/* harmony import */ var _property__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./property */ "./src/via/controller/property.ts");
/* harmony import */ var _controller__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./controller */ "./src/via/controller/controller.ts");





/***/ }),

/***/ "./src/via/controller/object.ts":
/*!**************************************!*\
  !*** ./src/via/controller/object.ts ***!
  \**************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
if (!self.Via)
    self.Via = {};
var ViaObjectHandler = {
    get: function (target, property, receiver) {
        // Return a Via property proxy, unless the special object symbol is passed,
        // in which case return the backing object ID.
        if (property === Via.__ObjectSymbol)
            return target._objectId;
        return Via._MakeProperty(target._objectId, [property]);
    },
    set: function (target, property, value, receiver) {
        // Add a set command to the queue.
        Via._AddToQueue([1 /* set */, target._objectId, [property], Via._WrapArg(value)]);
        return true;
    }
};
Via._MakeObject = function (id) {
    // For the apply and construct traps to work, the target must be callable.
    // So use a function object as the target, and stash the object ID on it.
    var func = function () { };
    func._objectId = id;
    var ret = new Proxy(func, ViaObjectHandler);
    // When supported, register the returned object in the finalization registry with
    // its associated ID. This allows GC of the Proxy object to notify the receiver
    // side that its ID can be dropped, ensuring the real object can be collected
    // as well. If this is not supported it will leak memory!
    if (Via.finalizationRegistry)
        Via.finalizationRegistry.register(ret, id);
    return ret;
};



/***/ }),

/***/ "./src/via/controller/property.ts":
/*!****************************************!*\
  !*** ./src/via/controller/property.ts ***!
  \****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
// Namespace for controller side (note the uppercase)
if (!self.Via)
    self.Via = {};
// Symbols used to look up the hidden values behind the Proxy objects.
Via.__TargetSymbol = Symbol();
Via.__ObjectSymbol = Symbol();
// A FinalizationRegistry (if supported) that can identify when objects are garbage collected to notify the
// receiver to also drop references. If this is not supported, it will unavoidably leak memory.
Via.finalizationRegistry = (typeof FinalizationRegistry === "undefined" ? null : new FinalizationRegistry(FinalizeID));
if (!Via.finalizationRegistry)
    console.warn("[Via.js] No WeakRefs support - will leak memory");
// FinalizeID is called once per ID. To improve the efficiency when posting cleanup messages to the other
// side, batch together all finalized IDs that happen in an interval using a timer, and post one message
// at the end of that timer.
var finalizeTimerId = -1;
var finalizeIntervalMs = 10;
var finalizeIdQueue = [];
function FinalizeID(id) {
    finalizeIdQueue.push(id);
    if (finalizeTimerId === -1)
        finalizeTimerId = setTimeout(CleanupIDs, finalizeIntervalMs);
}
function CleanupIDs() {
    finalizeTimerId = -1;
    Via.postMessage({
        "type": "cleanup",
        "ids": finalizeIdQueue
    });
    finalizeIdQueue.length = 0;
}
var nextObjectId = 1; // next object ID to allocate (controller side uses positive IDs)
var queue = []; // queue of messages waiting to post
var nextGetId = 0; // next get request ID to allocate
var pendingGetResolves = new Map(); // map of get request ID -> promise resolve function
var nextFlushId = 0; // next flush ID to allocate
var pendingFlushResolves = new Map(); // map of flush ID -> promise resolve function
var isPendingFlush = false; // has set a flush to run at the next microtask
// Callback functions are assigned an ID which is passed to a call's arguments.
// The receiver creates a shim which forwards the callback back to the controller, where
// it's looked up in the map by its ID again and then the controller-side callback invoked.
var nextCallbackId = 0;
var callbackToId = new Map();
var idToCallback = new Map();
// Create a default 'via' object (note the lowercase) representing the
// global object on the receiver side
self.via = Via._MakeObject(0);
Via._GetNextObjectId = function () {
    return nextObjectId++;
};
Via._AddToQueue = function (d) {
    queue.push(d);
    // Automatically flush queue at next microtask
    if (!isPendingFlush) {
        isPendingFlush = true;
        Promise.resolve().then(Via.Flush);
    }
};
// Post the queue to the receiver. Returns a promise which resolves when the receiver
// has finished executing all the commands.
Via.Flush = function () {
    isPendingFlush = false;
    if (!queue.length)
        return Promise.resolve();
    var flushId = nextFlushId++;
    Via.postMessage({
        "type": "cmds",
        "cmds": queue,
        "flushId": flushId
    });
    queue.length = 0;
    return new Promise(function (resolve) {
        pendingFlushResolves.set(flushId, resolve);
    });
};
// Called when a message received from the receiver
Via.OnMessage = function (data) {
    switch (data.type) {
        case "done":
            OnDone(data);
            break;
        case "callback":
            OnCallback(data);
            break;
        default:
            throw new Error("invalid message type: " + data.type);
    }
};
// Called when the receiver has finished a batch of commands passed by a flush.
function OnDone(data) {
    // Resolve any pending get requests with the values retrieved from the receiver.
    for (var _i = 0, _a = data.getResults; _i < _a.length; _i++) {
        var _b = _a[_i], getId = _b[0], valueData = _b[1];
        var resolve = pendingGetResolves.get(getId);
        if (!resolve)
            throw new Error("invalid get id");
        pendingGetResolves.delete(getId);
        resolve(Via._UnwrapArg(valueData));
    }
    // Resolve the promise returned by the original Flush() call.
    var flushId = data.flushId;
    var flushResolve = pendingFlushResolves.get(flushId);
    if (!flushResolve)
        throw new Error("invalid flush id");
    pendingFlushResolves.delete(flushId);
    flushResolve();
}
// Called when a callback is invoked on the receiver and this was forwarded to the controller.
function OnCallback(data) {
    var func = idToCallback.get(data.id);
    if (!func)
        throw new Error("invalid callback id");
    var args = data.args.map(Via._UnwrapArg);
    func.apply(void 0, args);
}
function GetCallbackId(func) {
    // Lazy-create IDs
    var id = callbackToId.get(func);
    if (typeof id === "undefined") {
        id = nextCallbackId++;
        callbackToId.set(func, id);
        idToCallback.set(id, func);
    }
    return id;
}
function CanStructuredClone(o) {
    var type = typeof o;
    return type === "undefined" || o === null || type === "boolean" || type === "number" || type === "string" ||
        (o instanceof Blob) || (o instanceof ArrayBuffer) || (o instanceof ImageData);
}
// Wrap an argument to a small array representing the value, object, property or callback for
// posting to the receiver.
Via._WrapArg = function (arg) {
    // The Proxy objects used for objects and properties identify as functions.
    // Use the special accessor symbols to see what they really are. If they're not a Proxy
    // that Via knows about, assume it is a callback function instead.
    if (typeof arg === "function") {
        // Identify Via object proxy by testing if its object symbol returns a number
        var objectId = arg[Via.__ObjectSymbol];
        if (typeof objectId === "number") {
            return [1 /* object */, objectId];
        }
        // Identify Via property proxy by testing if its target symbol returns anything
        var propertyTarget = arg[Via.__TargetSymbol];
        if (propertyTarget) {
            return [3 /* object property */, propertyTarget._objectId, propertyTarget._path];
        }
        // Neither symbol applied; assume an ordinary callback function
        return [2 /* callback */, GetCallbackId(arg)];
    }
    // Pass basic types that can be transferred via postMessage as-is.
    else if (CanStructuredClone(arg)) {
        return [0 /* primitive */, arg];
    }
    else
        throw new Error("invalid argument");
};
// Unwrap an argument for a callback sent by the receiver.
Via._UnwrapArg = function (arr) {
    switch (arr[0]) {
        case 0: // primitive
            return arr[1];
        case 1: // object
            return Via._MakeObject(arr[1]);
        default:
            throw new Error("invalid arg type");
    }
};
// Add a command to the queue representing a get request.
function AddGet(objectId, path) {
    var getId = nextGetId++;
    Via._AddToQueue([2 /* get */, getId, objectId, path]);
    return new Promise(function (resolve) {
        pendingGetResolves.set(getId, resolve);
    });
}
// Return a promise that resolves with the real value of a property, e.g. get(via.document.title).
// This involves a message round-trip, but multiple gets can be requested in parallel, and they will
// all be processed in the same round-trip.
self.get = function (proxy) {
    if (typeof proxy === "function") {
        // Identify Via object proxy by testing if its object symbol returns a number
        var objectId = proxy[Via.__ObjectSymbol];
        if (typeof objectId === "number")
            return AddGet(objectId, null); // null path will return object itself (e.g. in case it's a primitive)
        // Identify Via property proxy by testing if its target symbol returns anything
        var target = proxy[Via.__TargetSymbol];
        if (target)
            return AddGet(target._objectId, target._path);
    }
    // If the passed object isn't recognized as a Via object, just return it wrapped in a promise.
    return Promise.resolve(proxy);
};



/***/ }),

/***/ "./src/via/receiver/index.ts":
/*!***********************************!*\
  !*** ./src/via/receiver/index.ts ***!
  \***********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _receiver__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./receiver */ "./src/via/receiver/receiver.ts");



/***/ }),

/***/ "./src/via/receiver/receiver.ts":
/*!**************************************!*\
  !*** ./src/via/receiver/receiver.ts ***!
  \**************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _controller__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../controller */ "./src/via/controller/index.ts");
var __spreadArray = (undefined && undefined.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};

// import '../controller/object'
// import '../controller/property'
// import '../controller/controller'
// Namespace for receiver side (which receives calls from the controller side)
self.ViaReceiver = {};
// The master map of object ID to the real object. Object ID 0 is always the global object on
// the receiver (i.e. window or self). IDs are removed by cleanup messages, which are sent
// by the controller when the Proxy with that ID is garbage collected (which requires WeakCell
// support), indicating it cannot be used any more. This is important to avoid a memory leak,
// since if the IDs are left behind they will prevent the associated object being collected.
var idMap = new Map([[0, self]]);
// Some objects are allocated an ID here on the receiver side, when running callbacks with
// object parameters. To avoid ID collisions with the controller, receiver object IDs are
// negative and decrement, and controller object IDs are positive and increment.
var nextObjectId = -1;
// Get the real object from an ID.
function IdToObject(id) {
    var ret = idMap.get(id);
    if (typeof ret === "undefined")
        throw new Error("missing object id: " + id);
    return ret;
}
// Allocate new ID for an object on the receiver side.
// The receiver uses negative IDs to prevent ID collisions with the controller.
function ObjectToId(object) {
    var id = nextObjectId--;
    idMap.set(id, object);
    return id;
}
// Get the real value from an ID and a property path, e.g. object ID 0, path ["document", "title"]
// will return window.document.title.
function IdToObjectProperty(id, path) {
    var ret = idMap.get(id);
    if (typeof ret === "undefined")
        throw new Error("missing object id: " + id);
    var base = ret;
    for (var i = 0, len = path.length; i < len; ++i)
        base = base[path[i]];
    return base;
}
function CanStructuredClone(o) {
    var type = typeof o;
    return type === "undefined" || o === null || type === "boolean" || type === "number" || type === "string" ||
        (o instanceof Blob) || (o instanceof ArrayBuffer) || (o instanceof ImageData);
}
// Wrap an argument. This is used for sending values back to the controller. Anything that can be directly
// posted is sent as-is, but any kind of object is represented by its object ID instead.
function WrapArg(arg) {
    if (CanStructuredClone(arg)) {
        return [0 /* primitive */, arg];
    }
    else {
        return [1 /* object */, ObjectToId(arg)];
    }
}
// Get a shim function for a given callback ID. This creates a new function that forwards the
// call with its arguments to the controller, where it will run the real callback.
// Callback functions are not re-used to allow them to be garbage collected normally.
function GetCallbackShim(id) {
    return (function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        return ViaReceiver.postMessage({
            "type": "callback",
            "id": id,
            "args": args.map(WrapArg)
        });
    });
}
// Unwrap an argument sent from the controller. Arguments are transported as small arrays indicating
// the type and any object IDs/property paths, so they can be looked up on the receiver side.
function UnwrapArg(arr) {
    switch (arr[0]) {
        case 0: // primitive
            return arr[1];
        case 1: // object
            return IdToObject(arr[1]);
        case 2: // callback
            return GetCallbackShim(arr[1]);
        case 3: // object property
            return IdToObjectProperty(arr[1], arr[2]);
        default:
            throw new Error("invalid arg type");
    }
}
// Called when receiving a message from the controller.
ViaReceiver.OnMessage = function (data) {
    switch (data.type) {
        case "cmds":
            OnCommandsMessage(data);
            break;
        case "cleanup":
            OnCleanupMessage(data);
            break;
        default:
            console.error("Unknown message type: " + data.type);
            break;
    }
};
function OnCommandsMessage(data) {
    var getResults = []; // list of values requested to pass back to controller
    // Run all sent commands
    for (var _i = 0, _a = data.cmds; _i < _a.length; _i++) {
        var cmd = _a[_i];
        RunCommand(cmd, getResults);
    }
    // Post back that we're done (so the flush promise resolves), and pass along any get values.
    ViaReceiver.postMessage({
        "type": "done",
        "flushId": data.flushId,
        "getResults": getResults
    });
}
function RunCommand(arr, getResults) {
    var type = arr[0];
    switch (type) {
        case 0: // call
            ViaCall(arr[1], arr[2], arr[3], arr[4]);
            break;
        case 1: // set
            ViaSet(arr[1], arr[2], arr[3]);
            break;
        case 2: // get
            ViaGet(arr[1], arr[2], arr[3], getResults);
            break;
        case 3: // constructor
            ViaConstruct(arr[1], arr[2], arr[3], arr[4]);
            break;
        default:
            throw new Error("invalid cmd type: " + type);
    }
}
function ViaCall(objectId, path, argsData, returnObjectId) {
    var obj = IdToObject(objectId);
    var args = argsData.map(UnwrapArg);
    var methodName = path[path.length - 1];
    var base = obj;
    for (var i = 0, len = path.length - 1; i < len; ++i) {
        base = base[path[i]];
    }
    var ret = base[methodName].apply(base, args);
    idMap.set(returnObjectId, ret);
}
function ViaConstruct(objectId, path, argsData, returnObjectId) {
    var _a;
    var obj = IdToObject(objectId);
    var args = argsData.map(UnwrapArg);
    var methodName = path[path.length - 1];
    var base = obj;
    for (var i = 0, len = path.length - 1; i < len; ++i) {
        base = base[path[i]];
    }
    var ret = new ((_a = base[methodName]).bind.apply(_a, __spreadArray([void 0], args, false)))();
    idMap.set(returnObjectId, ret);
}
function ViaSet(objectId, path, valueData) {
    var obj = IdToObject(objectId);
    var value = UnwrapArg(valueData);
    var propertyName = path[path.length - 1];
    var base = obj;
    for (var i = 0, len = path.length - 1; i < len; ++i) {
        base = base[path[i]];
    }
    base[propertyName] = value;
}
function ViaGet(getId, objectId, path, getResults) {
    var obj = IdToObject(objectId);
    if (path === null) {
        getResults.push([getId, WrapArg(obj)]);
        return;
    }
    var propertyName = path[path.length - 1];
    var base = obj;
    for (var i = 0, len = path.length - 1; i < len; ++i) {
        base = base[path[i]];
    }
    var value = base[propertyName];
    getResults.push([getId, WrapArg(value)]);
}
function OnCleanupMessage(data) {
    // Delete a list of IDs sent from the controller from the ID map. This happens when
    // the Proxys on the controller side with these IDs are garbage collected, so the IDs
    // on the receiver can be dropped ensuring the associated objects can be collected.
    for (var _i = 0, _a = data.ids; _i < _a.length; _i++) {
        var id = _a[_i];
        idMap.delete(id);
    }
}


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
/*!******************************************!*\
  !*** ./src/demos/dom-in-worker/index.ts ***!
  \******************************************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _via_receiver__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../via/receiver */ "./src/via/receiver/index.ts");
//@ts-nocheck


var worker = null;
document.addEventListener("DOMContentLoaded", function () {
    // Create worker
    worker = new Worker("worker.js");
    // Hook up Via's messages with the worker's postMessage bridge
    worker.onmessage = (function (e) { return ViaReceiver.OnMessage(e.data); });
    ViaReceiver.postMessage = (function (data) { return worker.postMessage(data); });
    // Start the worker
    worker.postMessage("start");
});

})();

/******/ })()
;