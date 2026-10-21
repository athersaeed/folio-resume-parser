import { APPLICATION_STATUSES } from "./applications.js";
import { SCHEMA_VERSION, CONTACT_FIELDS, ENTRY_FIELDS } from "./parser.js";
export const STORAGE_KEY = "folio.workspace.v1";
export const emptyWorkspace = () => ({
  schemaVersion: SCHEMA_VERSION,
  resumes: [],
  profile: {},
  applications: [],
});
export function validateWorkspace(data) {
  if (
    !data ||
    data.schemaVersion !== SCHEMA_VERSION ||
    !Array.isArray(data.resumes) ||
    !data.profile ||
    typeof data.profile !== "object" ||
    Array.isArray(data.profile)
  )
    throw new Error("This is not a supported Folio backup.");
  if (Object.values(data.profile).some((v) => typeof v !== "string"))
    throw new Error("Invalid profile values.");
  const ids = new Set();
  for (const r of data.resumes) {
    if (
      !r ||
      r.schemaVersion !== SCHEMA_VERSION ||
      typeof r.id !== "string" ||
      ids.has(r.id) ||
      typeof r.reviewed !== "boolean" ||
      !r.contact ||
      CONTACT_FIELDS.some((k) => typeof r.contact[k] !== "string")
    )
      throw new Error("Invalid resume in backup.");
    ids.add(r.id);
    for (const k of [
      "name",
      "filename",
      "createdAt",
      "updatedAt",
      "skills",
      "notes",
      "rawText",
    ])
      if (typeof r[k] !== "string") throw new Error("Invalid resume fields.");
    if (
      !Array.isArray(r.warnings) ||
      r.warnings.some((w) => typeof w !== "string")
    )
      throw new Error("Invalid parser warnings.");
    for (const [section, fields] of Object.entries(ENTRY_FIELDS)) {
      if (
        !Array.isArray(r[section]) ||
        r[section].some(
          (e) =>
            !e ||
            typeof e.id !== "string" ||
            fields.some((k) => typeof e[k] !== "string"),
        )
      )
        throw new Error("Invalid resume entries.");
    }
  }
  const applications = data.applications ?? [];
  if (!Array.isArray(applications))
    throw new Error("Invalid application history.");
  const applicationIds = new Set();
  for (const app of applications) {
    if (
      !app ||
      typeof app.id !== "string" ||
      applicationIds.has(app.id) ||
      [
        "company",
        "role",
        "date",
        "status",
        "url",
        "notes",
        "resumeId",
        "createdAt",
      ].some((k) => typeof app[k] !== "string") ||
      !app.company.trim() ||
      !app.role.trim() ||
      !APPLICATION_STATUSES.includes(app.status) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(app.date) ||
      !app.resumeSnapshot?.reviewed ||
      app.resumeSnapshot.id !== app.resumeId
    )
      throw new Error("Invalid application record.");
    if (app.url) {
      let url;
      try {
        url = new URL(app.url);
      } catch {
        throw new Error("Invalid job URL.");
      }
      if (!["https:", "http:"].includes(url.protocol))
        throw new Error("Invalid job URL.");
    }
    validateWorkspace({
      schemaVersion: SCHEMA_VERSION,
      resumes: [app.resumeSnapshot],
      profile: {},
      applications: [],
    });
    applicationIds.add(app.id);
  }
  return { ...data, applications };
}
export function readWorkspace(storage = localStorage) {
  const raw = storage.getItem(STORAGE_KEY);
  return raw ? validateWorkspace(JSON.parse(raw)) : emptyWorkspace();
}
export function writeWorkspace(data, storage = localStorage) {
  const normalized = validateWorkspace(data);
  storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}
export function mergeWorkspace(current, incoming) {
  incoming = validateWorkspace(incoming);
  const resumes = new Map(current.resumes.map((r) => [r.id, r]));
  // Existing records win; an import never silently overwrites subsequent edits.
  for (const r of incoming.resumes)
    if (!resumes.has(r.id)) resumes.set(r.id, r);
  const applications = new Map(
    (current.applications || []).map((a) => [a.id, a]),
  );
  for (const app of incoming.applications)
    if (!applications.has(app.id)) applications.set(app.id, app);
  return {
    ...current,
    applications: [...applications.values()],
    resumes: [...resumes.values()],
    profile: { ...incoming.profile, ...current.profile },
  };
}
