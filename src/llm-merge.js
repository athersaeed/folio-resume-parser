// Combine an AI parse with the rules parse. Raw text and notes always come from
// the local rules parser. Contact details do too, unless the user chose full mode,
// where the model's source-checked contact values fill in.
import { blankEntry, CONTACT_FIELDS, ENTRY_FIELDS } from "./parser.js";

const SECTIONS = Object.keys(ENTRY_FIELDS);

export function mergeLlmResume(rules, ai) {
  const kept = [];
  const merged = { ...rules };
  for (const section of SECTIONS) {
    const entries = Array.isArray(ai.resume?.[section])
      ? ai.resume[section]
      : [];
    // An empty AI section next to rules entries is more likely a model miss than a
    // resume without that section; keep the rules entries for review.
    if (!entries.length && rules[section].length) {
      kept.push(section);
      continue;
    }
    merged[section] = entries.map((entry) => ({
      ...blankEntry(section),
      ...Object.fromEntries(
        ENTRY_FIELDS[section].map((field) => [
          field,
          String(entry[field] || ""),
        ]),
      ),
    }));
  }
  merged.skills = ai.resume?.skills || rules.skills;
  const full = Boolean(ai.resume?.contact);
  if (full)
    merged.contact = Object.fromEntries(
      CONTACT_FIELDS.map((field) => [
        field,
        ai.resume.contact[field] || rules.contact[field],
      ]),
    );
  merged.warnings = [
    `Parsed with AI (${ai.model}). Every value was checked against your resume text` +
      (ai.rejected
        ? `; ${ai.rejected} value${ai.rejected === 1 ? "" : "s"} that did not match were left blank.`
        : ".") +
      " Review each field before saving.",
    ...(kept.length
      ? [
          `The AI returned no ${kept.join(" or ")} entries, so those come from the rules parser.`,
        ]
      : []),
    full
      ? "Full mode: the whole resume was sent, and contact details came from the AI where it found them."
      : "Contact details come from the local parser; they were masked before sending.",
    ...rules.warnings.slice(1),
  ];
  return merged;
}

// Values masked everywhere before sending. The name comes only from the saved
// profile: a wrong rules guess (a photo caption, a title) would override the
// redactor's own name detection. Other contact fields fall back to the rules parse.
export function knownContact(profile = {}, contact = {}) {
  const known = {};
  for (const key of ["name", "email", "phone", "linkedin", "website"]) {
    const value = (
      profile[key] ||
      (key === "name" ? "" : contact[key]) ||
      ""
    ).trim();
    if (value) known[key] = value;
  }
  return known;
}
