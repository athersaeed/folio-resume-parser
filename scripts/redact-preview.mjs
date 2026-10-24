// Show exactly what the LLM would receive for a resume. Runs locally; sends nothing.
//   npm run -s redact:preview -- path/to/resume.pdf
//   npm run -s redact:preview -- resume.txt --profile "/path/to/Folio Data"
// --profile reads the name, email, phone, and links saved in a Folio data folder
// (or "auto" for the folder this checkout last used) and masks them everywhere.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { pageText } from "../src/pdf-text.js";
import { redactContact } from "../server/redact.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readResume(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".txt") return readFileSync(file, "utf8");
  if (extension !== ".pdf")
    throw new Error(
      "Preview supports .pdf and .txt; save a DOCX as PDF or text first.",
    );
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

function readProfile(option) {
  const folder =
    option === "auto"
      ? JSON.parse(readFileSync(path.join(root, ".folio-local.json"), "utf8"))
          .folder
      : option;
  const envelope = JSON.parse(
    readFileSync(path.join(folder, "workspace.json"), "utf8"),
  );
  return envelope.workspace?.profile || {};
}

async function main() {
  const argv = process.argv.slice(2);
  const file = argv.find(
    (a, i) => !a.startsWith("--") && argv[i - 1] !== "--profile",
  );
  if (!file)
    throw new Error(
      "Usage: npm run -s redact:preview -- <resume.pdf|.txt> [--profile auto|<folder>]",
    );
  const profileAt = argv.indexOf("--profile");
  const known = profileAt >= 0 ? readProfile(argv[profileAt + 1]) : {};
  const original = await readResume(file);
  const { text, counts, removedHeader } = redactContact(original, known);
  process.stdout.write(text + "\n");
  const summary = Object.entries(counts)
    .map(([label, n]) => `${label} ×${n}`)
    .join(", ");
  console.error(
    `\n--- ${text.length} of ${original.length} characters would be sent` +
      `${removedHeader ? "; contact header removed" : ""}` +
      `${summary ? `; masked: ${summary}` : "; nothing masked"}` +
      `${profileAt >= 0 ? "" : "\n--- Tip: add --profile auto to mask your saved Folio profile everywhere."}` +
      "\n--- Read the text above before sending: anything not masked would reach the model.",
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
