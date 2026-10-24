import { test } from "node:test";
import assert from "node:assert/strict";
import { parseResume } from "../src/parser.js";
import { knownContact, mergeLlmResume } from "../src/llm-merge.js";

const text = `Alex Example
alex@example.test | (416) 555-0123
EXPERIENCE
Frontend Developer at Example Labs
Jan 2023 – Present
• Built accessible interfaces.
EDUCATION
Example University | Bachelor of Computer Science
2017 – 2021
SKILLS
JavaScript, Python`;

const ai = {
  model: "test/model",
  rejected: 1,
  resume: {
    experience: [
      {
        company: "Example Labs",
        title: "Frontend Developer",
        location: "",
        startDate: "Jan 2023",
        endDate: "Present",
        description: "• Built accessible interfaces.",
      },
    ],
    education: [],
    projects: [{ name: "Folio", url: "", description: "" }],
    skills: "JavaScript, Python",
  },
};

test("AI sections replace rules sections; contact and raw text stay local", () => {
  const rules = parseResume(text, "Alex.txt");
  const merged = mergeLlmResume(rules, ai);
  assert.equal(merged.experience[0].company, "Example Labs");
  assert.equal(merged.experience[0].title, "Frontend Developer");
  assert.ok(merged.experience[0].id && merged.projects[0].id);
  assert.deepEqual(merged.contact, rules.contact);
  assert.equal(merged.rawText, text);
  assert.equal(merged.id, rules.id);
  assert.match(
    merged.warnings[0],
    /Parsed with AI \(test\/model\).*1 value that did not match/,
  );
});

test("an empty AI section keeps the rules entries and says so", () => {
  const rules = parseResume(text, "Alex.txt");
  const merged = mergeLlmResume(rules, ai);
  assert.equal(merged.education, rules.education);
  assert.ok(merged.warnings.some((w) => /no education entries/.test(w)));
});

test("known contact takes the name only from the saved profile", () => {
  assert.deepEqual(
    knownContact({}, { name: "Lichtbild", email: "a@b.co", phone: "" }),
    { email: "a@b.co" },
  );
  assert.deepEqual(
    knownContact(
      { name: "Klaus Example", phone: "+49 30 1" },
      { name: "Lichtbild" },
    ),
    {
      name: "Klaus Example",
      phone: "+49 30 1",
    },
  );
});
