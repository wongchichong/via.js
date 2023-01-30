//@ts-nocheck
export { }
"use strict"

import '../../via/receiver'
import { PrimeCalculator } from './PrimeCalculator'

self.addEventListener("message", e => {
    if (e.data === "start") {
        // importScripts("../../via/receiver/receiver.js");

        ViaReceiver.postMessage = (data => self.postMessage(data))
    }
    else {
        ViaReceiver.OnMessage(e.data)
    }
})

self.PrimeCalculator = PrimeCalculator