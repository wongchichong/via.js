/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/via/controller/index.ts":
/*!*************************************!*\
  !*** ./src/via/controller/index.ts ***!
  \*************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
// export * from './object'
// export * from './property'
// export * from './controller'
const Via = (!self.Via) ? self.Via = {} : self.Via;
const ViaObjectHandler = {
    get(target, property, receiver) {
        // Return a Via property proxy, unless the special object symbol is passed,
        // in which case return the backing object ID.
        if (property === Via.__ObjectSymbol)
            return target._objectId;
        return Via._MakeProperty(target._objectId, [property]);
    },
    set(target, property, value, receiver) {
        // Add a set command to the queue.
        Via._AddToQueue([1 /* set */, target._objectId, [property], Via._WrapArg(value)]);
        return true;
    }
};
Via._MakeObject = function (id) {
    // For the apply and construct traps to work, the target must be callable.
    // So use a function object as the target, and stash the object ID on it.
    const func = function () { };
    func._objectId = id;
    const ret = new Proxy(func, ViaObjectHandler);
    // When supported, register the returned object in the finalization registry with
    // its associated ID. This allows GC of the Proxy object to notify the receiver
    // side that its ID can be dropped, ensuring the real object can be collected
    // as well. If this is not supported it will leak memory!
    if (Via.finalizationRegistry)
        Via.finalizationRegistry.register(ret, id);
    return ret;
};
// Namespace for controller side (note the uppercase)
// if (!self.Via)
//     self.Via = {}
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
let finalizeTimerId = -1;
const finalizeIntervalMs = 10;
const finalizeIdQueue = [];
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
let nextObjectId = 1; // next object ID to allocate (controller side uses positive IDs)
const queue = []; // queue of messages waiting to post
let nextGetId = 0; // next get request ID to allocate
const pendingGetResolves = new Map(); // map of get request ID -> promise resolve function
let nextFlushId = 0; // next flush ID to allocate
const pendingFlushResolves = new Map(); // map of flush ID -> promise resolve function
let isPendingFlush = false; // has set a flush to run at the next microtask
// Callback functions are assigned an ID which is passed to a call's arguments.
// The receiver creates a shim which forwards the callback back to the controller, where
// it's looked up in the map by its ID again and then the controller-side callback invoked.
let nextCallbackId = 0;
const callbackToId = new Map();
const idToCallback = new Map();
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
    const flushId = nextFlushId++;
    Via.postMessage({
        "type": "cmds",
        "cmds": queue,
        "flushId": flushId
    });
    queue.length = 0;
    return new Promise(resolve => {
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
    for (const [getId, valueData] of data.getResults) {
        const resolve = pendingGetResolves.get(getId);
        if (!resolve)
            throw new Error("invalid get id");
        pendingGetResolves.delete(getId);
        resolve(Via._UnwrapArg(valueData));
    }
    // Resolve the promise returned by the original Flush() call.
    const flushId = data.flushId;
    const flushResolve = pendingFlushResolves.get(flushId);
    if (!flushResolve)
        throw new Error("invalid flush id");
    pendingFlushResolves.delete(flushId);
    flushResolve();
}
// Called when a callback is invoked on the receiver and this was forwarded to the controller.
function OnCallback(data) {
    const func = idToCallback.get(data.id);
    if (!func)
        throw new Error("invalid callback id");
    const args = data.args.map(Via._UnwrapArg);
    func(...args);
}
function GetCallbackId(func) {
    // Lazy-create IDs
    let id = callbackToId.get(func);
    if (typeof id === "undefined") {
        id = nextCallbackId++;
        callbackToId.set(func, id);
        idToCallback.set(id, func);
    }
    return id;
}
function CanStructuredClone(o) {
    const type = typeof o;
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
        const objectId = arg[Via.__ObjectSymbol];
        if (typeof objectId === "number") {
            return [1 /* object */, objectId];
        }
        // Identify Via property proxy by testing if its target symbol returns anything
        const propertyTarget = arg[Via.__TargetSymbol];
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
    const getId = nextGetId++;
    Via._AddToQueue([2 /* get */, getId, objectId, path]);
    return new Promise(resolve => {
        pendingGetResolves.set(getId, resolve);
    });
}
// Return a promise that resolves with the real value of a property, e.g. get(via.document.title).
// This involves a message round-trip, but multiple gets can be requested in parallel, and they will
// all be processed in the same round-trip.
self.get = function (proxy) {
    if (typeof proxy === "function") {
        // Identify Via object proxy by testing if its object symbol returns a number
        const objectId = proxy[Via.__ObjectSymbol];
        if (typeof objectId === "number")
            return AddGet(objectId, null); // null path will return object itself (e.g. in case it's a primitive)
        // Identify Via property proxy by testing if its target symbol returns anything
        const target = proxy[Via.__TargetSymbol];
        if (target)
            return AddGet(target._objectId, target._path);
    }
    // If the passed object isn't recognized as a Via object, just return it wrapped in a promise.
    return Promise.resolve(proxy);
};
const ViaPropertyHandler = {
    get(target, property, receiver) {
        // Return another Via property proxy with an extra property in its path,
        // unless the special target symbol is passed, in which case return the actual target.
        if (property === Via.__TargetSymbol)
            return target;
        // It's common to repeatedly look up the same properties, e.g. calling
        // via.document.body.appendChild() in a loop. To speed this up and relieve pressure on the GC,
        // cache the proxy for the next property in the chain, so we return the same proxy every time.
        // Proxys are immutable (apart from this cache) so this doesn't change any behavior, and avoids
        // having to repeatedly re-create the Proxy and property array. Profiling shows this does help.
        const nextCache = target._nextCache;
        const existing = nextCache.get(property);
        if (existing)
            return existing;
        const path = target._path.slice(0);
        path.push(property);
        const ret = Via._MakeProperty(target._objectId, path);
        nextCache.set(property, ret); // add to next property cache
        return ret;
    },
    set(target, property, value, receiver) {
        // Add a set command to the queue, including a copy of the property path.
        const path = target._path.slice(0);
        path.push(property);
        Via._AddToQueue([1 /* set */, target._objectId, path, Via._WrapArg(value)]);
        return true;
    },
    apply(target, thisArg, argumentsList) {
        // Allocate a new object ID for the return value, add a call command to the queue, and then return
        // a Via object proxy representing the returned object ID.
        const returnObjectId = Via._GetNextObjectId();
        Via._AddToQueue([0 /* call */, target._objectId, target._path, argumentsList.map(Via._WrapArg), returnObjectId]);
        return Via._MakeObject(returnObjectId);
    },
    construct(target, argumentsList, newTarget) {
        // This is the same as the apply trap except a different command is used for construct instead of call.
        // The command handler is also the same as when calling a function, except it uses 'new'.
        const returnObjectId = Via._GetNextObjectId();
        Via._AddToQueue([3 /* construct */, target._objectId, target._path, argumentsList.map(Via._WrapArg), returnObjectId]);
        return Via._MakeObject(returnObjectId);
    }
};
Via._MakeProperty = function (objectId, path) {
    // For the apply and construct traps to work, the target must be callable.
    // So use a function object as the target, and stash the object ID and
    // the property path on it.
    const func = function () { };
    func._objectId = objectId;
    func._path = path;
    func._nextCache = new Map(); // for recycling sub-property lookups
    return new Proxy(func, ViaPropertyHandler);
};



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
/*!********************************************!*\
  !*** ./src/demos/dom-in-worker/worker.tsx ***!
  \********************************************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _via_controller_index__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../via/controller/index */ "./src/via/controller/index.ts");
/** @jsxImportSource solid-js */
/** @jsx h */
// import * as React from 'solid-js'
/** jsx h */
// import '../../via/dist/controller'
// import '../../via/controller/object'
// import '../../via/controller/property'
// import '../../via/controller/controller'

const Via = self.Via;
const via = self.via;
const get = self.get;
self.addEventListener("message", e => {
    if (e.data === "start") {
        // importScripts("../../via/controller/object.js",
        // 			  "../../via/controller/property.js",
        // 			  "../../via/controller/controller.js");
        // importScripts("../../via/dist/controller.js")
        Via.postMessage = (data => self.postMessage(data));
        Start();
    }
    else {
        Via.OnMessage(e.data);
    }
});
async function Start() {
    const document = via.document;
    // Demo of retrieving DOM property values
    const [docTitle, docUrl, nodeType] = await Promise.all([
        get(document.title),
        get(document.URL),
        get(document.body.nodeType)
    ]);
    console.log("Document title is: " + docTitle + ", URL is: " + docUrl);
    const h1 = document.createElement("h1");
    h1.textContent = "Via.js - using DOM in worker";
    document.body.appendChild(h1);
    const p = document.createElement("p");
    p.textContent = "This page's contents and logic, including this text, was created by a Web Worker using APIs almost identical to the usual DOM APIs. In this case the controller is the worker, and the receiver is the DOM. To demonstrate the flexibility of the approach, the button below uses the Web Audio API to load and play a sound effect when clicked. The entire process, from creating the button, attaching an event handler, running the callback, creating an AudioContext, decoding the audio, creating audio buffers and nodes, and starting playback of the sound, is controlled entirely by the worker.";
    document.body.appendChild(p);
    const button = document.createElement("button");
    button.textContent = "Click me";
    button.style.fontWeight = "bold";
    button.addEventListener("click", OnClick);
    document.body.appendChild(button);
    // document.body.nodeType = nodeType
    // const domNode = document.body
    // const root = createRoot(domNode)
    // const e = <div>
    //     <h1>
    //         Via.js - using DOM in worker
    //     </h1>
    //     <p>
    //         This page's contents and logic, including this text, was created by a Web Worker using APIs almost identical to the usual DOM APIs. In this case the controller is the worker, and the receiver is the DOM. To demonstrate the flexibility of the approach, the button below uses the Web Audio API to load and play a sound effect when clicked. The entire process, from creating the button, attaching an event handler, running the callback, creating an AudioContext, decoding the audio, creating audio buffers and nodes, and starting playback of the sound, is controlled entirely by the worker.
    //     </p>
    //     <button style={{ "font-weight": 'bold' }} onClick={OnClick}>
    //         Click me
    //     </button>
    // </div>
    // render(() => e, domNode)
    via.audioContext = new via.AudioContext();
    const response = await fetch("sfx5.m4a");
    const arrayBuffer = await response.arrayBuffer();
    via.audioContext.decodeAudioData(arrayBuffer, audioBuffer => {
        self.audioBuffer = audioBuffer;
    });
}
async function OnClick(e) {
    const [x, y] = await Promise.all([
        get(e.clientX),
        get(e.clientY)
    ]);
    console.log("[Worker] Click event at " + x + ", " + y);
    const source = via.audioContext.createBufferSource();
    source.buffer = self.audioBuffer;
    source.connect(via.audioContext.destination);
    source.start(0);
}

})();

/******/ })()
;