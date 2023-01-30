import '../../via/controller/index'

import { PrimeCalculator } from './PrimeCalculator'

let worker = null
let primeCalculator: PrimeCalculator

const via = window.via
const Via = window.Via
const get = window.get

document.addEventListener("DOMContentLoaded", function () {
    // Create worker
    const worker = new Worker("worker.js")

    // Hook up Via's messages with the worker's postMessage bridge
    Via.postMessage = (data => worker.postMessage(data))
    worker.onmessage = (e => Via.OnMessage(e.data))

    // Start the worker
    worker.postMessage("start")

    // Set up prime testing. Note primeCalculator is created with via,
    // so is a placeholder object representing the object on the worker.
    //@ts-ignore
    primeCalculator = new via.PrimeCalculator();
    (document.getElementById("check") as any).onclick = CheckPrime
})

async function CheckPrime() {
    const resultElem = document.getElementById("result") as HTMLParagraphElement

    const n = parseFloat((document.getElementById("number") as any).value)
    if (!isFinite(n)) {
        resultElem.textContent = "Invalid number"
        return
    }

    resultElem.textContent = "Checking..."
    const startTime = performance.now()

    // primeCalculator is on the worker, but IsPrime() can be called normally.
    const ret = primeCalculator.IsPrime(n)

    // Via.js returns placeholder objects from all calls, so they can be used in subsequent
    // calls without having to wait for the result. However in this case we want to retrieve
    // the actual value from the placeholder, which we can do with get().
    const isPrime = await get(ret)

    const duration = performance.now() - startTime
    resultElem.textContent = `Is prime: ${isPrime} (took ${duration} ms)`
}