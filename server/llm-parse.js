// Optional LLM resume parsing through OpenRouter. Server-side only: the API key
// never reaches the browser. Output is a proposal; every value must be an exact
// substring of the text the model saw, or it is dropped and reported.
import { createHash } from "node:crypto";
import { ENTRY_FIELDS } from "../src/parser.js";
import { redactContact } from "./redact.js";

export { redactContact };

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Best full-resume result in the 2026-10-24 comparison. OPENROUTER_MODEL overrides
// the model ID (with that provider's default reasoning settings).
export const DEFAULT_MODEL = {
  id: "google/gemma-4-26b-a4b-it",
  reasoning: { enabled: false },
};
export function configuredModel() {
  const id = process.env.OPENROUTER_MODEL?.trim();
  return id && id !== DEFAULT_MODEL.id ? { id } : DEFAULT_MODEL;
}

export const SYSTEM_PROMPT = `You extract the structure of a resume into JSON.
Copy every value exactly as it appears in the resume text: same spelling,
capitalization, punctuation, and abbreviations. Never rephrase, translate,
expand, correct, or infer anything. Use "" for any field the resume does not state.
List entries in the order they appear. Do not include field labels such as
"Company:" or "Demo:" inside values.
- experience: company is the employer organization; title is the position held.
- education: school is the institution; degree is the qualification as written;
  fieldOfStudy only when it is written separately from the degree.
- projects: name is only the project's name, not its description; url is the
  project's link exactly as written.
- startDate/endDate: copy the source wording, e.g. "Jan 2023" or "Present".
- description: the entry's detail lines copied verbatim, one per line.
- skills: the skills section copied verbatim.
Placeholders such as [EMAIL] mark removed contact details; ignore them.`;

const FIELD_HINTS = {
  company: "Employer organization, copied exactly",
  title: "Job title held, copied exactly",
  school: "Institution attended, copied exactly",
  degree: "Qualification as written, copied exactly",
  fieldOfStudy: "Field of study only if written separately from the degree",
  name: "Project name only, copied exactly",
  url: "Project link exactly as written",
  location: "Location as written",
  startDate: "Start date as written",
  endDate: "End date as written, e.g. Present",
  description: "Detail lines copied verbatim, one per line",
};

function entrySchema(section) {
  const properties = Object.fromEntries(
    ENTRY_FIELDS[section].map((field) => [
      field,
      { type: "string", description: FIELD_HINTS[field] },
    ]),
  );
  return {
    type: "array",
    items: {
      type: "object",
      properties,
      required: ENTRY_FIELDS[section],
      additionalProperties: false,
    },
  };
}

export const RESUME_SCHEMA = {
  type: "object",
  properties: {
    experience: entrySchema("experience"),
    education: entrySchema("education"),
    projects: entrySchema("projects"),
    skills: { type: "string", description: "Skills section, verbatim" },
  },
  required: ["experience", "education", "projects", "skills"],
  additionalProperties: false,
};

export const PROMPT_SHA256 = createHash("sha256")
  .update(SYSTEM_PROMPT + JSON.stringify(RESUME_SCHEMA))
  .digest("hex");

// reasoning: per-model setting, e.g. {effort: "none"} or {effort: "low"} for
// models where reasoning is mandatory. Omitted for non-reasoning models.
// temperature: null omits it, for models whose providers reject the parameter.
export function buildRequest({
  model,
  text,
  reasoning,
  privacy = "strict",
  temperature = 0,
}) {
  return {
    model,
    ...(temperature === null ? {} : { temperature }),
    max_tokens: 4000,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Resume text:\n<<<\n${text}\n>>>` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "resume", strict: true, schema: RESUME_SCHEMA },
    },
    provider: {
      require_parameters: true,
      data_collection: "deny",
      ...(privacy === "strict" ? { zdr: true } : {}),
    },
    ...(reasoning ? { reasoning: { ...reasoning, exclude: true } } : {}),
  };
}

export function parseContent(content) {
  if (typeof content !== "string" || !content.trim())
    throw new Error("Empty model response");
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const data = JSON.parse(cleaned);
  if (!data || typeof data !== "object")
    throw new Error("Response is not an object");
  return data;
}

const collapse = (text) => text.replace(/\s+/g, " ").trim();
// PDF text wraps lines and hyphenates words; a model rejoining them is still
// copying the source. Only whitespace and hyphen differences are forgiven.
const unhyphen = (text) => collapse(text).replace(/- ?/g, "");
function sourceVariants(source) {
  return {
    plain: collapse(source),
    unhyphenated: unhyphen(source),
  };
}

function grounded(value, variants) {
  if (!value) return true;
  return value
    .split("\n")
    .map(collapse)
    .filter(Boolean)
    .every(
      (line) =>
        variants.plain.includes(line) ||
        variants.unhyphenated.includes(unhyphen(line)),
    );
}

// Keeps only values found verbatim in the source; reports every dropped value.
export function groundResume(data, source) {
  const rejected = [];
  const variants = sourceVariants(source);
  const check = (path, value) => {
    const text = typeof value === "string" ? value.trim() : "";
    if (grounded(text, variants)) return text;
    rejected.push({ path, value: text });
    return "";
  };
  const resume = {};
  for (const section of Object.keys(ENTRY_FIELDS)) {
    const entries = Array.isArray(data[section]) ? data[section] : [];
    resume[section] = entries.map((entry, index) =>
      Object.fromEntries(
        ENTRY_FIELDS[section].map((field) => [
          field,
          check(`${section}[${index}].${field}`, entry?.[field]),
        ]),
      ),
    );
  }
  resume.skills = check("skills", data.skills);
  return { resume, rejected };
}

export async function callOpenRouter(
  body,
  { apiKey, fetchImpl = fetch, timeoutMs = 90000 },
) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    const started = performance.now();
    try {
      const response = await fetchImpl(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "Folio resume parser",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(
          `HTTP ${response.status}: ${payload?.error?.message || ""}`,
        );
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (!response.ok)
        throw Object.assign(
          new Error(
            `HTTP ${response.status}: ${payload?.error?.message || "request failed"}`,
          ),
          { permanent: true },
        );
      return { payload, ms: performance.now() - started };
    } catch (error) {
      if (error.permanent) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

// Full pipeline for one resume text: redact, call, parse, ground. An empty or
// malformed reply is retried once; usage and cost cover every attempt.
export async function llmParse(
  text,
  {
    model,
    reasoning,
    privacy,
    temperature,
    apiKey,
    fetchImpl,
    attempts = 2,
    known = {},
  },
) {
  // known: contact values Folio already holds (profile), masked everywhere.
  const redacted = redactContact(text, known);
  const body = buildRequest({
    model,
    text: redacted.text,
    reasoning,
    privacy,
    temperature,
  });
  const usage = { cost: 0, prompt_tokens: 0, completion_tokens: 0 };
  let ms = 0;
  for (let attempt = 1; ; attempt++) {
    const result = await callOpenRouter(body, { apiKey, fetchImpl });
    const { payload } = result;
    ms += result.ms;
    for (const key of Object.keys(usage))
      usage[key] += Number(payload.usage?.[key]) || 0;
    const choice = payload.choices?.[0];
    let raw;
    try {
      raw = parseContent(choice?.message?.content);
    } catch (error) {
      if (attempt < attempts) continue;
      throw Object.assign(new Error(`Invalid output: ${error.message}`), {
        kind: "invalid_output",
        finishReason: choice?.finish_reason || "",
        attempts: attempt,
        usage,
        ms,
      });
    }
    const { resume, rejected } = groundResume(raw, redacted.text);
    return {
      raw,
      resume,
      rejected,
      redactions: redacted.counts,
      ms,
      attempts: attempt,
      provider: payload.provider || "",
      finishReason: choice?.finish_reason || "",
      usage,
    };
  }
}
