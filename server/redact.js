// Best-effort removal of personal details before resume text leaves the machine.
// The model only needs work, education, projects, and skills; contact fields are
// parsed locally by rules. Layers, strongest first:
//   1. exact values already known locally (Folio profile, rules-parsed contact)
//   2. a short contact header before the first section heading
//   3. labeled personal-data lines (address, birth date, family, IDs) in EN/DE/FR/ES
//   4. email, phone, LinkedIn, street address, and postal code patterns
// Anything none of these recognize is still sent; show the preview before sending.
import { parseResume, sectionHeading } from "../src/parser.js";

const EMAIL = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g;
const PHONE =
  /\+\d{1,3}(?:[ .()-]*\d){6,14}|(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}\b/g;
const LINKEDIN = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s|<>]+/gi;
// Street patterns are case-sensitive so ordinary prose ("in the way") is left alone.
const STREET = new RegExp(
  [
    // 47 Main Street, 1600 Amphitheatre Pkwy
    String.raw`\b\d{1,5}[A-Za-z]?\s+(?:[A-Z][\w'.-]*\s+){0,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Parkway|Pkwy|Terrace|Crescent|Cres|Highway|Hwy)\b\.?`,
    // Kastanienallee 47, Hauptstraße 5a (1–3 digit house numbers, never years)
    String.raw`\b[A-ZÄÖÜ][\wäöüß-]*(?:straße|strasse|str\.|allee|gasse|platz|weg|ufer)\s+\d{1,3}[a-z]?\b`,
    // 12 rue de la Paix, Calle Mayor 3, Avenida Reforma 222
    String.raw`\b\d{1,4},?\s+(?:rue|avenue|boulevard|calle|avenida)\s+(?:[\p{L}'-]+\s?){1,4}`,
    String.raw`\b(?:[Rr]ue|[Cc]alle|[Aa]venida|[Cc]arrera|[Pp]aseo)\s+(?:[\p{L}'-]+\s+){1,4}\d{1,4}\b`,
  ].join("|"),
  "gu",
);
// Postal codes are only matched in the header, where addresses live; elsewhere
// "10000 Users" or "AWS 10000" are ordinary text.
const POSTAL_LINES = 15;
const POSTAL = new RegExp(
  [
    String.raw`\b\d{5}\s+[A-ZÄÖÜ][\wäöüß-]+`, // 10119 Berlin, 75001 Paris
    String.raw`\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b`, // CA 94107
    String.raw`\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b`, // M5V 2T6
    String.raw`\bC\.\s?P\.\s*\d{5}\b`, // C.P. 11550
  ].join("|"),
  "g",
);
const LABELS = [
  "(?:home |mailing |postal )?address",
  "date of birth",
  "birth ?date",
  "d\\.?o\\.?b\\.?",
  "place of birth",
  "birthplace",
  "nationality",
  "citizenship",
  "marital status",
  "family status",
  "children",
  "spouse",
  "father",
  "mother",
  "parents",
  "gender",
  "sex",
  "religion",
  "maiden name",
  "(?:also |professionally )?known as",
  "a\\.?k\\.?a\\.?",
  "passport(?: no\\.?| number)?",
  "id (?:no\\.?|number)",
  "national id",
  "social security(?: number)?",
  "ssn",
  "sin",
  "ni number",
  "tax id",
  "rfc",
  "curp",
  "dni",
  "nie",
  "nif",
  "researchgate",
  "orcid",
  "personalausweis",
  "adresse",
  "anschrift",
  "wohnort",
  "geburtsdatum",
  "geburtsort",
  "staatsangehörigkeit",
  "nationalität",
  "familienstand",
  "kinder",
  "vater",
  "mutter",
  "konfession",
  "date de naissance",
  "lieu de naissance",
  "nationalité",
  "situation familiale",
  "état civil",
  "fecha de nacimiento",
  "lugar de nacimiento",
  "nacionalidad",
  "estado civil",
  "dirección",
  "domicilio",
].join("|");
// Line-start label: a colon within a few characters, or column spacing right after.
const PERSONAL_LABEL = new RegExp(
  `^(\\s*(?:${LABELS})\\b(?:[^:\\n]{0,20}?:|\\s{2,}))(.+)$`,
  "gim",
);
// Mid-line label ("(dual citizen) Gender: Female"): colon form only, up to a "|".
const INLINE_LABEL = new RegExp(
  `((?:^|[\\s|(])(?:${LABELS}):)[^|\\n]+`,
  "gimu",
);
const BIRTH_NAME = /\((?:née|nee|born|geb\.)\s+[^)]+\)/giu;
const LINKEDIN_HANDLE = /(?<![\w.])\/in\/[\w-]+/g;
const TITLE_WORD =
  /\b(?:engineer|developer|architect|manager|analyst|designer|scientist|consultant|director|officer|specialist|coordinator|intern|assistant|lead|head|resume|curriculum|vitae|cv)\b/i;
const PARTICLE =
  "(?:de|del|de la|la|von|van|der|den|da|di|du|dos|y|al|bin|ibn)";
// 2–5 capitalized words with optional particles: "Klaus Müller",
// "Dr. María del Carmen González-Reyes".
const NAME_SHAPE = new RegExp(
  `^(?:(?:Dr|Mr|Ms|Mrs|Prof)\\.?\\s+)?[A-ZÀ-Þ][\\p{L}'’.-]+(?:\\s+(?:${PARTICLE}\\s+)?[A-ZÀ-Þ][\\p{L}'’.-]+){1,4}$`,
  "u",
);

// Lines before the first recognized section heading, capped: the header area.
function headerLines(lines, cap) {
  const first = lines.findIndex((line) => sectionHeading(line));
  return Math.min(first < 0 ? Infinity : first, cap);
}

// Names lead the resume; a photo box or label may come first, a city soon after.
const NAME_LINES = 3;
// Nicknames in quotes and pronouns are dropped: "Chris “Velocity” Nakamura",
// "Jordan Lee (she/her)". Credentials after a comma are ignored: "Jane Doe, MBA".
const cleanNameLine = (line) =>
  line
    .replace(/\s*[“"‘'][^”"’']{1,30}[”"’']\s*/g, " ")
    .replace(/\s*\((?:she|he|they|ze|xe)\/[^)]{1,15}\)/gi, "")
    .split(",")[0]
    .replace(/\s+/g, " ")
    .trim();

// "San Francisco, CA" or "Berlin, Germany": a comma followed by a region code or a
// plain place name marks a location. Credentials ("P.Eng., MBA", "PhD") do not match.
const LOCATION_LINE =
  /,\s*(?:[A-Z]{2}\b|[A-Z][a-z]+(?: [A-Z][a-z]+)*\s*(?:[|•·,]|$))/;

// The first line at the top of the resume shaped like a person's name.
export function likelyName(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return (
    lines
      .slice(0, headerLines(lines, NAME_LINES))
      .filter((l) => !LOCATION_LINE.test(l))
      .map(cleanNameLine)
      .find(
        (l) =>
          l.length <= 60 &&
          NAME_SHAPE.test(l) &&
          !TITLE_WORD.test(l) &&
          !sectionHeading(l),
      ) || ""
  );
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Whitespace-flexible, case-insensitive pattern for a known value.
const literal = (value) =>
  new RegExp(escape(value.trim()).replace(/\s+/g, "\\s+"), "gi");
// Unicode-aware whole-word boundaries (\b is ASCII-only in JavaScript).
const word = (source, flags = "giu") =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`, flags);

// Patterns for one person's name. Never single common tokens, which collide with
// skills and companies (Ruby Chen at Python Solutions). Hyphenated surnames are
// distinctive enough to mask alone.
function namePatterns(name) {
  const parts = name
    .replace(/^(?:Dr|Mr|Ms|Mrs|Prof)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) return [];
  const particles = new RegExp(`^${PARTICLE}$`, "i");
  const given = parts.slice(0, -1).filter((p) => !particles.test(p));
  const last = parts[parts.length - 1];
  const surnames = [last, ...(last.includes("-") ? last.split("-") : [])];
  const initials = String.raw`(?:\p{Lu}\.\s?(?:-\s?)?){1,3}(?:${PARTICLE}\s+)?(?:\p{Lu}\.\s?(?:-\s?)?)*`;
  const patterns = [word(escape(name.trim()).replace(/\s+/g, "\\s+"))];
  for (const surname of surnames) {
    const s = escape(surname);
    // Case-sensitive: \p{Lu} would match lowercase letters under the i flag.
    patterns.push(word(`${initials}${s}`, "gu")); // M.C. González-Reyes, C. Reyes
    for (const g of given) {
      patterns.push(word(`${escape(g)}\\s+${s}`)); // Carmen Reyes
      patterns.push(word(`${s},\\s*${escape(g)}`)); // Reyes, Carmen
      patterns.push(word(`${s},\\s*${escape(g[0])}\\.`)); // Reyes, C.
    }
  }
  if (last.includes("-"))
    patterns.push(word(`(?:\\p{Lu}\\.\\s?-?)?${escape(last)}`, "gu"));
  return patterns;
}

// Matches a known phone number however it is punctuated.
function phonePattern(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return new RegExp("\\+?" + digits.split("").join("[^\\d\\n]{0,3}"), "g");
}

// known: values Folio already holds locally, e.g. the profile
// {name, email, phone, linkedin, website}. Location is deliberately not masked:
// a city also appears as job locations, which the model should keep.
export function redactContact(text, known = {}) {
  const counts = {};
  const mask = (input, pattern, label, replacement = `[${label}]`) =>
    input.replace(pattern, (...args) => {
      counts[label] = (counts[label] || 0) + 1;
      return typeof replacement === "function"
        ? replacement(...args)
        : replacement;
    });

  const parsed = text.trim() ? parseResume(text).contact : {};
  // A known name is reliable; guessing is only for text with no profile behind it.
  const names = [known.name?.trim() || likelyName(text)].filter(Boolean);
  const lines = text.split(/\r?\n/);
  const first = lines.findIndex((line) => sectionHeading(line));
  const before = first > 0 ? lines.slice(0, first).filter((l) => l.trim()) : [];
  const removedHeader = before.length > 0 && before.length <= 12;
  let output = removedHeader
    ? ["[CONTACT DETAILS REMOVED]", ...lines.slice(first)].join("\n")
    : text;
  if (removedHeader) counts.header = before.length;

  for (const name of names)
    for (const pattern of namePatterns(name))
      output = mask(output, pattern, "NAME");
  for (const value of [known.email, parsed.email].filter(Boolean))
    output = mask(output, literal(value), "EMAIL");
  for (const value of [known.phone, parsed.phone].filter(Boolean)) {
    const pattern = phonePattern(value);
    if (pattern) output = mask(output, pattern, "PHONE");
  }
  for (const value of [
    known.linkedin,
    known.website,
    parsed.linkedin,
    parsed.website,
  ].filter((v) => v && v.length > 6))
    output = mask(output, literal(value), "LINK");

  output = mask(
    output,
    PERSONAL_LABEL,
    "PERSONAL",
    (_, label) => `${label} [REMOVED]`,
  );
  output = mask(
    output,
    INLINE_LABEL,
    "PERSONAL",
    (_, label) => `${label} [REMOVED]`,
  );
  output = mask(output, BIRTH_NAME, "NAME");
  output = mask(output, LINKEDIN_HANDLE, "LINK");
  output = mask(output, EMAIL, "EMAIL");
  output = mask(output, LINKEDIN, "LINK");
  output = mask(output, PHONE, "PHONE");
  output = mask(output, STREET, "ADDRESS");
  const top = output.split("\n");
  const limit = headerLines(top, POSTAL_LINES);
  if (limit > 0)
    output = [
      mask(top.slice(0, limit).join("\n"), POSTAL, "ADDRESS"),
      ...top.slice(limit),
    ].join("\n");
  return { text: output, removedHeader, counts };
}
