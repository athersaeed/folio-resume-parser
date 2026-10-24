// Compare OpenRouter models against the rules parser on synthetic fixtures.
//   npm run compare:llm                       practice sets, all models in llm-models.json
//   npm run compare:llm -- --models a,b       a subset
//   npm run compare:llm -- --split heldout --models a,b   one-time held-out scoring
// Reads OPENROUTER_API_KEY from the environment or a local, git-ignored .env.
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseResume } from "../src/parser.js";
import { llmParse, PROMPT_SHA256, SYSTEM_PROMPT } from "../server/llm-parse.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const experiments = path.join(root, "experiments");
const resultsDir = path.join(experiments, "results");

function args() {
  const out = { split: "practice", concurrency: 4, privacy: "strict" };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, "");
    if (key === "allow-heldout-rerun") out.allowHeldoutRerun = true;
    else out[key] = argv[++i];
  }
  out.concurrency = Number(out.concurrency);
  return out;
}

const read = (file) =>
  JSON.parse(readFileSync(path.join(experiments, file), "utf8"));
const sha256 = (file) =>
  createHash("sha256")
    .update(readFileSync(path.join(experiments, file)))
    .digest("hex");

function loadFixtures(split) {
  if (split === "practice")
    return [
      ...read("resume-decisions.json").map((f) => ({ ...f, set: "decisions" })),
      ...read("resume-context-validation.json").map((f) => ({
        ...f,
        set: "validation",
      })),
    ];
  if (split !== "heldout") throw new Error(`Unknown split: ${split}`);
  const manifest = read("resume-heldout.manifest.json");
  if (sha256(manifest.file) !== manifest.sha256)
    throw new Error(
      "Held-out fixtures changed after freezing; refusing to score.",
    );
  return read(manifest.file).map((f) => ({ ...f, set: "heldout" }));
}

function firstValue(resume, field) {
  const [section, key] = field.split(".");
  return (resume?.[section]?.[0]?.[key] ?? "").toString().trim();
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index], index);
      }
    }),
  );
  return results;
}

const quantile = (values, q) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

function summarize(rows, runs) {
  const emitted = rows.filter((r) => r.selected);
  const ms = runs.filter((r) => r.ms).map((r) => r.ms);
  return {
    fields: rows.length,
    correct: rows.filter((r) => r.selected === r.expected).length,
    correctBeforeGrounding: rows.filter((r) => r.raw === r.expected).length,
    wrongNonempty: emitted.filter((r) => r.selected !== r.expected).length,
    missed: rows.filter((r) => r.expected && !r.selected).length,
    rejectedValues: runs.reduce((n, r) => n + (r.rejected?.length || 0), 0),
    invalidOutputs: runs.filter((r) => r.error?.kind === "invalid_output")
      .length,
    requestErrors: runs.filter(
      (r) => r.error && r.error.kind !== "invalid_output",
    ).length,
    medianMs: Math.round(quantile(ms, 0.5)),
    p95Ms: Math.round(quantile(ms, 0.95)),
    costUsd: runs.reduce((n, r) => n + (Number(r.usage?.cost) || 0), 0),
    promptTokens: runs.reduce((n, r) => n + (r.usage?.prompt_tokens || 0), 0),
    completionTokens: runs.reduce(
      (n, r) => n + (r.usage?.completion_tokens || 0),
      0,
    ),
  };
}

async function main() {
  const options = args();
  try {
    process.loadEnvFile(path.join(root, ".env"));
  } catch {}
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error(
      "Set OPENROUTER_API_KEY in your shell or in a .env file (see .env.example).",
    );
    process.exit(1);
  }
  const allModels = read("llm-models.json");
  const wanted = options.models?.split(",").map((s) => s.trim());
  if (options.split === "heldout") {
    if (!wanted)
      throw new Error("Held-out scoring needs an explicit --models list.");
    const previous = existsSync(resultsDir)
      ? readdirSync(resultsDir).filter((d) => d.startsWith("llm-heldout-"))
      : [];
    if (previous.length && !options.allowHeldoutRerun)
      throw new Error(
        `Held-out set already scored (${previous.join(", ")}). It is development data now; ` +
          "write a new held-out set, or pass --allow-heldout-rerun if you understand the result is no longer held-out.",
      );
  }
  const models = wanted
    ? wanted.map((id) => allModels.find((m) => m.id === id) || { id })
    : allModels;
  const fixtures = loadFixtures(options.split);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(resultsDir, `llm-${options.split}-${stamp}`);
  mkdirSync(outDir, { recursive: true });

  const rules = fixtures.map((f) => parseResume(f.text, "Synthetic.txt"));
  const tasks = models.flatMap((model) =>
    fixtures.map((fixture, index) => ({ model, fixture, index })),
  );
  console.log(
    `${fixtures.length} fixtures × ${models.length} models = ${tasks.length} calls ` +
      `(privacy: ${options.privacy}, concurrency: ${options.concurrency})`,
  );
  let done = 0;
  const runs = await pool(
    tasks,
    options.concurrency,
    async ({ model, fixture, index }) => {
      let run;
      try {
        const result = await llmParse(fixture.text, {
          model: model.id,
          reasoning: model.reasoning,
          temperature: model.temperature,
          privacy: options.privacy,
          apiKey,
        });
        run = { model: model.id, fixture: fixture.id, index, ...result };
      } catch (error) {
        run = {
          model: model.id,
          fixture: fixture.id,
          index,
          error: { kind: error.kind || "request", message: error.message },
          ms: error.ms,
          attempts: error.attempts,
          usage: error.usage,
        };
      }
      done++;
      if (done % 10 === 0 || done === tasks.length)
        console.log(`  ${done}/${tasks.length}`);
      return run;
    },
  );

  const approaches = ["rules", ...models.map((m) => m.id)];
  const report = {
    created: new Date().toISOString(),
    split: options.split,
    privacy: options.privacy,
    promptSha256: PROMPT_SHA256,
    systemPrompt: SYSTEM_PROMPT,
    fixtureSha256: Object.fromEntries(
      (options.split === "practice"
        ? ["resume-decisions.json", "resume-context-validation.json"]
        : ["resume-heldout.json"]
      ).map((f) => [f, sha256(f)]),
    ),
    models,
    summaries: {},
    fields: {},
    runs,
  };
  for (const approach of approaches) {
    const modelRuns =
      approach === "rules" ? [] : runs.filter((r) => r.model === approach);
    const rows = fixtures.flatMap((fixture, index) => {
      const run = modelRuns.find((r) => r.index === index);
      return fixture.questions.map((q) => ({
        set: fixture.set,
        fixture: fixture.id,
        field: q.field,
        expected: q.expected,
        selected:
          approach === "rules"
            ? firstValue(rules[index], q.field)
            : firstValue(run?.resume, q.field),
        raw:
          approach === "rules"
            ? firstValue(rules[index], q.field)
            : firstValue(run?.raw, q.field),
      }));
    });
    report.fields[approach] = rows;
    report.summaries[approach] = summarize(rows, modelRuns);
  }
  writeFileSync(
    path.join(outDir, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );

  const header =
    "| Approach | Exact fields | Wrong answers | Missed | Ungrounded dropped | Invalid JSON | Errors | Median ms | Cost USD |";
  const lines = [
    `# LLM comparison: ${options.split}`,
    "",
    `${report.created} · privacy ${options.privacy} · prompt ${PROMPT_SHA256.slice(0, 12)}`,
    "",
    header,
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...approaches.map((a) => {
      const s = report.summaries[a];
      return `| ${a} | ${s.correct}/${s.fields} | ${s.wrongNonempty} | ${s.missed} | ${s.rejectedValues} | ${s.invalidOutputs} | ${s.requestErrors} | ${s.medianMs} | ${s.costUsd.toFixed(5)} |`;
    }),
    "",
    "Wrong answers are emitted values that differ from the expected value. A blank is safer than a wrong answer.",
  ];
  writeFileSync(path.join(outDir, "summary.md"), lines.join("\n") + "\n");
  console.log("\n" + lines.slice(4).join("\n"));
  const failed = runs.filter((r) => r.error);
  if (failed.length) {
    console.log(`\n${failed.length} failed calls; first errors:`);
    for (const r of failed.slice(0, 8))
      console.log(`  ${r.model} ${r.fixture}: ${r.error.message}`);
  }
  console.log(`\nSaved to ${path.relative(root, outDir)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
