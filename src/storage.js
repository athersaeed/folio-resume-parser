import { SCHEMA_VERSION, CONTACT_FIELDS, ENTRY_FIELDS } from "./parser.js";
export const STORAGE_KEY = "folio.workspace.v1";
export const emptyWorkspace = () => ({
  schemaVersion: SCHEMA_VERSION,
  resumes: [],
  profile: {},
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
  return data;
}
export function readWorkspace(storage = localStorage) {
  const raw = storage.getItem(STORAGE_KEY);
  return raw ? validateWorkspace(JSON.parse(raw)) : emptyWorkspace();
}
export function writeWorkspace(data, storage = localStorage) {
  validateWorkspace(data);
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}
export function mergeWorkspace(current, incoming) {
  validateWorkspace(incoming);
  const resumes = new Map(current.resumes.map((r) => [r.id, r]));
  // Existing records win; an import never silently overwrites subsequent edits.
  for (const r of incoming.resumes)
    if (!resumes.has(r.id)) resumes.set(r.id, r);
  return {
    ...current,
    resumes: [...resumes.values()],
    profile: { ...incoming.profile, ...current.profile },
  };
}
