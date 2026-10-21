# Folio · Simplify Clone

A local resume workspace: upload multiple resumes, review/edit their fields,
click to copy into applications, and track which resume you used for each job.
All saved data lives in a folder you choose on your computer.

## Run

Requires Node.js 22.12+ (or a Vite-supported newer version).

```bash
npm install
npm run dev
```

Open the localhost URL printed by Vite. On first launch:

1. Create an empty folder with your file manager, preferably outside the app's
   source-code folder (for example, a `Folio Data` folder in Documents).
2. Browse to it in Folio, or paste its full absolute path. Click **Use this folder**.
3. Upload a resume, review the extracted fields, and save.

For a built version, run `npm run build` once, then `npm start`.
Both development and built previews include the localhost storage API. Simply
opening `dist/index.html` or serving it with an unrelated static server will not work.
The storage server binds to loopback only; do not expose it publicly.

## Your portable data folder

```text
Folio Data/
├── workspace.json       # Current resumes, profile, and application history
├── originals/           # Original uploaded PDF, DOCX, and TXT files
├── history/             # Complete workspace snapshot for every successful save
└── README.txt           # Backup and recovery instructions
```

**To move computers or operating systems:** close Folio, copy this ENTIRE folder
(including all subfolders), install/run Folio on the new computer, and choose the
copied folder. Original references use portable IDs rather than old absolute paths.
There is no account, browser profile, or cloud service to transfer.

**To survive browser resets:** saved data is read from disk, independently of
browser storage. The last folder location is remembered in the ignored
`.folio-local.json` beside the app source. If you reinstall the app or remove that
pointer, select your existing data folder again. If a drive is unavailable, Folio
reports the problem instead of silently creating a new empty workspace.

Use **Change data folder** to switch workspaces. Existing folders must be empty or
contain a valid Folio workspace. Unrelated nonempty folders are rejected.

## Resume and application history

- PDF, DOCX, TXT uploads (15 MB; PDFs up to 30 pages), pasted text, or blank entries.
- Original uploads are archived without changing their bytes. Different files with
  the same filename remain distinct; identical uploads reuse the same stored bytes.
- View every resume section on one scrollable page. Click contact details, dates,
  individual description bullets, links, or skill chips to copy them.
- Review original extracted text alongside editable contact, experience, education,
  projects, skills, and unclassified text. Give each version a descriptive name.
- Explicit review/save before one-click copying. Download the original from a saved
  resume, or from its application snapshot.
- Log company, role, date, posting URL, status, and notes. A saved application keeps
  an independent resume snapshot, even after the active resume changes or is deleted.
- Shared editable personal profile; authorization answers are entered by the user.

Deleting a resume removes it from the current workspace. Its original file and prior
workspace revisions remain in the data folder; application snapshots also remain.
Deleting private data permanently requires deleting the relevant folder/backups
outside Folio. There is no automatic history pruning in this version.

## Existing browser data and JSON exports

When Folio detects older browser-stored data absent from the selected folder,
**Import browser data** merges it into the folder, preserving existing records and
profile answers. The browser copy is not deleted. Use the same browser/origin where
that old data was saved. Earlier versions did not retain original uploads, so those
files need to be uploaded again if you want them archived.

JSON export/import remains available for structured data and unsaved resume edits.
**A JSON export does not include original file bytes or folder revision history.**
For a complete backup or computer transfer, copy the whole data folder. Imports
that reference originals missing from the destination folder are rejected; restore
the complete folder instead. Imports never silently replace existing matching IDs.

## Save safety and recovery

Saves write a complete revision to `history/`, then atomically replace
`workspace.json`; success is reported only after disk writes finish. A missing or
invalid workspace is never replaced with an empty one. Conflicting saves from stale
tabs are rejected; export unsaved edits before reloading. A short-lived
`.folio-write.lock` prevents two running Folio processes from writing at once.

To recover an older save: close all Folio processes, preserve a copy of the damaged
folder, then copy a valid JSON revision from `history/` over `workspace.json`.
Keep `originals/` intact and reopen the folder. If Folio crashed while saving and
left `.folio-write.lock`, remove that lock only after closing all Folio processes.

This is local persistence, not a separate backup: disk loss or deletion of the
whole folder still loses data. Keep another copy elsewhere. Folder contents and
JSON exports are not encrypted by Folio; treat them as private personal files.

## Parsing limits and development

Parsing uses conservative rules, not an AI model. Company/title order, undated
entries, complex PDF columns, and unfamiliar headings require review. Scanned PDFs
need OCR, which is not included. No missing resume facts or personal answers are
inferred. Browser autofill and cloud sync are future work.

```bash
npm test
npm run build
npm run format:check
```

Tests use synthetic data and temporary folders. See `QA.md` for verified flows,
`cloud.md` for architecture, and `AGENTS.md` / `CLAUDE.md` for agent conventions.
