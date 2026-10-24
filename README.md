# Folio · Simplify Clone

A local resume workspace: upload multiple resumes, review/edit their fields,
click to copy into applications, and track which resume you used for each job.
All saved data lives in a folder you choose on your computer. Optional AI parsing
through OpenRouter is off by default and never sends anything without your approval.

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

## Optional AI parsing

The built-in parser uses rules. For much better results on real resumes (title
before company, "Title at Company", multi-column PDFs, non-English CVs), Folio can
send resume text to an LLM through [OpenRouter](https://openrouter.ai). This is
opt-in, off by default, and requires your own API key.

**Setup**

1. Create an OpenRouter key, ideally with a small credit limit. In OpenRouter's
   privacy settings, disable training on your data.
2. `cp .env.example .env` and paste the key after `OPENROUTER_API_KEY=`.
   `.env` is git-ignored and read only by the local server; the key is never sent
   to the browser.
3. Restart `npm run dev` (or `npm start`).

**Use**

In **Upload resume**, tick **Parse with AI** and choose what to send:

| Mode                                | What is sent                                                                                                                                 | Contact fields come from |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **Mask personal details** (default) | Resume text with your name, email, phone, links, address, and labeled personal data (birth date, family, IDs, etc.) replaced by placeholders | The local parser         |
| **Send full resume**                | The complete text, unchanged                                                                                                                 | The AI, source-checked   |

Before anything leaves your computer, Folio shows the exact text that will be sent.
Choose **Send & review** or **Use rules parser only**; closing the dialog sends
nothing. Your choices are remembered in this browser.

**How results are handled**

- One request per resume to the default model, `google/gemma-4-26b-a4b-it`
  (about $0.001 per resume). Set `OPENROUTER_MODEL` in `.env` to use another.
- Requests are routed only to providers that do not collect data and offer zero
  data retention.
- Every returned value must appear in your resume text (ignoring line wraps and
  hyphenation); anything else is left blank. The AI cannot add facts that are not
  in your resume.
- The result opens as an unsaved draft for your review, exactly like a rules parse.
  If the request fails, Folio falls back to the rules parse and says so.

Masking is best-effort. Saving your name and contact details in **Personal profile**
makes it far more reliable, because those exact values are masked everywhere, in
any formatting. Unusual layouts can still leave details unmasked, which is why the
preview is always shown. To check a file without the app or an API key:

```bash
npm run -s redact:preview -- path/to/resume.pdf --profile "/path/to/Folio Data"
```

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

Without AI parsing, Folio uses conservative rules. Company/title order, undated
entries, complex PDF columns, and unfamiliar headings require review. With either
parser, scanned PDFs need OCR, which is not included, and no missing resume facts
or personal answers are inferred. Browser autofill and cloud sync are future work.

```bash
npm test
npm run build
npm run format:check
```

Tests use synthetic data and temporary folders, and never call OpenRouter. See
`QA.md` for verified flows, `cloud.md` for architecture, and `AGENTS.md` /
`CLAUDE.md` for agent conventions.

**Parser evaluation.** On 10 full-length benchmark PDFs, the rules parser got 19 of
152 key fields right; Gemma got all 152. Details, caveats, and how the default model
was chosen are in
[experiments/reports/2026-10-24-llm-comparison](experiments/reports/2026-10-24-llm-comparison/README.md).
To compare models yourself (requires a key; costs cents):

```bash
npm run compare:llm -- --models google/gemma-4-26b-a4b-it,anthropic/claude-haiku-5.5
npm run bench:resume -- --models google/gemma-4-26b-a4b-it
```

See [experiments/README.md](experiments/README.md) for setup and the held-out test
protocol.
