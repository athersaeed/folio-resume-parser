# Folio · Simplify Clone

A local resume workspace: upload multiple resumes, review/edit the extracted
fields, save each version, then **click a field → paste into your application**.

## Run

Requires Node.js 22.12+ (or a Vite-supported newer version).

```bash
npm install
npm run dev
```

Open the localhost URL printed by Vite (normally http://127.0.0.1:5173).
`npm test` checks parsing, backup validation, and storage behavior.
`npm run build` creates a production build; `npm run preview` previews it.

## First version

- Browser-only extraction of PDF, DOCX, and TXT (15 MB limit; PDFs up to 30 pages).
- Paste text or start a blank resume.
- Review original extracted text alongside editable contact details, work history,
  education, projects, skills, and unclassified text.
- Add/remove entries, name versions, duplicate versions, and delete saved resumes.
- Explicit review/save, followed by one-click field copying with status feedback.
- Shared editable personal profile with country-specific authorization answers.
- Export/import JSON backups. Imports preserve existing records with matching IDs
  and existing profile answers. Unsaved draft edits are included in exports.
- No account, cloud service, API key, or browser extension required.

## Data and limits

Resume data stays in localStorage in the current browser and origin. Use the same
localhost URL and port to access it again. Original files are not retained, but
extracted source text is. Clear browser data and the workspace disappears; export
backups regularly. Backups contain personal information: keep them private.
Browser storage is not encrypted by this app. Source control ignores PDFs, DOCX,
`private/`, `uploads/`, and `backups/`; JSON exports should be kept outside the repo
or in `backups/`.

The parser uses conservative rules, not an AI model. **It is not a guarantee of
accurate parsing.** It recognizes common English section headings and date ranges.
Company/title ordering requires review. Undated experience remains an editable
source block. Projects are retained as one editable block for manual splitting.
Locations and degree fields are not guessed. Multi-column PDFs can interleave text;
check the source panel or paste a clean text version. Scanned PDFs need OCR, which
is not included. The parser never infers work eligibility, veteran status, or
other personal answers.

Click-to-copy requires localhost or HTTPS and browser clipboard permission. A
blocked copy reports an error. No form is submitted or autofilled in this version.

## Roadmap

See cloud.md for architecture and the future Workday, Greenhouse, and Ashby
extension plan. AGENTS.md and CLAUDE.md define agent working conventions.
