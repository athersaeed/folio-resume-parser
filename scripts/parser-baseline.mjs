import { readFileSync } from "node:fs";
import { parseResume } from "../src/parser.js";

const scenarios = JSON.parse(readFileSync(0, "utf8"));
const results = scenarios.map((scenario) => {
  const resume = parseResume(scenario.text, "Synthetic.txt");
  return Object.fromEntries(
    scenario.questions.map((question) => {
      const [section, field] = question.field.split(".");
      const value = Array.isArray(resume[section])
        ? resume[section][0]?.[field] || ""
        : resume[section]?.[field] || "";
      return [question.id, value];
    }),
  );
});
process.stdout.write(JSON.stringify(results));
