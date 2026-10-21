# Architecture and roadmap

## Version 0.2: folder-backed localhost storage

A Vite/React UI connects to a Node localhost storage API in the same process and
origin. `npm run dev`, `npm run preview`, and `npm start` all register that API via
`vite.config.js`. No remote services, credentials, or cloud storage are involved.
PDF.js and fflate/browser XML parsing still extract text in the browser.

`server/folder-store.js` manages a user-selected empty or existing Folio data folder.
`workspace.json` stores a versioned envelope with a revision ID, save time, and the
validated workspace. `history/` retains full prior workspace envelopes, and
`originals/` retains content-addressed uploads. Resume/application file references
contain portable IDs, filenames, and sizes, never source-machine absolute paths.
The ignored checkout-local `.folio-local.json` remembers the chosen location.

Writes are serialized, file contents are flushed before atomic replacement, and
each save verifies the previous revision. A filesystem lock prevents simultaneous
writes by separate processes. Stale tabs and changed folder selections cannot
silently overwrite data. No write success is announced before disk completion.
Originals and history are retained when active records are deleted.

The API accepts loopback Host values, rejects foreign Origin/cross-site requests,
and requires a per-process token for data reads and writes. It is intended for
localhost use only. Browser folder browsing lists directory names; selecting a
folder is explicit. Filesystem permissions are inherited from the user's OS.

`src/folder-client.js` owns API access and revision tracking. `FolderSetup.jsx`
provides setup/switching; `WorkspaceGate` loads disk state before mounting the UI.
`src/storage.js` validates/merges portable structured data and reads legacy browser
storage only for explicit migration. Browser data is never automatically deleted.
JSON exports contain structured records; the full folder is the portable backup.

## Remaining phases

1. More parser fixtures, especially multi-column PDFs and diverse date layouts.
2. Optional user-authorized AI parsing with source grounding and mandatory review.
3. Browser extension with explicit activation and the same structured schema.
4. Workday, then Greenhouse and Ashby adapters with real-form validation.
5. Optional in-app revision recovery and deliberate retention/pruning controls.

Autofill must preserve existing answers, stop on uncertain questions, report partial
fills, and leave submission to the user. Cloud sync/authentication remain deferred.
