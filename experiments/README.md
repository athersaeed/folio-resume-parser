# LLM parsing comparison (OpenRouter)

Standalone experiment. The app still imports with `src/parser.js`; nothing here
is wired into the UI yet.

## Setup

1. Create a key at openrouter.ai and add a few dollars of credit (a full
   practice run costs well under one cent).
2. In OpenRouter privacy settings, disable training on your data.
3. `cp .env.example .env` and paste the key into `.env` (git-ignored), or
   `export OPENROUTER_API_KEY=...` in your terminal.

## Run

```bash
npm run compare:llm
```

Runs every model in `llm-models.json` on the 30 practice blocks (60 fields) and the
rules parser on the same blocks. Reports go to `experiments/results/llm-practice-*`
(git-ignored): `summary.md` for the table, `report.json` for every raw answer.

Useful flags: `--models a,b` for a subset, `--concurrency 2` if rate-limited,
`--privacy standard` to allow non-ZDR endpoints (still `data_collection: deny`)
when a model has no zero-retention provider.

## How each resume is handled

`server/llm-parse.js`: lines before the first section heading are removed, and
emails, phones, and LinkedIn URLs are replaced with placeholders. One call returns
the full resume as strict JSON Schema output. Any value that is not verbatim text
from what the model saw is dropped and counted as "ungrounded". The prompt and
schema hash is recorded in every report so runs are comparable.

## Held-out discipline

Tune prompts and model choices only on the practice split. When you have a
top two or three, score them once:

```bash
npm run compare:llm -- --split heldout --models a,b,c
```

The script verifies `resume-heldout.json` against its frozen hash and refuses a
second held-out run unless `--allow-heldout-rerun` is passed. After that run, the
held-out set is development data; write a new one for the next round.

## Archived results

- [2026-10-24 LLM comparison](reports/2026-10-24-llm-comparison/README.md):
  practice fragments and 10 full-length benchmark PDFs. Gemma-4-26b best overall.
