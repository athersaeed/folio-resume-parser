// Conservative proposals, never authoritative resume facts. Preserve raw text.
export const SCHEMA_VERSION = 1;
export const CONTACT_FIELDS = [
  "name",
  "email",
  "phone",
  "location",
  "linkedin",
  "website",
];
export const ENTRY_FIELDS = {
  experience: [
    "company",
    "title",
    "location",
    "startDate",
    "endDate",
    "description",
  ],
  education: [
    "school",
    "degree",
    "fieldOfStudy",
    "location",
    "startDate",
    "endDate",
    "description",
  ],
  projects: ["name", "url", "description"],
};
export const LABELS = {
  name: "Full name",
  email: "Email address",
  phone: "Phone number",
  location: "Location",
  linkedin: "LinkedIn",
  website: "Website / portfolio",
  company: "Company",
  title: "Job title",
  startDate: "Start date",
  endDate: "End date",
  description: "Description",
  school: "School",
  degree: "Degree",
  fieldOfStudy: "Field of study",
  url: "Project URL",
};
export function blankEntry(section) {
  return {
    id: crypto.randomUUID(),
    ...Object.fromEntries(ENTRY_FIELDS[section].map((key) => [key, ""])),
  };
}
export function blankResume() {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: crypto.randomUUID(),
    name: "Untitled resume",
    filename: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reviewed: false,
    contact: Object.fromEntries(CONTACT_FIELDS.map((k) => [k, ""])),
    experience: [],
    education: [],
    projects: [],
    skills: "",
    notes: "",
    rawText: "",
    warnings: [],
  };
}
const headings = {
  experience:
    /^(?:(?:professional|work|relevant|employment|freelance)\s+)?(?:experience|employment history|work history)$/i,
  education: /^(?:education|academic background|academic qualifications)$/i,
  projects:
    /^(?:(?:personal|selected|academic|independent|technical)\s+)?projects$/i,
  skills:
    /^(?:(?:technical|core|professional)\s+)?(?:skills|competencies|technologies)(?:\s*(?:&|and)\s*(?:tools|technologies))?$/i,
  notes:
    /^(?:summary|profile|objective|certifications?|awards|publications|volunteering|volunteer experience|interests|languages|leadership|activities)$/i,
};
const datePart =
  "(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?\\s+\\d{4}|\\d{1,2}[/.-]\\d{4}|(?:19|20)\\d{2}|Present|Current|Now)";
const dateRange = new RegExp(
  `(${datePart})\\s*(?:[-–—]|to)\\s*(${datePart})`,
  "i",
);
const bullet = /^[•●▪◦*\-–]\s*/;
const degree =
  /\b(bachelor|master|doctor|diploma|certificate|b\.?\s?s\.?c?\.?|m\.?\s?s\.?c?\.?|b\.?a\.?|ph\.?d\.?)\b/i;
function splitHeader(line) {
  return line
    .split(/\s+[|•]\s+|\t+|\s{3,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}
export function parseResume(text, filename = "Resume.txt") {
  if (typeof text !== "string" || !text.trim())
    throw new Error(
      "No readable text found. Try a text-based PDF, DOCX, or paste your resume text.",
    );
  const resume = blankResume();
  resume.rawText = text;
  resume.filename = filename;
  resume.name = filename.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const sections = {
    contact: [],
    experience: [],
    education: [],
    projects: [],
    skills: [],
    notes: [],
  };
  let active = "contact";
  for (const line of lines) {
    const heading = line.replace(/:$/, "").trim();
    const section = Object.keys(headings).find((k) =>
      headings[k].test(heading),
    );
    if (section) {
      active = section;
      if (section === "notes") sections.notes.push(line);
    } else sections[active].push(line);
  }
  const header = sections.contact.join("\n");
  resume.contact.email =
    header.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] || "";
  resume.contact.phone =
    header.match(
      /(?:\+\d{1,3}[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}\b/,
    )?.[0] || "";
  const urls =
    header.match(
      /(?:https?:\/\/|www\.)[^\s|<>]+|(?:linkedin\.com|github\.com)\/[^\s|<>]+/gi,
    ) || [];
  resume.contact.linkedin = urls.find((u) => /linkedin\.com/i.test(u)) || "";
  resume.contact.website = urls.find((u) => !/linkedin\.com/i.test(u)) || "";
  const possibleName = sections.contact[0];
  if (
    possibleName &&
    possibleName.length < 85 &&
    !/@|https?:|\d{3}/.test(possibleName)
  )
    resume.contact.name = possibleName;
  // Location is deliberately left blank: header ordering is not a reliable signal.
  const remainingHeader = sections.contact.filter(
    (l) => l !== resume.contact.name,
  );
  for (const section of ["experience", "education"]) {
    const entries = [];
    let pending = [];
    let current = null;
    for (const line of sections[section]) {
      const dates = line.match(dateRange);
      if (dates && !bullet.test(line)) {
        const sameLine = line
          .replace(dates[0], "")
          .replace(/^[\s|,–—-]+|[\s|,–—-]+$/g, "");
        // Preceding non-bullet lines are potential entry headers, not previous bullets.
        const headerLines = [...pending, ...(sameLine ? [sameLine] : [])];
        pending = [];
        current = blankEntry(section);
        current.startDate = dates[1];
        current.endDate = dates[2];
        const parts = headerLines.flatMap(splitHeader);
        if (section === "experience") {
          current.company = parts[0] || "";
          current.title = parts[1] || "";
          current.description = parts.slice(2).join("\n");
        } else {
          const degreeIndex = parts.findIndex((p) => degree.test(p));
          current.school = parts.filter((_, i) => i !== degreeIndex)[0] || "";
          current.degree = degreeIndex >= 0 ? parts[degreeIndex] : "";
          current.description = parts
            .filter((p) => p !== current.school && p !== current.degree)
            .join("\n");
        }
        entries.push(current);
      } else if (bullet.test(line)) {
        if (current) {
          current.description = [current.description, ...pending, line]
            .filter(Boolean)
            .join("\n");
          pending = [];
        } else pending.push(line);
      } else pending.push(line);
    }
    if (pending.length) {
      if (current)
        current.description = [current.description, ...pending]
          .filter(Boolean)
          .join("\n");
      else {
        const entry = blankEntry(section);
        entry.description = pending.join("\n");
        entries.push(entry);
      }
    }
    resume[section] = entries;
  }
  if (sections.projects.length) {
    // No reliable boundaries for undated projects: retain as one editable source block.
    const entry = blankEntry("projects");
    entry.description = sections.projects.join("\n");
    resume.projects = [entry];
  }
  resume.skills = sections.skills.join("\n");
  resume.notes = [
    remainingHeader.length
      ? "Header details (check location and additional links):\n" +
        remainingHeader.join("\n")
      : "",
    ...sections.notes,
  ]
    .filter(Boolean)
    .join("\n\n");
  resume.warnings = [
    "Review every field against the source before saving. Company and title order can differ between resumes.",
    "Dates retain the source wording. Missing days, locations, and profile answers are never inferred.",
  ];
  if (!resume.experience.length && !resume.education.length)
    resume.warnings.push(
      "No dated experience or education entries detected. Add entries manually using the source text.",
    );
  if (resume.projects.length)
    resume.warnings.push(
      "Project text is retained together. Split it into separate projects if needed.",
    );
  return resume;
}
