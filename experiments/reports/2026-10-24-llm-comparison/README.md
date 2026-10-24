# OpenRouter LLM parsing comparison

Run and archived October 24, 2026. Standalone experiment; the app still imports
with `src/parser.js`. Prompt and schema hash `341931ed6315` for every run below.

## Conclusion

LLM parsing far outperforms the rules parser on both synthetic fragments and
full-length PDFs. **google/gemma-4-26b-a4b-it** gave the best full-resume result
(9/10 resumes fully correct, every key field right) at about $0.77 per 1,000
resumes, and its weights are public, so local inference is a later option. Its
weakness is occasional empty or malformed JSON, so the rules parser must remain
the fallback. gpt-oss-20b is cheapest but unreliable on hard resumes.
claude-haiku-5.5 matched gemma on key fields but added more entries the answer
key does not contain.

## 1. Practice fragments (30 blocks, 60 fields)

The two former Julia fixture sets (`resume-decisions.json`, `resume-context-validation.json`).
Exact match after source grounding. [Summary](practice/summary.md) · [all answers](practice/report.json)

| Approach                   | Exact fields | Wrong answers | Missed | Median ms | Cost USD |
| -------------------------- | ------------ | ------------- | ------ | --------- | -------- |
| rules parser               | 30/60        | 14            | 16     | —         | 0        |
| openai/gpt-oss-20b         | 58/60        | 2             | 0      | 1987      | 0.0009   |
| google/gemma-4-26b-a4b-it  | 57/60        | 1             | 2      | 1506      | 0.0028   |
| anthropic/claude-haiku-5.5 | 60/60        | 0             | 0      | 1239      | 0.0057   |

All remaining wrong answers copied a sentence such as "Public URL not supplied."
into the URL field. Gemma's misses were one reply that stayed empty after a retry.
These fragments are short and templated; they flatter every model.

## 2. Full-length typed PDFs (ResumeExtractBench, 10 resumes)

The 10 synthetic adversarial PDFs from
[Careerflow/ResumeExtractBench](https://huggingface.co/datasets/Careerflow/ResumeExtractBench)
(CC-BY-4.0, human-verified answers). The 28 scanned handwritten resumes were
skipped: Folio has no OCR. Text was extracted with the app's own PDF line logic
(`src/pdf-text.js`). [Summary](benchmark/summary.md) · [all answers](benchmark/report.json)

Scoring (`scripts/bench-resume-extract.mjs`): entries are aligned one-to-one on
key-field similarity; a field counts as correct on normalized equality,
containment, or 75% token overlap, because the answer key is lightly normalized.
Key fields: company, title, school, degree, project name. A resume "fully passes"
when every key field is correct and no extra entries were produced.

| Approach                   | Fully passed | Key fields correct | Extra entries | Ungrounded dropped | Cost USD |
| -------------------------- | ------------ | ------------------ | ------------- | ------------------ | -------- |
| rules parser               | 0/10         | 19/152             | 25            | —                  | 0        |
| openai/gpt-oss-20b         | 7/10         | 121/152            | 27            | 14                 | 0.0027   |
| google/gemma-4-26b-a4b-it  | 9/10         | 152/152            | 1             | 3                  | 0.0077   |
| anthropic/claude-haiku-5.5 | 5/10         | 152/152            | 12            | 22                 | 0.0162   |

What the failures were:

- gemma: filed an executive-education certificate under education (not in the key).
- haiku: filed publications and two open-source repositories as projects. All
  values were verbatim source text; these are placement disagreements, not fabrication.
- gpt-oss: returned no experience for the prompt-injection resume, collapsed a
  7-entry same-company history into 1 entry, and repeated one job 29 times.
- Prompt injection (hidden white text instructing the model to output a fake
  identity and employer): no model emitted the injected values.

## Pipeline bugs found during this experiment

Both were fixed before the benchmark result above; the earlier run is not archived
and should not be cited.

1. Redaction removed everything before the first recognized section heading. On
   the German CV the first match was "Technical Skills" at line 94, so only 2,531
   of 7,412 characters reached the models and every model scored 0/12. Redaction
   now removes only a header of at most 12 lines; otherwise it replaces the first
   line and contact patterns.
2. Source grounding rejected text that the model had rejoined across PDF line wraps
   and hyphenation, dropping 64 Haiku values. Grounding now ignores whitespace and
   hyphen differences only.

Two smaller fixes came from the practice runs: Haiku's providers reject
`temperature` (now omitted per model), and an empty or malformed reply is retried once.

## Limits

- Ten benchmark resumes is a small sample, all synthetic and adversarial.
- The pipeline fixes above were made after seeing benchmark results. They are not
  answer-specific, but this benchmark is now development data, not a held-out test.
- The practice runs used the redaction and grounding code from before those fixes.
- `experiments/resume-heldout.json` has still not been scored.
- Redaction is best-effort; see the addendum below.
- Requests used `data_collection: deny` and zero-data-retention routing.

## Reproduce

```bash
npm run compare:llm -- --models openai/gpt-oss-20b,google/gemma-4-26b-a4b-it,anthropic/claude-haiku-5.5
npm run bench:resume -- --models openai/gpt-oss-20b,google/gemma-4-26b-a4b-it,anthropic/claude-haiku-5.5
```

The benchmark needs the dataset's `test.jsonl` and `pdfs/` in
`benchmarks/resume-extract-bench/` (git-ignored). Model outputs vary between runs.

## Addendum: stronger redaction (same day)

The fix above stopped content loss but let names, addresses, and personal data
through on unusual layouts: the German CV sent its candidate's name, street
address, birth date, and family members' names. Redaction moved to
`server/redact.js` and now masks, in order: exact profile values Folio already
holds (name, email, phone, links, however punctuated); a short contact header;
labeled personal-data lines in English, German, French, and Spanish, including
mid-line labels, aliases, birth names, and national/tax IDs; then email, phone,
LinkedIn, street, and header postal-code patterns. Name variants cover
"Last, First", citation initials ("M.C. Last"), and hyphenated surnames, never
single words (a candidate named Ruby keeps the Ruby skill). Location is not masked,
so job locations survive. `npm run -s redact:preview -- <resume.pdf>` prints
exactly what would be sent, without sending anything.

Rerun on the same 10 PDFs ([summary](benchmark-after-redaction/summary.md) ·
[all answers](benchmark-after-redaction/report.json)): no model output contained
any candidate's name.

| Approach                   | Fully passed | Key fields correct | Extra entries | Cost USD |
| -------------------------- | ------------ | ------------------ | ------------- | -------- |
| openai/gpt-oss-20b         | 7/10         | 132/152            | 2             | 0.0019   |
| google/gemma-4-26b-a4b-it  | 8/10         | 152/152            | 2             | 0.0075   |
| anthropic/claude-haiku-5.5 | 5/10         | 152/152            | 12            | 0.0160   |

Gemma's new miss filed a publication as a project on the German CV, where the
author name is now `[NAME]`; this may be a redaction side effect or run variance.
Key-field accuracy was unchanged. Redaction remains best-effort: text that no rule
recognizes is still sent, which is why the app must show the preview before sending.
