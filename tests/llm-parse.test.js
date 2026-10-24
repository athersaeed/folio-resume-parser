import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRequest,
  groundResume,
  llmParse,
  parseContent,
  redactContact,
} from "../server/llm-parse.js";

const source = `Alex Example
alex@example.test | (416) 555-0123 | https://linkedin.com/in/alex-example
Toronto, Ontario
WORK EXPERIENCE
Example Labs | Frontend Developer
Jan 2023 – Present
• Built accessible interfaces.
• Contact me at alex@example.test.`;

test("redaction removes the contact header and inline contact details", () => {
  const { text, removedHeader } = redactContact(source);
  assert.equal(removedHeader, true);
  assert.ok(text.startsWith("[CONTACT DETAILS REMOVED]\nWORK EXPERIENCE"));
  for (const secret of [
    "Alex Example",
    "alex@example.test",
    "555-0123",
    "linkedin.com",
    "Toronto",
  ])
    assert.ok(!text.includes(secret), secret);
  assert.ok(text.includes("• Contact me at [EMAIL]."));
});

test("redaction keeps all text when no section heading exists", () => {
  const { text, removedHeader } = redactContact(
    "Alex Example\nwrite to a@b.co",
  );
  assert.equal(removedHeader, false);
  assert.equal(text, "[NAME]\nwrite to [EMAIL]");
});

test("redaction keeps project URLs", () => {
  const { text } = redactContact(
    "PROJECTS\nMoss\nhttps://example.invalid/moss",
  );
  assert.ok(text.includes("https://example.invalid/moss"));
});

test("requests use strict schema, no data collection, and ZDR by default", () => {
  const body = buildRequest({
    model: "m",
    text: "x",
    reasoning: { effort: "none" },
  });
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(body.provider, {
    require_parameters: true,
    data_collection: "deny",
    zdr: true,
  });
  assert.deepEqual(body.reasoning, { effort: "none", exclude: true });
  assert.equal(
    buildRequest({ model: "m", text: "x", privacy: "standard" }).provider.zdr,
    undefined,
  );
  assert.equal(buildRequest({ model: "m", text: "x" }).reasoning, undefined);
});

test("content parsing tolerates code fences and rejects empty output", () => {
  assert.deepEqual(parseContent('```json\n{"skills":""}\n```'), { skills: "" });
  assert.throws(() => parseContent(""));
  assert.throws(() => parseContent("not json"));
});

test("grounding drops values that are not verbatim source text", () => {
  const { resume, rejected } = groundResume(
    {
      experience: [
        {
          company: "Example Labs",
          title: "Senior Frontend Developer",
          location: "",
          startDate: "Jan 2023",
          endDate: "Present",
          description: "• Built accessible interfaces.\nLed a team of ten.",
        },
      ],
      education: [],
      projects: "not an array",
      skills: "",
    },
    source,
  );
  assert.equal(resume.experience[0].company, "Example Labs");
  assert.equal(resume.experience[0].title, "");
  assert.equal(resume.experience[0].description, "");
  assert.deepEqual(resume.projects, []);
  assert.deepEqual(
    rejected.map((r) => r.path),
    ["experience[0].title", "experience[0].description"],
  );
});

test("llmParse sends only redacted text and grounds the reply", async () => {
  let sent;
  const fetchImpl = async (url, init) => {
    sent = JSON.parse(init.body);
    assert.equal(init.headers.Authorization, "Bearer test-key");
    const content = JSON.stringify({
      experience: [
        {
          company: "Example Labs",
          title: "Frontend Developer",
          location: "Toronto, Ontario",
          startDate: "Jan 2023",
          endDate: "Present",
          description: "",
        },
      ],
      education: [],
      projects: [],
      skills: "",
    });
    return new Response(
      JSON.stringify({
        choices: [{ message: { content }, finish_reason: "stop" }],
        usage: { cost: 0.0001 },
      }),
      { status: 200 },
    );
  };
  const result = await llmParse(source, {
    model: "m",
    apiKey: "test-key",
    fetchImpl,
  });
  assert.ok(!sent.messages[1].content.includes("alex@example.test"));
  assert.equal(result.resume.experience[0].title, "Frontend Developer");
  // Location came from the removed header, so it is not grounded in what the model saw.
  assert.equal(result.resume.experience[0].location, "");
  assert.equal(result.rejected[0].path, "experience[0].location");
});

test("llmParse reports invalid output and permanent HTTP errors", async () => {
  const reply = (status, body) => async () =>
    new Response(JSON.stringify(body), { status });
  await assert.rejects(
    llmParse("EXPERIENCE\nx", {
      model: "m",
      apiKey: "k",
      fetchImpl: reply(200, { choices: [{ message: { content: "oops" } }] }),
    }),
    (e) => e.kind === "invalid_output",
  );
  await assert.rejects(
    llmParse("EXPERIENCE\nx", {
      model: "m",
      apiKey: "k",
      fetchImpl: reply(400, { error: { message: "bad model" } }),
    }),
    /HTTP 400: bad model/,
  );
  await assert.rejects(
    llmParse("x", { model: "m", apiKey: "" }),
    /OPENROUTER_API_KEY/,
  );
});

test("temperature can be omitted and empty replies are retried once", async () => {
  assert.equal(
    "temperature" in buildRequest({ model: "m", text: "x", temperature: null }),
    false,
  );
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    const content =
      calls === 1
        ? ""
        : JSON.stringify({
            experience: [],
            education: [],
            projects: [],
            skills: "",
          });
    return new Response(
      JSON.stringify({
        choices: [{ message: { content } }],
        usage: { cost: 0.5 },
      }),
      { status: 200 },
    );
  };
  const result = await llmParse("EXPERIENCE\nx", {
    model: "m",
    apiKey: "k",
    fetchImpl,
  });
  assert.equal(calls, 2);
  assert.equal(result.attempts, 2);
  assert.equal(result.usage.cost, 1);
});

test("redaction keeps resumes whose headings the parser does not recognize", () => {
  const body = Array.from(
    { length: 20 },
    (_, i) => `Line ${i} of experience`,
  ).join("\n");
  const text = `Klaus Example\nPhone: +49 30 555 8247\nBerufserfahrung\n${body}\nTechnical Skills\nJava`;
  const { text: sent, removedHeader } = redactContact(text);
  assert.equal(removedHeader, false);
  assert.ok(sent.startsWith("[NAME]\nPhone: [PHONE]\nBerufserfahrung"));
  assert.ok(sent.includes("Line 19 of experience"));
});

test("grounding forgives PDF line wraps and hyphenation, nothing else", () => {
  const source =
    "EXPERIENCE\nLed migration, reducing in-\nfrastructure costs\nand on-\nprem servers";
  const { resume, rejected } = groundResume(
    {
      experience: [
        {
          company: "",
          title: "",
          location: "",
          startDate: "",
          endDate: "",
          description:
            "Led migration, reducing infrastructure costs and on-prem servers",
        },
        {
          company: "",
          title: "",
          location: "",
          startDate: "",
          endDate: "",
          description: "Led migration, cutting infrastructure costs",
        },
      ],
      education: [],
      projects: [],
      skills: "",
    },
    source,
  );
  assert.ok(resume.experience[0].description);
  assert.equal(resume.experience[1].description, "");
  assert.equal(rejected.length, 1);
});

test("full mode sends unmasked text, asks for contact, and still grounds it", async () => {
  let sent;
  const fetchImpl = async (url, init) => {
    sent = JSON.parse(init.body);
    const content = JSON.stringify({
      contact: {
        name: "Alex Example",
        email: "alex@example.test",
        phone: "(416) 555-0123",
        location: "Toronto, Ontario",
        linkedin: "https://linkedin.com/in/alex-example",
        website: "alex.example.dev",
      },
      experience: [],
      education: [],
      projects: [],
      skills: "",
    });
    return new Response(
      JSON.stringify({ choices: [{ message: { content } }] }),
      { status: 200 },
    );
  };
  const result = await llmParse(source, {
    model: "m",
    apiKey: "k",
    fetchImpl,
    redact: false,
  });
  assert.ok(sent.messages[1].content.includes("alex@example.test"));
  assert.ok(
    sent.response_format.json_schema.schema.required.includes("contact"),
  );
  assert.match(sent.messages[0].content, /contact: the candidate's own name/);
  assert.equal(result.resume.contact.name, "Alex Example");
  assert.equal(result.resume.contact.website, "");
  assert.deepEqual(
    result.rejected.map((r) => r.path),
    ["contact.website"],
  );
  assert.deepEqual(result.redactions, {});
});
