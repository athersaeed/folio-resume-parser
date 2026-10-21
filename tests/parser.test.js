import { test } from "node:test";
import assert from "node:assert/strict";
import { parseResume, blankEntry } from "../src/parser.js";
import {
  readWorkspace,
  writeWorkspace,
  emptyWorkspace,
  mergeWorkspace,
  validateWorkspace,
} from "../src/storage.js";
const source = `Alex Example
alex@example.test | (416) 555-0123 | https://linkedin.com/in/alex-example
Toronto, Ontario
WORK EXPERIENCE
Example Labs | Frontend Developer
Jan 2023 – Present
• Built accessible interfaces.
• Collaborated with designers.
Other Company | Developer
May 2021 - Dec 2022
• Maintained internal tools.
EDUCATION
Example University | Bachelor of Computer Science
2017 - 2021
SKILLS
JavaScript, Python
PROJECTS
Weather application
Built a local forecast dashboard.
CERTIFICATIONS
Example certificate`;
test("extracts distinct dated entries without swallowing the next company", () => {
  const r = parseResume(source, "Frontend.pdf");
  assert.equal(r.experience.length, 2);
  assert.equal(r.experience[0].company, "Example Labs");
  assert.equal(r.experience[1].company, "Other Company");
  assert.equal(r.experience[0].title, "Frontend Developer");
  assert.equal(r.experience[0].endDate, "Present");
  assert.equal(r.experience[1].startDate, "May 2021");
  assert.match(r.experience[0].description, /accessible/);
  assert.doesNotMatch(r.experience[0].description, /Other Company/);
  assert.equal(r.education[0].school, "Example University");
  assert.equal(r.education[0].degree, "Bachelor of Computer Science");
  assert.equal(r.education[0].endDate, "2021");
});
test("retains source and uncertain content without inventing location or authorization", () => {
  const r = parseResume(source);
  assert.equal(r.rawText, source);
  assert.equal(r.reviewed, false);
  assert.equal(r.contact.location, "");
  assert.equal(r.contact.email, "alex@example.test");
  assert.match(r.notes, /Toronto/);
  assert.match(r.notes, /Example certificate/);
  assert.match(r.projects[0].description, /Weather application/);
  assert.equal(r.workAuthorization, undefined);
});
test("handles undated entries and unknown sections without discarding source", () => {
  const r = parseResume(
    "Alex Example\nEXPERIENCE\nUnusual Employer\nEngineer\nBuilt something\nEDUCATION\nSome school",
  );
  assert.equal(r.experience[0].company, "");
  assert.match(r.experience[0].description, /Unusual Employer/);
  assert.equal(r.experience[0].startDate, "");
  assert.equal(r.education[0].school, "");
  assert.match(r.education[0].description, /Some school/);
});
test("rejects empty text and handles CRLF and uppercase headings", () => {
  assert.throws(() => parseResume("   "), /No readable text/);
  const r = parseResume(source.replaceAll("\n", "\r\n"));
  assert.equal(r.experience.length, 2);
});
test("recognizes year and numeric month ranges", () => {
  const r = parseResume(
    "Alex Example\nEXPERIENCE\nCompany | Engineer\n01/2020 to 06/2022\n• Built tools",
  );
  assert.equal(r.experience[0].startDate, "01/2020");
  assert.equal(r.experience[0].endDate, "06/2022");
});
test("storage roundtrip and backup merge preserve existing edits", () => {
  let raw;
  const storage = {
    getItem: () => raw,
    setItem: (_, v) => {
      raw = v;
    },
  };
  assert.deepEqual(readWorkspace(storage), emptyWorkspace());
  const r = parseResume(source);
  const first = {
    ...emptyWorkspace(),
    resumes: [r],
    profile: { email: "old@example.test" },
  };
  writeWorkspace(first, storage);
  assert.deepEqual(readWorkspace(storage), first);
  const incoming = structuredClone(first);
  incoming.resumes[0].name = "Older version";
  incoming.resumes.push({ ...parseResume(source), name: "New resume" });
  incoming.profile.email = "different@example.test";
  const merged = mergeWorkspace(first, incoming);
  assert.equal(merged.resumes.length, 2);
  assert.equal(merged.resumes[0].name, r.name);
  assert.equal(merged.profile.email, "old@example.test");
});
test("rejects malformed and duplicate backups; surfaces storage failures", () => {
  const data = { ...emptyWorkspace(), resumes: [parseResume(source)] };
  assert.throws(() =>
    validateWorkspace({ ...data, resumes: [data.resumes[0], data.resumes[0]] }),
  );
  const invalid = structuredClone(data);
  delete invalid.resumes[0].experience[0].title;
  assert.throws(() => validateWorkspace(invalid));
  assert.throws(
    () =>
      writeWorkspace(data, {
        setItem() {
          throw new Error("Quota exceeded");
        },
      }),
    /Quota/,
  );
  assert.throws(() => readWorkspace({ getItem: () => "{bad json" }));
  assert.throws(() => validateWorkspace({ ...data, profile: { email: 3 } }));
});
test("manual entries expose schema used by future adapters", () => {
  const entry = blankEntry("education");
  assert.equal(entry.fieldOfStudy, "");
  assert.equal(entry.startDate, "");
  assert.ok(entry.id);
});
