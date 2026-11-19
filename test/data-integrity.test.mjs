import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportContactsToVcf, parseContactsText } from '../src/contacts-converter.js'

test('a vCard marker in a CSV note does not change the file format', () => {
  const result = parseContactsText({
    fileName: 'training-roster.csv',
    text: 'Name,Email,Notes\r\nOksana,oksana@example.test,"Pasted legacy card:\r\nBEGIN:VCARD\r\nEND:VCARD"\r\nMaksym,maksym@example.test,"Keep this contact."',
  })
  assert.equal(result.sourceType, 'csv')
  assert.deepEqual(result.contacts.map((contact) => contact.fullName), ['Oksana', 'Maksym'])
  assert.match(result.contacts[0].notes, /BEGIN:VCARD\r?\nEND:VCARD$/)

  const reopened = parseContactsText({ fileName: 'export.txt', text: '\n' + exportContactsToVcf(result.contacts) })
  assert.equal(reopened.sourceType, 'vcf')
  assert.deepEqual(reopened.contacts.map((contact) => contact.fullName), ['Oksana', 'Maksym'])
})

test('prevents a partial export when one vCard block is truncated', () => {
  const roster = parseContactsText({
    fileName: 'roster.csv',
    text: 'Name,Phone\nOksana Petrenko,+380441234567\nMaksym Bondar,+380441234567',
  })
  const complete = exportContactsToVcf(roster.contacts)
  const truncated = complete.replace(/END:VCARD\r\n$/, '')
  assert.notEqual(truncated, complete)
  const reopen = (text) => parseContactsText({ fileName: 'roster.vcf', text })

  assert.throws(() => reopen(truncated), /vCard starting at line \d+ is missing END:VCARD/)
  assert.throws(() => reopen(truncated + complete), /is missing END:VCARD/)
  assert.deepEqual(reopen(complete).contacts.map((contact) => contact.fullName), [
    'Oksana Petrenko',
    'Maksym Bondar',
  ])
})

// Decode persisted UTF-8 bytes independently of the converter's vCard parser.
function decodeProperties(vcf) {
  const bytes = Buffer.from(vcf, 'utf8')
  const wire = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  assert.ok(!wire.includes('\uFFFD'), 'UTF-8 serialization must not replace split surrogates')
  assert.ok(!wire.replaceAll('\r\n', '').includes('\r'), 'no bare CR may escape into a property')
  const properties = new Map()
  for (const line of wire.replace(/\r\n[ \t]/g, '').split('\r\n')) {
    if (!line) continue
    const colon = line.indexOf(':')
    assert.ok(colon > 0, 'each logical property has a name and colon')
    const key = line.slice(0, colon)
    const value = line.slice(colon + 1).replace(/\\([nN,;\\])/g, (_, char) => /[nN]/.test(char) ? '\n' : char)
    const values = properties.get(key) || []
    values.push(value)
    properties.set(key, values)
  }
  return { wire, properties }
}

function convert(csv) {
  return exportContactsToVcf(parseContactsText({ fileName: 'generated.csv', text: csv }).contacts)
}
const quote = (value) => '"' + value.replaceAll('"', '""') + '"'

for (const name of ['A'.repeat(70) + '😀 Кінець', 'Олександр Марія '.repeat(15) + '👩‍💻']) {
  test('UTF-8 bytes retain the full generated name: ' + name.slice(0, 12), () => {
    const { wire, properties } = decodeProperties(convert('Name,Phone\r\n' + quote(name) + ',+380501234567'))
    assert.deepEqual(properties.get('FN'), [name])
    assert.deepEqual(properties.get('TEL;TYPE=CELL'), ['+380501234567'])
    for (const physical of wire.split('\r\n')) assert.ok(Buffer.byteLength(physical) <= 75, 'physical line exceeds 75 UTF-8 octets')
  })
}

test('quoted multiline notes retain logical CRLF, CR and LF breaks and escaped literals', () => {
  const notes = 'Перший 😀\r\nДругий, рядок; шлях C:\\notes\rТретій\nЧетвертий "quote"'
  const { properties } = decodeProperties(convert('Name,Phone,Notes\r\nExample,+380501234567,' + quote(notes)))
  assert.deepEqual(properties.get('NOTE'), [notes.replace(/\r\n?/g, '\n')])
})

for (const [label, row, message] of [
  ['excess fields', 'Broken,+380509999999,lost', /has 3 fields; the header has 2/],
  ['unclosed quote', '"Broken,+380509999999', /unclosed quoted field/],
  ['bare quote', 'Bro"ken,+380509999999', /invalid quote/],
  ['text after quote', '"Broken"x,+380509999999', /invalid quote/],
]) {
  test('rejects ' + label + ' without exporting a partial earlier contact', () => {
    let output = null
    assert.throws(() => { output = convert('Name,Phone\r\nValid,+380501234567\r\n' + row) }, message)
    assert.equal(output, null)
  })
}

test('short CSV keeps the established exact VCF bytes', () => {
  assert.equal(convert('Name,Phone,Notes\r\nMaya Chen,+14155550101,"Has comma, semicolon; and ""quote"""'),
    'BEGIN:VCARD\r\nVERSION:3.0\r\nN:;;;;\r\nFN:Maya Chen\r\nTEL;TYPE=CELL:+14155550101\r\nNOTE:Has comma\\, semicolon\\; and "quote"\r\nEND:VCARD\r\n')
})

test('valid delimiters, doubled quotes, embedded newline, BOM and short rows remain accepted', () => {
  for (const delimiter of [',', ';', '\t']) {
    const result = parseContactsText({ fileName: 'valid.csv', text: '\uFEFFName' + delimiter + 'Phone' + delimiter + 'Notes\r\n"Ім’я ""Тест"""' + delimiter + '+380501234567' + delimiter + '"Line 1\nLine 2"\r\nShort' })
    assert.equal(result.contacts.length, 2)
    assert.equal(result.contacts[0].fullName, 'Ім’я "Тест"')
    assert.equal(result.contacts[0].notes, 'Line 1\nLine 2')
    assert.equal(result.contacts[1].fullName, 'Short')
  }
})

