export const APPLICATION_STATUSES = [
  "Preparing",
  "Applied",
  "Interviewing",
  "Offer",
  "Rejected",
  "Withdrawn",
];
export function createApplication(fields, resume) {
  if (!fields.company?.trim() || !fields.role?.trim())
    throw new Error("Enter a company and job title.");
  if (!resume?.reviewed) throw new Error("Choose a reviewed and saved resume.");
  if (!APPLICATION_STATUSES.includes(fields.status))
    throw new Error("Choose a valid application status.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fields.date || "") ||
    Number.isNaN(Date.parse(fields.date + "T00:00:00Z")) ||
    new Date(fields.date + "T00:00:00Z").toISOString().slice(0, 10) !==
      fields.date
  )
    throw new Error("Enter a valid application date.");
  const url = fields.url?.trim() || "";
  if (url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(
        "Enter a full job URL starting with https:// or http://.",
      );
    }
    if (!["https:", "http:"].includes(parsed.protocol))
      throw new Error("Use an https:// or http:// job URL.");
  }
  return {
    id: crypto.randomUUID(),
    company: fields.company.trim(),
    role: fields.role.trim(),
    date: fields.date,
    status: fields.status,
    url,
    notes: fields.notes?.trim() || "",
    resumeId: resume.id,
    resumeSnapshot: structuredClone(resume),
    createdAt: new Date().toISOString(),
  };
}
