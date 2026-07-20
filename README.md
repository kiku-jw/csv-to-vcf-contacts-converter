# CSV to VCF Contacts Converter

The standalone browser-local implementation remains usable in this repository.
An integrated version is also available on
[kikuai.dev](https://kikuai.dev/csv-to-vcf-contacts-converter/).

Browser-local contact converter for turning CSV contact exports into VCF/vCard files and normalizing VCF files back into clean CSV.

**[Open the browser-local converter](https://kikuai.dev/csv-to-vcf-contacts-converter/)**

[Docs](#what-it-does) · [Examples](#run-locally) · [Expected output](#expected-output)

Sample output:

```text
contacts.vcf
normalized-contacts.csv
```

The product boundary is intentionally small:

- files are parsed in the browser;
- no upload server is required;
- no account, analytics, or payment code is included;
- the core converter has no runtime dependencies.

## What It Does

- Detects CSV delimiters: comma, semicolon, or tab.
- Maps common contact columns such as name, phone, email, company, title, address, notes, and URL.
- Parses common vCard input.
- Exports VCF 3.0 for broad iPhone, Android, and Google Contacts compatibility.
- Exports a normalized CSV copy.
- Warns about duplicate contacts, missing names, missing contact methods, unmapped columns, malformed vCard lines, and likely encoding issues.

## Run Locally

```bash
npm test
npm run serve
```

Then open:

```text
http://localhost:4173/demo/
```

## Expected Output

- `npm test` runs the converter test suite.
- The browser demo converts CSV contacts into `.vcf` output and can normalize
  VCF input back into CSV.
- The conversion happens in the browser session; contacts are not uploaded to a
  backend.

## Repository Layout

```text
src/contacts-converter.js       Core parser and exporter
test/contacts-converter.test.mjs Node test suite
demo/                           Static browser demo
```

## Privacy Model

The static demo imports the converter directly and processes files in the user's browser session. It does not send contacts to a backend.

If this becomes a paid product later, keep the same boundary: preview and conversion stay local, while checkout or license validation can live outside the contact-processing path.

## License

MIT.
