# ResumeExtractBench, typed PDFs

2026-10-24T03:43:15.591Z · prompt 341931ed6315 · lenient field match

| Approach | Resumes fully passed | Key fields correct | Extra entries | Ungrounded dropped | Errors | Cost USD |
| --- | --- | --- | --- | --- | --- | --- |
| rules | 0/10 | 19/152 | 25 | 0 | 0 | 0.0000 |
| openai/gpt-oss-20b | 7/10 | 132/152 | 2 | 8 | 0 | 0.0019 |
| google/gemma-4-26b-a4b-it | 8/10 | 152/152 | 2 | 3 | 0 | 0.0075 |
| anthropic/claude-haiku-5.5 | 5/10 | 152/152 | 12 | 34 | 0 | 0.0160 |

| Resume | rules | openai/gpt-oss-20b | google/gemma-4-26b-a4b-it | anthropic/claude-haiku-5.5 |
| --- | --- | --- | --- | --- |
| date-chaos-inconsistent | ❌ 1/21 +4 | ✅ 21/21 | ✅ 21/21 | ✅ 21/21 |
| esoteric-titles-chief | ❌ 0/17 +1 | ❌ 16/17 +1 | ✅ 17/17 | ✅ 17/17 |
| european-regional-format | ❌ 0/12 | ✅ 12/12 | ❌ 12/12 +1 | ❌ 12/12 +3 |
| functional-format-skills | ❌ 4/17 +3 | ✅ 17/17 | ✅ 17/17 | ✅ 17/17 |
| identity-confusion-dr | ❌ 1/18 +4 | ❌ 16/18 +1 | ✅ 18/18 | ❌ 18/18 +6 |
| multilingual-resume-en | ❌ 4/18 +5 | ✅ 18/18 | ✅ 18/18 | ✅ 18/18 |
| prompt-injection-hidden | ❌ 4/17 +4 | ❌ 0/17 | ❌ 17/17 +1 | ❌ 17/17 +1 |
| prose-narrative-third | ❌ 0/8 | ✅ 8/8 | ✅ 8/8 | ❌ 8/8 +1 |
| same-company-repeat | ❌ 5/16 +4 | ✅ 16/16 | ✅ 16/16 | ✅ 16/16 |
| skill-name-collision | ❌ 0/8 | ✅ 8/8 | ✅ 8/8 | ❌ 8/8 +1 |
