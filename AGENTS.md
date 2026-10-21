# Project instructions

## Purpose and scope

Build a local-first resume workspace: upload multiple resumes, parse, review/edit,
save versions, and click a field to copy it. The user pastes into applications.
Browser autofill is a later phase targeting Workday, Greenhouse, and Ashby.

## Working agreements

- Keep project code and documentation inside this repository.
- Keep application resume snapshots independent of later resume edits/deletion.
- Preserve each resume version independently. Never merge conflicting dates or wording.
- Never invent missing resume facts. Surface parser uncertainty and retain source text.
- Require an explicit review/save before a new resume enters copy mode.
- Store personal data locally; no external resume/AI service without explicit user authorization.
- Never commit resumes, profile data, secrets, or exports. Use synthetic test fixtures.
- Keep copy controls accessible by keyboard; communicate clipboard failures honestly.
- Keep all saved records and original references portable across paths and OSes.
- Never silently fall back to browser storage or initialize a missing data folder.
- Preserve drafts if a save fails. Do not claim persistence before storage succeeds.
- Run `npm test` and `npm run build` for functional changes. Test actual parsing edge cases.
- Review the diff before committing. Never deploy publicly without a user request.

## Structure

`src/parser.js`: conservative parser and data model.
`src/files.js`: browser-only PDF/DOCX/text extraction.
`src/applications.js`: application records and immutable resume snapshots.
`src/storage.js`: portable data validation, legacy browser migration, backup merging.
`src/folder-client.js`: localhost API client and optimistic revision tracking.
`src/FolderSetup.jsx`: folder setup and switching.
`server/`: folder persistence, original files, revision history, localhost API.
`vite.config.js`: API middleware for development and built preview.
`src/main.jsx`: application UI.
`src/style.css`: responsive styling.
`tests/`: synthetic parser/storage fixtures.

## Commands

`npm install`, `npm run dev`, `npm test`, `npm run build`.
See README.md and cloud.md for limitations and roadmap.
