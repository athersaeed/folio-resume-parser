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

## Version 0.2: folder persistence

Verified locally on October 21, 2026 with synthetic data and temporary folders.

- Selected an empty folder through the setup screen, uploaded/reviewed a text
  resume, saved it, and verified the original bytes and workspace JSON on disk.
- Reloaded the browser and reopened a copied folder through Change data folder.
  Resume content and click-to-copy were restored; downloading the original worked.
- Nineteen tests cover existing parser/application behavior plus folder creation,
  revision history, reconnecting after restart, complete folder migration, original
  deduplication/retention, corrupted/missing storage, stale writes, cross-process
  locks, failed disk writes, missing originals, and localhost API access boundaries.
- Tests that start localhost HTTP servers require a network-enabled environment.
- Cross-OS portability uses relative file IDs and ordinary JSON/files. Runtime
  validation was performed on Linux; Windows/macOS have not been device-tested.
- Saved data uses the folder; old browser data is only an explicit migration source.
  JSON exports do not include file bytes or full history; copy the entire folder.

## Continuous resume layout

- Replaced resume section tabs with a single scrollable stack in saved and review modes.
- Browser-checked contact, education, multiple experiences, projects, uploads,
  links, skill chips, and additional text using an isolated synthetic workspace.
- Verified copying a description bullet includes its wrapped continuation, and
  verified individual skill-chip copying against the browser clipboard.
- Used the Education card edit action, changed a school, and saved successfully.
  No browser console errors/warnings were recorded during that flow.
- Save controls remain available in a sticky toolbar during long-page review.
