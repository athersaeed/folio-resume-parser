# Version 0.1 verification

Verified locally on October 21, 2026 using synthetic resumes only.

- Pasted text opens structured fields beside the original source.
- Multiple work experiences remain separate, with their own dates and descriptions.
- Edited a location and resume name, reviewed and saved, then copied an email.
  The browser clipboard contained the exact expected email value.
- Reloaded the browser: the saved version and edited location remained available.
- Uploaded a synthetic text-based PDF: contact, experience, education, and source
  text opened in the review editor. Saved as a second independent version.
- Uploaded a synthetic DOCX: extracted the same body text and structured fields.
- `npm test`: eight parser/storage tests cover boundaries, date formats,
  missing fields, source preservation, backups, malformed imports, and save failure.
- Production build succeeds. Parser modules load on demand.
- `npm audit`: no known dependency vulnerabilities at setup time.

Limits: no real personal resume has been validated yet. Complex columns, scanned
PDFs, and unusual heading/date formats need manual review. OCR, AI parsing,
browser autofill, cloud sync, and GitHub remote setup are outside this release.

## Application history

- Logged a synthetic company/role using the quick action on a saved resume.
  The form preselected that resume, and the saved record showed its name.
- Opened the stored snapshot and verified its contact, experience, and education.
- Changed the record status to Interviewing and reloaded: history and status persisted.
- Eleven tests now include snapshot independence, persistence without the original
  resume, migration of older workspaces, application backup deduplication, and
  rejection of incomplete records, invalid dates, and unsafe links.
