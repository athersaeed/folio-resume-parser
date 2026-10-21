# Architecture and roadmap

## Version 1

A local Vite/React application. PDF.js extracts PDF text; fflate and the browser XML parser extract DOCX paragraphs locally.
A deterministic parser proposes structured contact, experience, education,
project, and skill fields. The review screen shows the extracted source alongside
editable fields, and unclassified text is retained. Parsing is approximate;
review is mandatory. Scanned PDFs require OCR outside this version.

Resume versions and a shared personal profile use versioned localStorage on the
current browser origin. No account, server, AI provider, or cloud storage is used.
Clearing browser data removes saved data; JSON backup/export and import provide
portability. Browser storage is not encrypted by this app. No sensitive profile
answer is inferred from a resume.

## Next phases

1. Improve extraction against user-approved resumes, especially multi-column PDFs.
2. Optional user-authorized structured AI parsing, with source grounding and review.
3. Browser extension sharing the structured resume schema; explicit activation.
4. Workday adapter: fill visible fields, add repeatable sections, wait, verify.
5. Greenhouse and Ashby adapters, tested against real employer configurations.

Autofill must preserve existing answers, stop on uncertain questions, report
partial fills, and leave submission to the user. Do not claim platform support
until the complete interaction has been validated.

## Future cloud choices

Cloud sync and authentication are deliberately deferred. If added, define ownership,
export/deletion behavior, encryption, and access boundaries before migrating data.
