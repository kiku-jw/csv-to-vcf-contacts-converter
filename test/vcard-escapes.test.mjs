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

test('legacy UTF-8 quoted-printable vCards preserve names and soft-wrapped notes', () => {
  const text = [
    "BEGIN:VCARD",
    "VERSION:2.1",
    "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D0=9A=D0=BE=D0=B2=D0=B0=D0=BB=D1=8C;=D0=9E=D0=BB=D0=B5=D0=BD=D0=B0;;;",
    "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D0=9E=D0=BB=D0=B5=D0=BD=D0=B0 =D0=9A=D0=BE=D0=B2=D0=B0=D0=BB=D1=8C",
    "TEL;CELL:+380441230001",
    "NOTE;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D0=92=D1=96=D0=B4=D0=B4=D1=96=D0=BB =D0=BD=D0=B0=D0=B2=D1=87=D0=B0=D0=BD=",
    "=D0=BD=D1=8F. =D0=9F=D1=96=D0=B4=D0=B3=D0=BE=D1=82=D0=BE=D0=B2=D0=BA=D0=B0 =",
    "=D0=B7=D1=83=D1=81=D1=82=D1=80=D1=96=D1=87=D1=96 =D1=83 =D1=87=D0=B5=D1=82=",
    "=D0=B2=D0=B5=D1=80.",
    "END:VCARD",
  ].join('\r\n')
  const parsed = parseContactsText({ fileName: 'phone-export.vcf', text })
  const output = exportContactsToVcf(parsed.contacts)
  const reopened = parseContactsText({ fileName: 'reopened.vcf', text: output })
  assert.equal(reopened.contacts[0].fullName, 'Олена Коваль')
  assert.equal(reopened.contacts[0].firstName, 'Олена')
  assert.equal(reopened.contacts[0].lastName, 'Коваль')
  assert.equal(reopened.contacts[0].notes, 'Відділ навчання. Підготовка зустрічі у четвер.')
  assert.deepEqual(reopened.contacts[0].phones, ['+380441230001'])
})

test('legacy truncated quoted-printable fields block conversion before losing data', () => {
  const text = 'BEGIN:VCARD\r\nVERSION:2.1\r\nFN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D0=\r\nEND:VCARD\r\n'
  assert.throws(() => parseContactsText({ fileName: 'incomplete.vcf', text }), /incomplete quoted-printable/i)
  const beforeAnotherProperty = text.replace('END:VCARD', 'TEL;CELL:+380441230001\r\nEND:VCARD')
  assert.throws(() => parseContactsText({ fileName: 'incomplete.vcf', text: beforeAnotherProperty }), /incomplete quoted-printable/i)
})
