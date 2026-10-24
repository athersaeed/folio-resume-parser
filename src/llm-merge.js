// Combine an AI parse with the rules parse. Contact details, raw text, and notes
// always come from the local rules parser; the model never sees them.
import { blankEntry, ENTRY_FIELDS } from "./parser.js";

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
    "Contact details come from the local parser; they were masked before sending.",
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
