import { test } from "node:test";
import assert from "node:assert/strict";
import { likelyName, redactContact } from "../server/redact.js";

// Shaped like the benchmark CV that leaked: photo box, unrecognized German
// headings, labeled personal data, and a long block before a known heading.
const germanCv = `Lichtbild
(Bewerbungsfoto)
Jonas Beispiel
Software Architect
Address:   Lindenallee 12, 10115 Berlin, Germany
Phone:   +49 30 555 0101
E-Mail:   jonas@example.test
Persönliche Daten (Personal Data)
Date of Birth:   1. Mai 1986, Berlin
Nationality:   German
Marital Status:   Married to Lena Beispiel (née Muster)
Children:   2 (born 2016, 2019)
Personalausweis:   DE/XXXXXXXX
Father:   Peter Beispiel (Retired)
Berufserfahrung (Professional Experience)
Senior Software Architect   Feb 2019 – Present
Beispiel Software GmbH, Berlin
• Led migration of 14 services; spring 2020 rollout across Engineering 2021
Publikationen
Beispiel, J. (2022). Event-Driven Integration Patterns.
Technical Skills
Java, Kotlin, SAP BTP`;

test("German-style CV: name, address, and personal data never reach the model", () => {
  const { text, counts } = redactContact(germanCv);
  for (const secret of [
    "Jonas Beispiel",
    "Lindenallee 12",
    "10115 Berlin",
    "555 0101",
    "jonas@example.test",
    "1. Mai 1986",
    "Lena Beispiel",
    "Muster",
    "born 2016",
    "DE/XXXXXXXX",
    "Peter Beispiel",
    "Beispiel, J.",
  ])
    assert.ok(!text.includes(secret), `leaked: ${secret}`);
  assert.ok(counts.NAME >= 2 && counts.PERSONAL >= 7, JSON.stringify(counts));
  // Work content survives, including words that resemble address patterns.
  for (const kept of [
    "Senior Software Architect   Feb 2019 – Present",
    "Beispiel Software GmbH, Berlin",
    "spring 2020 rollout across Engineering 2021",
    "Event-Driven Integration Patterns",
    "Java, Kotlin, SAP BTP",
  ])
    assert.ok(text.includes(kept), `lost: ${kept}`);
});

test("known profile values are masked however they are written", () => {
  const resume = `Sam Rivera
EXPERIENCE
Orbit Labs | Developer
2020 – 2023
• Call S. Rivera's line at 416.555.0199 or (416) 555-0199.
• Papers: Rivera, S. (2021); Rivera, Sam (2022).
• Portfolio at samrivera.example.test/work`;
  const { text } = redactContact(resume, {
    name: "Sam Rivera",
    phone: "+1 416-555-0199",
    website: "samrivera.example.test",
  });
  assert.ok(!/555|Rivera, S|Rivera, Sam|samrivera/.test(text), text);
  assert.ok(text.includes("Orbit Labs | Developer"));
});

test("names are masked as a whole, never as single words that are also skills", () => {
  const resume = `Ruby Chen
EXPERIENCE
Python Solutions Inc. | Senior Software Engineer
2021 – Present
SKILLS
Ruby, Python, Chen-style algorithms`;
  const { text } = redactContact(resume, { name: "Ruby Chen" });
  assert.ok(!text.includes("Ruby Chen"));
  assert.ok(text.includes("Ruby, Python, Chen-style algorithms"));
  assert.ok(text.includes("Python Solutions Inc."));
});

test("job locations and ordinary numbers are not treated as addresses", () => {
  const resume = `EXPERIENCE
Kestrel Networks | Support Technician   Toronto, ON
2018 – 2021
• Supported 10000 Users across 3 teams in the way they preferred
• Moved 12 services to the Main Street office rollout plan`;
  const { text } = redactContact(resume, { location: "Toronto, ON" });
  assert.ok(text.includes("Toronto, ON"));
  assert.ok(text.includes("10000 Users across 3 teams in the way"));
});

test("street and postal patterns cover common formats", () => {
  const header = `Ana Lopez
12 rue de la Paix, 75002 Paris
1600 Amphitheatre Pkwy, Mountain View, CA 94043
Calle Mayor 3, Madrid
45 King St W, Toronto M5H 1J8
EXPERIENCE`;
  const { text } = redactContact(header + "\n" + "x\n".repeat(20));
  for (const secret of [
    "rue de la Paix",
    "75002",
    "Amphitheatre",
    "94043",
    "Calle Mayor 3",
    "King St",
    "M5H 1J8",
  ])
    assert.ok(!text.includes(secret), `leaked: ${secret}`);
});

test("labeled personal-data lines need a real label, not a word inside a name", () => {
  const resume = `EXPERIENCE
Children's Hospital   Toronto
Nurse   2019 – 2022
Kindergarten Teacher   2015 – 2019
Mother Tongue Tutors | Founder`;
  const { text } = redactContact(resume);
  assert.equal(text, resume);
});

test("likely name skips photo boxes, titles, and headings", () => {
  assert.equal(likelyName(germanCv), "Jonas Beispiel");
  assert.equal(likelyName("Senior Data Engineer\nEXPERIENCE"), "");
  assert.equal(
    likelyName("Dr. Ana de la Cruz\nana@example.test"),
    "Dr. Ana de la Cruz",
  );
});

test("name guessing ignores nicknames and pronouns and never picks the city line", () => {
  assert.equal(
    likelyName(
      "Chris “Velocity” Example\nPlatform Lead\nSan Francisco, CA | c@example.test",
    ),
    "Chris Example",
  );
  assert.equal(
    likelyName("Jordan Example (she/her)\nData Scientist\nSan Francisco, CA"),
    "Jordan Example",
  );
  assert.equal(likelyName("PLATFORM ENGINEER\nSan Francisco, CA"), "");
  const { text } = redactContact(
    "Jordan Example (she/her)\nSan Francisco, CA\nEXPERIENCE\nAgile Dynamics, San Francisco, CA   2022 – Present",
    {},
  );
  assert.ok(text.includes("Agile Dynamics, San Francisco, CA"));
});

test("aliases, citation names, and tax IDs from an identity-heavy header", () => {
  const header = `Dr. Ana María de la Prueba-Ejemplo, P.Eng., MBA
(née Muestra) | Professionally known as: Ana Ejemplo
RFC: PREA800101XXX CURP: PREA800101MDFXXX01
Calle Falsa 123, C.P. 11550, CDMX
(dual citizen) Gender: Female Marital Status: Married
LinkedIn: /in/ana-ejemplo
EXPERIENCE
Telmex S.A.B. de C.V. | Junior Engineer
2004 – 2006
PUBLICATIONS
A.M. Prueba-Ejemplo, J. Harrison. “Spectrum Sharing.” 2019.
J. Liu, A. Ejemplo, M. Torres. “Edge ML.” 2021.`;
  const { text } = redactContact(header);
  for (const secret of [
    "Prueba",
    "Ejemplo",
    "Muestra",
    "PREA800101",
    "Calle Falsa",
    "11550",
    "Female",
    "Married",
    "/in/ana",
  ])
    assert.ok(!text.includes(secret), `leaked: ${secret}\n${text}`);
  for (const kept of [
    "Telmex S.A.B. de C.V. | Junior Engineer",
    "J. Harrison",
    "M. Torres",
    "Spectrum Sharing",
  ])
    assert.ok(text.includes(kept), `lost: ${kept}`);
});
