import assert from 'node:assert/strict'
import { test } from 'node:test'

test('actual demo module clears previous export after each rejected CSV', async () => {
  const nodes = new Map()
  function node() {
    return { disabled: true, dataset: {}, children: [], events: {}, textContent: '',
      get firstChild() { return this.children[0] },
      append(...items) { this.children.push(...items) },
      removeChild(item) { this.children.splice(this.children.indexOf(item), 1) },
      addEventListener(name, fn) { this.events[name] = fn } }
  }
  globalThis.document = {
    querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector) },
    createElement: node,
  }
  const readers = []
  globalThis.FileReader = class {
    constructor() { readers.push(this) }
    events = {}
    addEventListener(name, fn) { this.events[name] = fn }
    readAsText(file) { this.file = file }
    complete() { this.result = this.file.text; this.events.load() }
  }
  try {
    await import('../demo/app.js')
    for (const row of ['Broken,1,lost', '"Broken,1', 'Bro"ken,1', '"Broken"x,1']) {
      nodes.get('#sampleButton').events.click()
      assert.equal(nodes.get('#downloadVcfButton').disabled, false)
      nodes.get('#fileInput').files = [{ name: 'invalid.csv', text: 'Name,Phone\nValid,1\n' + row }]
      nodes.get('#fileInput').events.change()
      readers.at(-1).complete()
      assert.equal(nodes.get('#status').dataset.kind, 'error')
      assert.equal(nodes.get('#downloadVcfButton').disabled, true)
      assert.equal(nodes.get('#downloadCsvButton').disabled, true)
      // A stale result would reach document.createElement('a').click(), absent here.
      assert.doesNotThrow(() => nodes.get('#downloadVcfButton').events.click())
      assert.doesNotThrow(() => nodes.get('#downloadCsvButton').events.click())
    }
    const select = (name) => {
      nodes.get('#fileInput').files = [{ name: name + '.csv', text: 'Name,Phone\n' + name + ',1' }]
      nodes.get('#fileInput').events.change()
      return readers.at(-1)
    }
    const assertNoExport = () => {
      assert.equal(nodes.get('#downloadVcfButton').disabled, true)
      assert.equal(nodes.get('#downloadCsvButton').disabled, true)
      assert.doesNotThrow(() => nodes.get('#downloadVcfButton').events.click())
    }
    nodes.get('#sampleButton').events.click()
    const pending = select('Pending')
    assertNoExport()
    pending.events.error()
    assertNoExport()
    assert.equal(nodes.get('#status').dataset.kind, 'error')

    const old = select('Old')
    const newest = select('Newest')
    newest.complete()
    const newestStatus = nodes.get('#status').textContent
    old.complete()
    assert.equal(nodes.get('#status').textContent, newestStatus)
    old.events.error()
    assert.equal(nodes.get('#status').textContent, newestStatus)

    const stale = select('Stale')
    nodes.get('#sampleButton').events.click()
    const sampleStatus = nodes.get('#status').textContent
    stale.complete()
    stale.events.error()
    assert.equal(nodes.get('#status').textContent, sampleStatus)
    assert.equal(nodes.get('#downloadVcfButton').disabled, false)

    const dropped = select('Superseded')
    nodes.get('#dropZone').events.drop({
      preventDefault() {},
      dataTransfer: { files: [{name: 'Drop.csv', text: 'Name,Phone\nDrop,2'}] },
    })
    assertNoExport()
    readers.at(-1).complete()
    const dropStatus = nodes.get('#status').textContent
    dropped.complete()
    assert.equal(nodes.get('#status').textContent, dropStatus)
  } finally {
    delete globalThis.document
    delete globalThis.FileReader
  }
})

