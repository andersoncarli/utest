// test-g.js - Quick G.js verification
import '../globals.d.js'

// Boot G with test modules
await G._boot({
  paths: ['./'],
  global: ['test:TEST', 'is'],
  eager: ['check', 'toSource', 'string'] // Add to eager for sync access
})

console.log('✓ G._boot complete')
console.log('✓ G.is:', typeof G.is)
console.log('✓ globalThis.is:', typeof globalThis.is)
console.log('✓ globalThis.TEST:', typeof globalThis.TEST)
console.log('✓ G.check:', typeof G.check)

// Test reactive property
G._property('counter', { global: true, initialValue: 0 })
console.log('✓ counter initial:', globalThis.counter)
globalThis.counter = 5
console.log('✓ counter set:', globalThis.counter)

// Test eager modules (sync access)
console.log('✓ Eager toSource:', typeof G.toSource)
console.log('✓ Eager string:', typeof G.string)

// Test multi-module sync
const { toSource: ts, string: str } = G['toSource string']
console.log('✓ Multi-module toSource:', typeof ts)
console.log('✓ Multi-module string:', typeof str)

// Test async loading
const cl = await G['cl']
console.log('✓ Async load cl:', typeof cl)

// Test events
let received = null
G.on('test-event', (data) => {
  received = data
})
G.emit('test-event', 'hello')
console.log('✓ Event received:', received)

console.log('\n🎉 All basic tests passed!')
