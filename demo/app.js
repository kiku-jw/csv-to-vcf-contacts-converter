import {
  exportContactsToCsv,
  exportContactsToVcf,
  parseContactsText,
  summarizeContactsResult,
} from '../src/contacts-converter.js'

const fileInput = document.querySelector('#fileInput')
const dropZone = document.querySelector('#dropZone')
const sampleButton = document.querySelector('#sampleButton')
const downloadVcfButton = document.querySelector('#downloadVcfButton')
const downloadCsvButton = document.querySelector('#downloadCsvButton')
const status = document.querySelector('#status')
const summaryList = document.querySelector('#summaryList')
const warningList = document.querySelector('#warningList')
const previewBody = document.querySelector('#previewBody')

let currentResult = null

const sampleCsv = [
  'First Name,Last Name,Mobile,Email,Company,Title,Notes',
  'Maya,Chen,+1 415 555 0101,maya@example.com,Arcadia Labs,Product Lead,"Uses iCloud import"',
  'Jon,Rivera,+1 415 555 0102,jon@example.com,Northwind,Ops Manager,"Has comma, in note"',
  'Duplicate,Person,+1 415 555 0103,duplicate@example.com,Northwind,,',
  'Duplicate,Person,+1 415 555 0103,duplicate@example.com,Northwind,,',
].join('\n')

function setStatus(message, kind = 'neutral') {
  status.textContent = message
  status.dataset.kind = kind
}

function setDownloadState(enabled) {
  downloadVcfButton.disabled = !enabled
  downloadCsvButton.disabled = !enabled
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild)
}

function appendDefinition(label, value) {
  const term = document.createElement('dt')
  const description = document.createElement('dd')
  term.textContent = label
  description.textContent = value
  summaryList.append(term, description)
}

function renderResult(result, fileName) {
  currentResult = result
  const summary = summarizeContactsResult(result)

  clearNode(summaryList)
  clearNode(warningList)
  clearNode(previewBody)

  appendDefinition('Contacts', String(summary.contactCount))
  appendDefinition('Source type', summary.sourceType.toUpperCase())
  appendDefinition('Delimiter', summary.delimiter || 'n/a')
  appendDefinition('Warnings', String(summary.warningCount))

  if (result.warnings.length) {
    for (const warning of result.warnings.slice(0, 12)) {
      const item = document.createElement('li')
      item.textContent = `${warning.message}: ${warning.detail}`
      warningList.append(item)
    }
  } else {
    const item = document.createElement('li')
    item.textContent = 'No warnings detected.'
    warningList.append(item)
  }

  for (const contact of result.contacts.slice(0, 20)) {
    const row = document.createElement('tr')
    const cells = [
      contact.fullName || 'Unnamed contact',
      contact.phones?.[0] || '',
      contact.emails?.[0] || '',
      contact.organization || '',
    ]

    for (const value of cells) {
      const cell = document.createElement('td')
      cell.textContent = value
      row.append(cell)
    }

    previewBody.append(row)
  }

  setDownloadState(result.contacts.length > 0)
  setStatus(`Loaded ${fileName}: ${result.contacts.length} contacts parsed.`, 'success')
}

function parseText(fileName, text) {
  try {
    const result = parseContactsText({ fileName, text })
    renderResult(result, fileName)
  } catch (error) {
    currentResult = null
    setDownloadState(false)
    setStatus(error instanceof Error ? error.message : 'Could not parse contacts.', 'error')
  }
}

function readFile(file) {
  if (!file) return
  const reader = new FileReader()
  reader.addEventListener('load', () => parseText(file.name, String(reader.result || '')))
  reader.addEventListener('error', () => setStatus('Could not read the selected file.', 'error'))
  reader.readAsText(file)
}

function downloadText(fileName, text, type) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

fileInput.addEventListener('change', () => {
  readFile(fileInput.files?.[0])
})

sampleButton.addEventListener('click', () => {
  parseText('sample-contacts.csv', sampleCsv)
})

downloadVcfButton.addEventListener('click', () => {
  if (!currentResult) return
  downloadText('contacts.vcf', exportContactsToVcf(currentResult.contacts), 'text/vcard;charset=utf-8')
})

downloadCsvButton.addEventListener('click', () => {
  if (!currentResult) return
  downloadText('contacts-clean.csv', exportContactsToCsv(currentResult.contacts), 'text/csv;charset=utf-8')
})

dropZone.addEventListener('dragover', (event) => {
  event.preventDefault()
  dropZone.dataset.dragging = 'true'
})

dropZone.addEventListener('dragleave', () => {
  delete dropZone.dataset.dragging
})

dropZone.addEventListener('drop', (event) => {
  event.preventDefault()
  delete dropZone.dataset.dragging
  readFile(event.dataTransfer?.files?.[0])
})
