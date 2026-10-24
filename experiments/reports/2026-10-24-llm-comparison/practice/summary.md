# LLM comparison: practice

2026-10-24T03:07:33.050Z · privacy strict · prompt 341931ed6315

| Approach | Exact fields | Wrong answers | Missed | Ungrounded dropped | Invalid JSON | Errors | Median ms | Cost USD |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rules | 30/60 | 14 | 16 | 0 | 0 | 0 | 0 | 0.00000 |
| openai/gpt-oss-20b | 58/60 | 2 | 0 | 0 | 0 | 0 | 1987 | 0.00090 |
| google/gemma-4-26b-a4b-it | 57/60 | 1 | 2 | 0 | 1 | 0 | 1506 | 0.00275 |
| anthropic/claude-haiku-5.5 | 60/60 | 0 | 0 | 0 | 0 | 0 | 1239 | 0.00571 |

Wrong answers are emitted values that differ from the expected value. A blank is safer than a wrong answer.
