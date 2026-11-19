import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  decodeContactsBytes,
  exportContactsToCsv,
  exportContactsToVcf,
  parseContactsText,
  summarizeContactsResult,
} from '../src/contacts-converter.js'

test('parses CSV contacts, maps common fields, and exports VCF/CSV locally', () => {
  const csv = [
    'First Name,Last Name,Mobile,Email,Company,Title,Notes',
    'Maya,Chen,+1 415 555 0101,maya@example.com,Arcadia Labs,Product Lead,"Uses iCloud import"',
    'Jon,Rivera,+1 415 555 0102,jon@example.com,Northwind,Ops Manager,"Has comma, in note"',
  ].join('\n')

  const result = parseContactsText({ fileName: 'contacts.csv', text: csv })
  const summary = summarizeContactsResult(result)
  const vcf = exportContactsToVcf(result.contacts)
  const exportedCsv = exportContactsToCsv(result.contacts)

  assert.equal(result.sourceType, 'csv')
  assert.equal(summary.contactCount, 2)
  assert.equal(result.mapping.firstName, 'First Name')
  assert.equal(result.mapping.organization, 'Company')
  assert.match(vcf, /BEGIN:VCARD/)
  assert.match(vcf, /VERSION:3\.0/)
  assert.match(vcf, /FN:Maya Chen/)
  assert.match(vcf, /TEL;TYPE=CELL:\+1 415 555 0101/)
  assert.match(exportedCsv, /Full Name,First Name,Last Name/)
  assert.match(exportedCsv, /Maya Chen,Maya,Chen/)
})

test('exports numbered phone and email values without importing their labels', () => {
  const csv = [
    'First Name,Last Name,Phone 1 - Label,Phone 1 - Value,Phone 2 - Label,Phone 2 - Value,E-mail 1 - Type,E-mail 1 - Value',
    'Ірина,Коваль,Mobile,+1 202 555 0101,Work,+1 202 555 0199,Work,iryna@example.invalid',
    'Μαρία,Παππά,Mobile,+1 202 555 0102,Work,+1 202 555 0199,Work,maria@example.invalid',
    'Ірина,Коваль,Mobile,+1 202 555 0101,,,Work,iryna@example.invalid',
  ].join('\n')
  const result = parseContactsText({ fileName: 'training-roster.csv', text: csv })
  assert.equal(result.mapping.phone, 'Phone 1 - Value')
  assert.equal(result.mapping.email, 'E-mail 1 - Value')
  assert.deepEqual(result.contacts.map(contact => contact.phones), [
    ['+1 202 555 0101', '+1 202 555 0199'],
    ['+1 202 555 0102', '+1 202 555 0199'],
    ['+1 202 555 0101'],
  ])
  assert.deepEqual(result.contacts.map(contact => contact.emails), [
    ['iryna@example.invalid'], ['maria@example.invalid'], ['iryna@example.invalid'],
  ])
  assert.deepEqual(result.warnings
    .filter(warning => warning.code === 'possible-duplicate')
    .map(warning => warning.detail), ['Rows 2 and 4'])
  assert.doesNotMatch(exportContactsToVcf(result.contacts), /^(?:TEL|EMAIL)[^:\r\n]*:(?:Mobile|Work)\r?$/m)
})

test('detects semicolon CSV, duplicate contacts, and unmapped columns', () => {
  const csv = [
    'Name;Phone;Email;Secret Column',
    'Duplicate Person;+1 555 0001;dup@example.com;keep private',
    'Duplicate Person;+1 555 0001;dup@example.com;keep private',
    'No Contact;;;orphan',
  ].join('\n')

  const result = parseContactsText({ fileName: 'contacts.csv', text: csv })
  const codes = result.warnings.map((warning) => warning.code)

  assert.equal(result.delimiter, ';')
  assert.equal(result.contacts.length, 3)
  assert.ok(codes.includes('possible-duplicate'))
  assert.ok(codes.includes('missing-contact-method'))
  assert.ok(codes.includes('unmapped-column'))
})

test('parses common vCard input and downgrades export to VCF 3.0', () => {
  const vcf = [
    'BEGIN:VCARD',
    'VERSION:4.0',
    'FN:Alex Example',
    'N:Example;Alex;;;',
    'TEL;TYPE=cell:+44 20 5555 0101',
    'EMAIL:alex@example.com',
    'ORG:Example Co',
    'NOTE:Long note that will be folded when exported because it is intentionally longer than the usual vCard line length for compatibility testing.',
    'END:VCARD',
  ].join('\r\n')

  const result = parseContactsText({ fileName: 'contacts.vcf', text: vcf })
  const exported = exportContactsToVcf(result.contacts)

  assert.equal(result.sourceType, 'vcf')
  assert.equal(result.contacts.length, 1)
  assert.equal(result.contacts[0].fullName, 'Alex Example')
  assert.equal(result.contacts[0].phones[0], '+44 20 5555 0101')
  assert.match(exported, /VERSION:3\.0/)
  assert.match(exported, /\r\n /, 'long vCard output should fold continuation lines')
})

test('limits export to the first 10 contacts when a limit is supplied', () => {
  const rows = ['First Name,Last Name,Phone']
  for (let index = 1; index <= 12; index += 1) {
    rows.push(`Person,${index},+1 555 00${String(index).padStart(2, '0')}`)
  }

  const result = parseContactsText({ fileName: 'contacts.csv', text: rows.join('\n') })
  const sample = exportContactsToVcf(result.contacts, 10)
  const full = exportContactsToVcf(result.contacts)

  assert.equal((sample.match(/BEGIN:VCARD/g) || []).length, 10)
  assert.equal((full.match(/BEGIN:VCARD/g) || []).length, 12)
})

test('decodes Unicode without silently repairing legacy or corrupt bytes', () => {
  const input = 'Name,Notes\r\nМарія Бойко,Перша зустріч 😀\r\n'
  const utf8 = Buffer.from(input, 'utf8')
  const utf16 = Buffer.from(input, 'utf16le')
  assert.equal(decodeContactsBytes(utf8), input)
  assert.equal(decodeContactsBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8])), input)
  assert.equal(decodeContactsBytes(Buffer.concat([Buffer.from([0xff, 0xfe]), utf16])), input)
  assert.equal(decodeContactsBytes(Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(utf16).swap16()])), input)
  for (const bad of [
    Buffer.from([0xcc, 0xe0, 0xf0, 0xb3, 0xff]),
    Buffer.from([0xff, 0xfe, 0x41]),
    Buffer.from([0xff, 0xfe, 0, 0, 0x41, 0, 0, 0]),
  ]) {
    assert.throws(() => decodeContactsBytes(bad), /Save this file as UTF-8 CSV or VCF/)
  }
})

test('keeps all values under repeated phone and email headers', () => {
  const data = [
    'Maya Rivera,+12025550101,+12025550102,maya.work@example.test,maya.home@example.test',
    'Alex Kim,+12025550101,+12025550103,alex.work@example.test,alex.home@example.test',
    'Sam Lee,+12025550104,+12025550104,sam@example.test,SAM@example.test',
  ].join('\n')
  const expected = [
    { phones: ['+12025550101', '+12025550102'], emails: ['maya.work@example.test', 'maya.home@example.test'] },
    { phones: ['+12025550101', '+12025550103'], emails: ['alex.work@example.test', 'alex.home@example.test'] },
    { phones: ['+12025550104'], emails: ['sam@example.test'] },
  ]
  const profiles = ({ contacts }) => contacts.map(({ phones, emails }) => ({ phones, emails }))

  for (const { headers, mapping } of [
    { headers: 'Name,Phone,Phone,Email,Email' },
    { headers: 'Name,Desk,Desk,Inbox,Inbox', mapping: { fullName: 'Name', phone: 'Desk', email: 'Inbox' } },
  ]) {
    const result = parseContactsText({ fileName: 'training.csv', text: headers + '\n' + data, mapping })
    assert.deepEqual(profiles(result), expected)
    assert.deepEqual(profiles(parseContactsText({
      fileName: 'training.vcf', text: exportContactsToVcf(result.contacts),
    })), expected)
  }
})
