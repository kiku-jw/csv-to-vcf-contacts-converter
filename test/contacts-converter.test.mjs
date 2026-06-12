import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
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
