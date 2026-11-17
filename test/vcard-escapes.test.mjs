import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportContactsToVcf, parseContactsText } from '../src/contacts-converter.js'

test('reopened VCF distinguishes literal backslashes from newline and punctuation escapes', () => {
  const notes = String.raw`Папка C:\new\notes; archive, marker \N 😀` + '\r\nSecond line'
  const firstName = String.raw`Ana\n`
  const lastName = String.raw`Rios; Cruz\, Jr.`
  const csv = `First Name,Last Name,Email,Notes\r\n"${firstName}","${lastName}",ana@example.test,"${notes}"\r\n`
  const original = parseContactsText({ fileName: 'contacts.csv', text: csv })
  const exported = exportContactsToVcf(original.contacts)
  const reopened = parseContactsText({ fileName: 'contacts.vcf', text: exported })

  assert.equal(reopened.contacts.length, 1)
  assert.equal(reopened.contacts[0].notes, notes.replace('\r\n', '\n'))
  assert.equal(reopened.contacts[0].firstName, firstName)
  assert.equal(reopened.contacts[0].lastName, lastName)
  assert.equal(reopened.contacts[0].emails[0], 'ana@example.test')
  assert.equal(exportContactsToVcf(reopened.contacts), exported)
})
