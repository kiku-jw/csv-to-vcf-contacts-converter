const CONTACT_FIELDS = [
  { key: 'fullName', label: 'Full name' },
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'organization', label: 'Organization' },
  { key: 'title', label: 'Title' },
  { key: 'address', label: 'Address' },
  { key: 'notes', label: 'Notes' },
  { key: 'url', label: 'URL' },
]

const FIELD_ALIASES = {
  fullName: ['name', 'full name', 'display name', 'contact name', 'fn'],
  firstName: ['first name', 'given name', 'firstname', 'givenname', 'first'],
  lastName: ['last name', 'family name', 'surname', 'lastname', 'familyname', 'last'],
  phone: ['phone', 'phone number', 'mobile', 'cell', 'telephone', 'tel', 'primary phone', 'phone 1 - value'],
  email: ['email', 'e-mail', 'mail', 'email address', 'e-mail address', 'email 1 - value'],
  organization: ['organization', 'organisation', 'company', 'org', 'company name'],
  title: ['title', 'job title', 'position', 'role'],
  address: ['address', 'street', 'postal address', 'home address', 'business address'],
  notes: ['notes', 'note', 'description', 'memo'],
  url: ['url', 'website', 'web site', 'homepage', 'web page'],
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function cleanValue(value) {
  return String(value || '').replace(/\u0000/g, '').trim()
}

function normalizeIdentity(value) {
  return cleanValue(value).toLowerCase().replace(/[^\p{L}\p{N}@+]+/gu, '')
}

function uniqueValues(values) {
  const seen = new Set()
  const result = []

  for (const value of values.map(cleanValue).filter(Boolean)) {
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }

  return result
}

function detectDelimiter(text) {
  const firstUsefulLine = String(text || '')
    .split(/\r?\n/)
    .find((line) => line.trim()) || ''
  const candidates = [',', ';', '\t']
  let winner = ','
  let bestScore = -1

  for (const delimiter of candidates) {
    let insideQuotes = false
    let score = 0

    for (let index = 0; index < firstUsefulLine.length; index += 1) {
      const char = firstUsefulLine[index]
      const next = firstUsefulLine[index + 1]

      if (char === '"' && next === '"') {
        index += 1
        continue
      }
      if (char === '"') insideQuotes = !insideQuotes
      if (!insideQuotes && char === delimiter) score += 1
    }

    if (score > bestScore) {
      bestScore = score
      winner = delimiter
    }
  }

  return winner
}

function parseDelimitedRows(text, delimiter) {
  const rows = []
  let row = []
  let cell = ''
  let insideQuotes = false
  const source = String(text || '').replace(/^\uFEFF/, '')

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]

    if (insideQuotes && char === '"' && next === '"') {
      cell += '"'
      index += 1
      continue
    }

    if (char === '"') {
      insideQuotes = !insideQuotes
      continue
    }

    if (!insideQuotes && char === delimiter) {
      row.push(cell)
      cell = ''
      continue
    }

    if (!insideQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }

    cell += char
  }

  row.push(cell)
  rows.push(row)

  return rows.filter((cells) => cells.some((value) => cleanValue(value)))
}

function parseCsv(text) {
  const delimiter = detectDelimiter(text)
  const rows = parseDelimitedRows(text, delimiter)
  const headers = rows[0] ? rows[0].map((header) => cleanValue(header)) : []
  const dataRows = rows.slice(1).map((row) => {
    const normalized = []
    for (let index = 0; index < headers.length; index += 1) {
      normalized.push(cleanValue(row[index]))
    }
    return normalized
  })

  return { delimiter, headers, rows: dataRows }
}

function getDefaultCsvMapping(headers) {
  const mapping = {}
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }))

  for (const field of CONTACT_FIELDS) {
    const aliases = FIELD_ALIASES[field.key] || []
    const exact = normalizedHeaders.find((header) => aliases.includes(header.normalized))
    if (exact) {
      mapping[field.key] = exact.original
      continue
    }

    if (field.key === 'fullName') {
      mapping[field.key] = ''
      continue
    }

    const partial = normalizedHeaders.find((header) => aliases.some((alias) => header.normalized.includes(alias)))
    mapping[field.key] = partial ? partial.original : ''
  }

  return mapping
}

function rowCell(headers, row, headerName) {
  if (!headerName) return ''
  const index = headers.indexOf(headerName)
  if (index < 0) return ''
  return cleanValue(row[index])
}

function collectAliasValues(headers, row, fieldKey, mappedHeader) {
  const aliases = FIELD_ALIASES[fieldKey] || []
  const values = []

  if (mappedHeader) values.push(rowCell(headers, row, mappedHeader))

  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index]
    if (header === mappedHeader) continue
    const normalized = normalizeHeader(header)
    const matches = aliases.some((alias) => normalized === alias || normalized.includes(alias))
    if (matches) values.push(row[index])
  }

  return uniqueValues(values)
}

function buildFullName(contact) {
  if (contact.fullName) return contact.fullName
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim()
}

function makeWarning(code, message, detail = '') {
  return { code, message, detail }
}

function buildContactsFromCsv(parsed, mapping) {
  const contacts = []
  const warnings = []
  const usedHeaders = new Set(Object.values(mapping).filter(Boolean))
  const duplicateKeys = new Map()
  const unmappedColumns = parsed.headers.filter((header) => !usedHeaders.has(header))

  parsed.rows.forEach((row, rowIndex) => {
    const phones = collectAliasValues(parsed.headers, row, 'phone', mapping.phone)
    const emails = collectAliasValues(parsed.headers, row, 'email', mapping.email)
    const contact = {
      firstName: rowCell(parsed.headers, row, mapping.firstName),
      lastName: rowCell(parsed.headers, row, mapping.lastName),
      fullName: rowCell(parsed.headers, row, mapping.fullName),
      phones,
      emails,
      organization: rowCell(parsed.headers, row, mapping.organization),
      title: rowCell(parsed.headers, row, mapping.title),
      addresses: uniqueValues([rowCell(parsed.headers, row, mapping.address)]),
      notes: rowCell(parsed.headers, row, mapping.notes),
      urls: uniqueValues([rowCell(parsed.headers, row, mapping.url)]),
      sourceMeta: { rowNumber: rowIndex + 2 },
    }

    contact.fullName = buildFullName(contact)
    contacts.push(contact)

    if (!contact.fullName) warnings.push(makeWarning('missing-name', 'Missing name', `CSV row ${rowIndex + 2}`))
    if (!contact.phones.length && !contact.emails.length) {
      warnings.push(makeWarning('missing-contact-method', 'Missing phone and email', `CSV row ${rowIndex + 2}`))
    }

    const duplicateKey = [
      normalizeIdentity(contact.fullName),
      normalizeIdentity(contact.phones[0] || contact.emails[0] || ''),
    ].join('|')

    if (duplicateKey !== '|') {
      const previous = duplicateKeys.get(duplicateKey)
      if (previous) warnings.push(makeWarning('possible-duplicate', 'Possible duplicate contact', `Rows ${previous} and ${rowIndex + 2}`))
      else duplicateKeys.set(duplicateKey, rowIndex + 2)
    }
  })

  for (const header of unmappedColumns) {
    const hasData = parsed.rows.some((row) => cleanValue(row[parsed.headers.indexOf(header)]))
    if (hasData) warnings.push(makeWarning('unmapped-column', 'Unmapped source column', header))
  }

  return { contacts, warnings, unmappedColumns }
}

function unfoldVcardLines(text) {
  return String(text || '')
    .replace(/\r\n[ \t]/g, '')
    .replace(/\n[ \t]/g, '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
}

function unescapeVcardValue(value) {
  return cleanValue(value)
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

function splitVcardValue(value) {
  const parts = []
  let current = ''
  let escaped = false

  for (const char of String(value || '')) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\') {
      current += char
      escaped = true
      continue
    }
    if (char === ';') {
      parts.push(unescapeVcardValue(current))
      current = ''
      continue
    }
    current += char
  }

  parts.push(unescapeVcardValue(current))
  return parts
}

function emptyContact(rowNumber) {
  return {
    firstName: '',
    lastName: '',
    fullName: '',
    phones: [],
    emails: [],
    organization: '',
    title: '',
    addresses: [],
    notes: '',
    urls: [],
    sourceMeta: { rowNumber },
  }
}

function parseVcard(text) {
  const lines = unfoldVcardLines(text)
  const contacts = []
  const warnings = []
  let current = null
  let currentStart = 0

  lines.forEach((line, index) => {
    if (!line) return
    const upper = line.toUpperCase()
    if (upper === 'BEGIN:VCARD') {
      current = emptyContact(index + 1)
      currentStart = index + 1
      return
    }
    if (upper === 'END:VCARD') {
      if (current) {
        current.phones = uniqueValues(current.phones)
        current.emails = uniqueValues(current.emails)
        current.addresses = uniqueValues(current.addresses)
        current.urls = uniqueValues(current.urls)
        current.fullName = buildFullName(current)
        contacts.push(current)
        current = null
      }
      return
    }
    if (!current) return

    const colonIndex = line.indexOf(':')
    if (colonIndex < 0) {
      warnings.push(makeWarning('malformed-line', 'Malformed vCard line', `Line ${index + 1}`))
      return
    }

    const left = line.slice(0, colonIndex)
    const rawValue = line.slice(colonIndex + 1)
    const rawName = left.split(';')[0] || ''
    const name = rawName.includes('.') ? rawName.split('.').pop().toUpperCase() : rawName.toUpperCase()
    const value = unescapeVcardValue(rawValue)

    if (name === 'VERSION' && !['2.1', '3.0', '4.0'].includes(value)) {
      warnings.push(makeWarning('unsupported-version', 'Unexpected vCard version', value))
      return
    }
    if (name === 'FN') current.fullName = value
    else if (name === 'N') {
      const parts = splitVcardValue(rawValue)
      current.lastName = parts[0] || ''
      current.firstName = parts[1] || ''
    } else if (name === 'TEL') current.phones.push(value)
    else if (name === 'EMAIL') current.emails.push(value)
    else if (name === 'ORG') current.organization = splitVcardValue(rawValue).filter(Boolean).join(' ')
    else if (name === 'TITLE') current.title = value
    else if (name === 'ADR') current.addresses.push(splitVcardValue(rawValue).filter(Boolean).join(', '))
    else if (name === 'NOTE') current.notes = [current.notes, value].filter(Boolean).join('\n')
    else if (name === 'URL') current.urls.push(value)
  })

  if (current) warnings.push(makeWarning('unclosed-vcard', 'Unclosed vCard block', `Started at line ${currentStart}`))

  contacts.forEach((contact, index) => {
    if (!contact.fullName) warnings.push(makeWarning('missing-name', 'Missing name', `vCard ${index + 1}`))
    if (!contact.phones.length && !contact.emails.length) {
      warnings.push(makeWarning('missing-contact-method', 'Missing phone and email', `vCard ${index + 1}`))
    }
  })

  return { contacts, warnings }
}

function detectFileType(fileName, text) {
  const lowerName = String(fileName || '').toLowerCase()
  if (lowerName.endsWith('.vcf') || /BEGIN:VCARD/i.test(text)) return 'vcf'
  return 'csv'
}

export function parseContactsText(options) {
  const fileName = options?.fileName || 'contacts'
  const text = options?.text || ''
  const requestedMapping = options?.mapping || null
  const warnings = []

  if (text.includes('\uFFFD')) {
    warnings.push(makeWarning('possible-encoding', 'Possible encoding issue', 'Replacement characters were detected'))
  }

  const sourceType = detectFileType(fileName, text)

  if (sourceType === 'vcf') {
    const parsed = parseVcard(text)
    return {
      sourceType,
      delimiter: '',
      headers: [],
      mapping: {},
      contacts: parsed.contacts,
      warnings: [...warnings, ...parsed.warnings],
      unmappedColumns: [],
    }
  }

  const parsed = parseCsv(text)
  const mapping = requestedMapping || getDefaultCsvMapping(parsed.headers)
  const built = buildContactsFromCsv(parsed, mapping)

  return {
    sourceType,
    delimiter: parsed.delimiter,
    headers: parsed.headers,
    mapping,
    contacts: built.contacts,
    warnings: [...warnings, ...built.warnings],
    unmappedColumns: built.unmappedColumns,
  }
}

function escapeVcardValue(value) {
  return cleanValue(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function foldVcardLine(line) {
  const maxLength = 74
  if (line.length <= maxLength) return line
  const chunks = []
  let rest = line

  while (rest.length > maxLength) {
    chunks.push(rest.slice(0, maxLength))
    rest = ` ${rest.slice(maxLength)}`
  }

  chunks.push(rest)
  return chunks.join('\r\n')
}

function exportContactToVcard(contact) {
  const fullName = buildFullName(contact) || 'Unnamed contact'
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escapeVcardValue(contact.lastName)};${escapeVcardValue(contact.firstName)};;;`,
    `FN:${escapeVcardValue(fullName)}`,
  ]

  for (const phone of contact.phones || []) lines.push(`TEL;TYPE=CELL:${escapeVcardValue(phone)}`)
  for (const email of contact.emails || []) lines.push(`EMAIL;TYPE=INTERNET:${escapeVcardValue(email)}`)
  if (contact.organization) lines.push(`ORG:${escapeVcardValue(contact.organization)}`)
  if (contact.title) lines.push(`TITLE:${escapeVcardValue(contact.title)}`)
  for (const address of contact.addresses || []) lines.push(`ADR;TYPE=WORK:;;${escapeVcardValue(address)};;;;`)
  if (contact.notes) lines.push(`NOTE:${escapeVcardValue(contact.notes)}`)
  for (const url of contact.urls || []) lines.push(`URL:${escapeVcardValue(url)}`)
  lines.push('END:VCARD')

  return lines.map(foldVcardLine).join('\r\n')
}

function selectedContacts(contacts, limit) {
  if (!Number.isFinite(limit)) return contacts
  return contacts.slice(0, limit)
}

export function exportContactsToVcf(contacts, limit = Infinity) {
  return `${selectedContacts(contacts, limit).map(exportContactToVcard).join('\r\n')}\r\n`
}

function csvEscape(value) {
  const cleaned = cleanValue(value)
  if (!/[",\n\r]/.test(cleaned)) return cleaned
  return `"${cleaned.replace(/"/g, '""')}"`
}

export function exportContactsToCsv(contacts, limit = Infinity) {
  const headers = [
    'Full Name',
    'First Name',
    'Last Name',
    'Phone 1',
    'Phone 2',
    'Email 1',
    'Email 2',
    'Organization',
    'Title',
    'Address',
    'Notes',
    'URL',
  ]
  const rows = selectedContacts(contacts, limit).map((contact) => [
    buildFullName(contact),
    contact.firstName,
    contact.lastName,
    contact.phones?.[0] || '',
    contact.phones?.[1] || '',
    contact.emails?.[0] || '',
    contact.emails?.[1] || '',
    contact.organization,
    contact.title,
    contact.addresses?.[0] || '',
    contact.notes,
    contact.urls?.[0] || '',
  ])

  return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n') + '\r\n'
}

export function summarizeContactsResult(result) {
  const warningCounts = result.warnings.reduce((counts, warning) => {
    counts[warning.code] = (counts[warning.code] || 0) + 1
    return counts
  }, {})

  return {
    contactCount: result.contacts.length,
    warningCount: result.warnings.length,
    sourceType: result.sourceType,
    delimiter: result.delimiter,
    warningCounts,
  }
}

export { CONTACT_FIELDS }
