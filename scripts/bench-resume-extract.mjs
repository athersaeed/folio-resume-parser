// Score the rules parser and OpenRouter models on ResumeExtractBench's typed PDFs.
//   npm run bench:resume -- --models a,b,c
// Expects the dataset in benchmarks/resume-extract-bench (git-ignored): test.jsonl
// plus pdfs/. Scanned handwritten resumes are skipped; Folio has no OCR.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseResume } from "../src/parser.js";
import { pageText } from "../src/pdf-text.js";
import { llmParse, PROMPT_SHA256 } from "../server/llm-parse.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bench = path.join(root, "benchmarks/resume-extract-bench");

async function pdfText(file) {
  const task = pdfjs.getDocument({
    data: new Uint8Array(readFileSync(file)),
    isEvalSupported: false,
    enableScripting: false,
  });
  const pdf = await task.promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++)
    pages.push(pageText((await (await pdf.getPage(n)).getTextContent()).items));
  await task.destroy();
  return pages.join("\n\n");
}

const norm = (s) =>
  (s || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”"‘’']/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:()\-–—]+|[\s.,;:()\-–—]+$/g, "");
const tokens = (s) =>
  new Set(
    norm(s)
      .split(/[^\p{L}\p{N}#+]+/u)
      .filter(Boolean),
  );
function similarity(a, b) {
  const x = norm(a),
    y = norm(b);
  if (!x || !y) return x === y ? 1 : 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.9;
  const [p, q] = [tokens(a), tokens(b)];
  const shared = [...p].filter((t) => q.has(t)).length;
  return shared / (p.size + q.size - shared || 1);
}
// Lenient field match: normalized equality, containment, or 75% token overlap.
const fieldOk = (pred, gt) => similarity(pred, gt) >= 0.75;

const SECTIONS = {
  experience: { gt: ["company", "position"], ours: ["company", "title"] },
  education: { gt: ["institution", "studyType"], ours: ["school", "degree"] },
  projects: { gt: ["name"], ours: ["name"] },
};

// Greedy one-to-one alignment on mean key-field similarity (threshold 0.5).
function align(section, predicted, truth) {
  const { gt, ours } = SECTIONS[section];
  const pairs = [];
  truth.forEach((t, i) =>
    predicted.forEach((p, j) => {
      const score =
        gt.reduce((n, key, k) => n + similarity(p[ours[k]], t[key]), 0) /
        gt.length;
      if (score >= 0.5) pairs.push({ i, j, score });
    }),
  );
  pairs.sort((a, b) => b.score - a.score);
  const usedT = new Set(),
    usedP = new Set(),
    matches = [];
  for (const pair of pairs) {
    if (usedT.has(pair.i) || usedP.has(pair.j)) continue;
    usedT.add(pair.i);
    usedP.add(pair.j);
    matches.push(pair);
  }
  const fields = truth.flatMap((t, i) => {
    const match = matches.find((m) => m.i === i);
    return gt.map((key, k) => ({
      field: `${section}.${ours[k]}`,
      expected: t[key] || "",
      got: match ? predicted[match.j][ours[k]] || "" : "",
      ok: match ? fieldOk(predicted[match.j][ours[k]], t[key]) : !t[key],
    }));
  });
  return {
    truth: truth.length,
    predicted: predicted.length,
    matched: matches.length,
    extra: predicted
      .filter((_, j) => !usedP.has(j))
      .map((p) => ours.map((k) => p[k]).join(" | ")),
    fields,
  };
}

function score(resume, truth) {
  const sections = Object.fromEntries(
    Object.keys(SECTIONS).map((s) => [
      s,
      align(s, resume?.[s] || [], truth[s] || []),
    ]),
  );
  const fields = Object.values(sections).flatMap((s) => s.fields);
  const extra = Object.values(sections).reduce((n, s) => n + s.extra.length, 0);
  return {
    correct: fields.filter((f) => f.ok).length,
    fields: fields.length,
    extra,
    pass: fields.every((f) => f.ok) && extra === 0,
    sections,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const models = (argv[argv.indexOf("--models") + 1] || "")
    .split(",")
    .filter(Boolean);
  if (!argv.includes("--models") || !models.length)
    throw new Error("Pass --models a,b,c");
  try {
    process.loadEnvFile(path.join(root, ".env"));
  } catch {}
  const configs = JSON.parse(
    readFileSync(path.join(root, "experiments/llm-models.json"), "utf8"),
  );
  const cases = readFileSync(path.join(bench, "test.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((c) => c.source !== "expert-handwritten");
  const textDir = path.join(bench, "text");
  mkdirSync(textDir, { recursive: true });
  for (const c of cases) {
    c.text = await pdfText(path.join(bench, c.files.pdf));
    writeFileSync(path.join(textDir, `${c.resume_id}.txt`), c.text);
  }
  console.log(
    `${cases.length} typed resumes extracted (text saved for inspection)`,
  );

  const results = {
    rules: cases.map((c) => ({
      id: c.resume_id,
      ...score(parseResume(c.text), c.ground_truth),
    })),
  };
  const tasks = models.flatMap((id) => cases.map((c) => ({ id, c })));
  const runs = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < tasks.length) {
        const { id, c } = tasks[next++];
        const config = configs.find((m) => m.id === id) || {};
        try {
          const out = await llmParse(c.text, {
            model: id,
            reasoning: config.reasoning,
            temperature: config.temperature,
            apiKey: process.env.OPENROUTER_API_KEY,
          });
          runs.push({
            model: id,
            id: c.resume_id,
            ...out,
            score: score(out.resume, c.ground_truth),
          });
        } catch (error) {
          runs.push({
            model: id,
            id: c.resume_id,
            error: error.message,
            usage: error.usage,
            score: score(null, c.ground_truth),
          });
        }
        process.stdout.write(".");
      }
    }),
  );
  console.log();
  for (const id of models)
    results[id] = cases.map((c) => {
      const run = runs.find((r) => r.model === id && r.id === c.resume_id);
      return {
        id: c.resume_id,
        ...run.score,
        error: run.error,
        rejected: run.rejected?.length || 0,
        ms: run.ms,
        cost: Number(run.usage?.cost) || 0,
      };
    });

  const short = (id) =>
    id
      .replace(/^distractor-/, "")
      .split("-")
      .slice(0, 3)
      .join("-");
  const approaches = Object.keys(results);
  const lines = [
    "# ResumeExtractBench, typed PDFs",
    "",
    `${new Date().toISOString()} · prompt ${PROMPT_SHA256.slice(0, 12)} · lenient field match`,
    "",
    "| Approach | Resumes fully passed | Key fields correct | Extra entries | Ungrounded dropped | Errors | Cost USD |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...approaches.map((a) => {
      const r = results[a];
      const sum = (k) => r.reduce((n, x) => n + (Number(x[k]) || 0), 0);
      return `| ${a} | ${r.filter((x) => x.pass).length}/${r.length} | ${sum("correct")}/${sum("fields")} | ${sum("extra")} | ${sum("rejected")} | ${r.filter((x) => x.error).length} | ${sum("cost").toFixed(4)} |`;
    }),
    "",
    "| Resume | " + approaches.join(" | ") + " |",
    "| --- |" + approaches.map(() => " --- |").join(""),
    ...cases.map(
      (c, i) =>
        `| ${short(c.resume_id)} | ` +
        approaches
          .map((a) => {
            const x = results[a][i];
            return x.error
              ? "error"
              : `${x.pass ? "✅" : "❌"} ${x.correct}/${x.fields}${x.extra ? ` +${x.extra}` : ""}`;
          })
          .join(" | ") +
        " |",
    ),
  ];
  const out = path.join(
    root,
    "experiments/results",
    `bench-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "summary.md"), lines.join("\n") + "\n");
  writeFileSync(
    path.join(out, "report.json"),
    JSON.stringify({ results, runs }, null, 2) + "\n",
  );
  console.log(lines.slice(4).join("\n"));
  console.log(`\nSaved to ${path.relative(root, out)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
