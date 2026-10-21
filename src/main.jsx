import React, { useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Upload,
  FileText,
  Check,
  Copy,
  Download,
  FolderOpen,
  Trash2,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  X,
  PenLine,
  Clipboard,
  UserRound,
  Search,
  BookOpen,
  BriefcaseBusiness,
  Layers,
  LoaderCircle,
} from "lucide-react";
import {
  parseResume,
  blankResume,
  blankEntry,
  CONTACT_FIELDS,
  ENTRY_FIELDS,
  LABELS,
} from "./parser.js";
import {
  readWorkspace,
  writeWorkspace,
  mergeWorkspace,
  validateWorkspace,
} from "./storage.js";
import { createApplication, APPLICATION_STATUSES } from "./applications.js";
import "./style.css";
const profileFields = {
  name: "Full name",
  email: "Email",
  phone: "Phone",
  location: "Location",
  linkedin: "LinkedIn",
  website: "Website",
  workAuthorization: "Work authorization (include country)",
  sponsorship: "Sponsorship requirements (include country)",
  veteranStatus: "Veteran status (optional)",
  preferredAnswers: "Other reusable answers (optional)",
};
let initial,
  loadError = "";
try {
  initial = readWorkspace();
} catch {
  initial = { schemaVersion: 1, resumes: [], profile: {}, applications: [] };
  loadError =
    "Saved data could not be loaded. Existing storage has not been changed. Export recovery data before saving new records.";
}
function App() {
  const [workspace, setWorkspace] = useState(initial),
    [selected, setSelected] = useState(initial.resumes[0]?.id || null),
    [draft, setDraft] = useState(
      initial.resumes[0]?.reviewed === false
        ? structuredClone(initial.resumes[0])
        : null,
    ),
    [mode, setMode] = useState("resumes"),
    [tab, setTab] = useState("contact"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(loadError),
    [toast, setToast] = useState(""),
    [copied, setCopied] = useState(""),
    [uploadOpen, setUploadOpen] = useState(false),
    [paste, setPaste] = useState(""),
    [query, setQuery] = useState(""),
    [profile, setProfile] = useState(initial.profile),
    [profileDirty, setProfileDirty] = useState(false),
    [dragging, setDragging] = useState(false),
    [applicationForm, setApplicationForm] = useState(null),
    [snapshotId, setSnapshotId] = useState(null);
  function startApplication(resumeId = "") {
    if (!allowNavigation()) return;
    setDraft(null);
    setProfile(workspace.profile);
    setProfileDirty(false);
    setMode("applications");
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    setApplicationForm({
      company: "",
      role: "",
      date,
      status: "Applied",
      url: "",
      notes: "",
      resumeId,
    });
  }
  function saveApplication(e) {
    e.preventDefault();
    try {
      const record = createApplication(
        applicationForm,
        workspace.resumes.find((r) => r.id === applicationForm.resumeId),
      );
      if (
        persist({
          ...workspace,
          applications: [record, ...workspace.applications],
        })
      ) {
        setApplicationForm(null);
        announce("Application logged with a snapshot of the resume used.");
      }
    } catch (e) {
      setError(e.message);
    }
  }
  const fileInput = useRef(null),
    backupInput = useRef(null),
    toastTimer = useRef(null),
    copyTimer = useRef(null);
  const saved = workspace.resumes.find((r) => r.id === selected);
  const resume = draft || saved;
  const editing = !!draft;
  const announce = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  };
  function persist(next) {
    if (loadError) {
      setError(
        "Storage recovery is required. Download recovery data and reload after repairing or clearing browser storage.",
      );
      return false;
    }
    try {
      writeWorkspace(next);
      setWorkspace(next);
      setError("");
      return true;
    } catch {
      setError(
        "Could not save. Browser storage may be unavailable or full. Your edits are still open; export a draft backup before closing.",
      );
      return false;
    }
  }
  function allowNavigation() {
    return (
      (!draft && !profileDirty && !applicationForm) ||
      window.confirm("Leave your unsaved edits? They will be discarded.")
    );
  }
  function navigate(id) {
    if (!allowNavigation()) return;
    setDraft(
      workspace.resumes.find((r) => r.id === id)?.reviewed === false
        ? structuredClone(workspace.resumes.find((r) => r.id === id))
        : null,
    );
    setProfile(workspace.profile);
    setProfileDirty(false);
    setSelected(id);
    setMode("resumes");
    setApplicationForm(null);
    setTab("contact");
    setError(loadError);
  }
  async function upload(file) {
    if (!file || busy) return;
    if (!allowNavigation()) return;
    setBusy(true);
    setError("");
    try {
      const { extractFile } = await import("./files.js");
      const text = await extractFile(file);
      setDraft(parseResume(text, file.name));
      setMode("resumes");
      setTab("contact");
      setUploadOpen(false);
      setPaste("");
      setProfileDirty(false);
      setApplicationForm(null);
    } catch (e) {
      setError(
        e.message || "Unable to read this file. Try pasting the resume text.",
      );
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  function fromPaste() {
    if (!allowNavigation()) return;
    try {
      setDraft(parseResume(paste, "Pasted resume.txt"));
      setUploadOpen(false);
      setMode("resumes");
      setTab("contact");
      setPaste("");
      setError("");
      setProfileDirty(false);
      setApplicationForm(null);
    } catch (e) {
      setError(e.message);
    }
  }
  function save() {
    if (!draft.name.trim()) {
      setError("Give this resume a name before saving.");
      return;
    }
    const next = {
      ...draft,
      reviewed: true,
      updatedAt: new Date().toISOString(),
    };
    const resumes = workspace.resumes.some((r) => r.id === next.id)
      ? workspace.resumes.map((r) => (r.id === next.id ? next : r))
      : [...workspace.resumes, next];
    if (persist({ ...workspace, resumes })) {
      setSelected(next.id);
      setDraft(null);
      announce("Resume reviewed and saved. Click any field to copy.");
    }
  }
  function updateContact(key, value) {
    setDraft((d) => ({ ...d, contact: { ...d.contact, [key]: value } }));
  }
  function updateEntry(section, id, key, value) {
    setDraft((d) => ({
      ...d,
      [section]: d[section].map((e) =>
        e.id === id ? { ...e, [key]: value } : e,
      ),
    }));
  }
  async function copy(value, key) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(""), 1800);
      announce("Copied to clipboard");
    } catch {
      setError(
        "Clipboard access was blocked. Open this app on localhost and allow clipboard access, then try again.",
      );
    }
  }
  function download(data, name) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function backup() {
    if (loadError) {
      download(
        { recovery: localStorage.getItem("folio.workspace.v1") },
        "folio-recovery.json",
      );
      return;
    }
    let data = workspace;
    if (draft)
      data = {
        ...data,
        resumes: [...data.resumes.filter((r) => r.id !== draft.id), draft],
      };
    if (profileDirty) data = { ...data, profile };
    if (applicationForm) {
      setError(
        "Save or cancel the application form before exporting a backup.",
      );
      return;
    }
    download(data, "folio-backup.json");
    announce(
      draft || profileDirty
        ? "Backup includes your unsaved edits."
        : "Backup downloaded. Keep it somewhere private.",
    );
  }
  async function importBackup(file) {
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("Backup is too large (maximum 20 MB).");
      const incoming = validateWorkspace(JSON.parse(await file.text()));
      if (persist(mergeWorkspace(workspace, incoming))) {
        setProfile((p) => ({ ...incoming.profile, ...p }));
        announce(
          "Backup imported. Existing resumes and profile answers were preserved.",
        );
      }
    } catch (e) {
      setError(e.message || "Could not import that backup.");
    } finally {
      backupInput.current.value = "";
    }
  }
  function deleteResume() {
    if (!saved || !window.confirm(`Delete “${saved.name}” from this browser?`))
      return;
    const resumes = workspace.resumes.filter((r) => r.id !== saved.id);
    if (persist({ ...workspace, resumes })) {
      setSelected(resumes[0]?.id || null);
      setTab("contact");
      announce("Resume deleted.");
    }
  }
  function field(label, value, key, onChange, multiline = false) {
    return (
      <div className={"field " + (multiline ? "wide" : "")} key={key}>
        {editing ? (
          <label>
            <span>{label}</span>
            {multiline ? (
              <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                rows={5}
              />
            ) : (
              <input value={value} onChange={(e) => onChange(e.target.value)} />
            )}
          </label>
        ) : (
          <button
            className={"copy-field " + (!value ? "empty" : "")}
            disabled={!value}
            onClick={() => copy(value, key)}
            aria-label={`Copy ${label}`}
          >
            <span className="field-label">{label}</span>
            <span className="field-value">{value || "Not provided"}</span>
            {copied === key ? (
              <Check size={16} className="copied" />
            ) : (
              <Copy size={15} />
            )}
          </button>
        )}
      </div>
    );
  }
  const tabs = [
    ["contact", "Contact", UserRound],
    ["experience", "Experience", BriefcaseBusiness],
    ["education", "Education", BookOpen],
    ["projects", "Projects", Layers],
    ["skills", "Skills & notes", FileText],
  ];
  const filtered = workspace.resumes.filter((r) =>
    r.name.toLowerCase().includes(query.toLowerCase()),
  );
  React.useEffect(() => {
    const handler = (e) => {
      if (draft || profileDirty || applicationForm) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [draft, profileDirty, applicationForm]);
  React.useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" && !busy) setUploadOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [busy]);
  React.useEffect(() => {
    if (uploadOpen) document.getElementById("upload-close")?.focus();
  }, [uploadOpen]);
  return (
    <div className="app-shell">
      <input
        ref={fileInput}
        type="file"
        hidden
        accept=".pdf,.docx,.txt"
        onChange={(e) => upload(e.target.files[0])}
      />
      <input
        ref={backupInput}
        type="file"
        hidden
        accept=".json"
        onChange={(e) => importBackup(e.target.files[0])}
      />
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate(selected);
          }}
        >
          <span className="brand-icon">
            <Layers size={22} />
          </span>
          folio<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR APPLICATION WORKSPACE</div>
        <nav>
          <button
            className={mode === "resumes" ? "nav-item active" : "nav-item"}
            onClick={() => navigate(selected)}
          >
            <FolderOpen size={18} />
            My resumes<span className="count">{workspace.resumes.length}</span>
          </button>
          <button
            className={mode === "profile" ? "nav-item active" : "nav-item"}
            onClick={() => {
              if (allowNavigation()) {
                setDraft(null);
                setProfile(workspace.profile);
                setProfileDirty(false);
                setMode("profile");
                setApplicationForm(null);
              }
            }}
          >
            <UserRound size={18} />
            Personal profile
          </button>
          <button
            className={mode === "applications" ? "nav-item active" : "nav-item"}
            onClick={() => {
              if (allowNavigation()) {
                setDraft(null);
                setProfile(workspace.profile);
                setProfileDirty(false);
                setApplicationForm(null);
                setMode("applications");
              }
            }}
          >
            <BriefcaseBusiness size={18} />
            Applications
            <span className="count">{workspace.applications.length}</span>
          </button>
        </nav>
        <div className="side-heading">
          RESUME LIBRARY
          <button
            aria-label="Upload a resume"
            onClick={() => setUploadOpen(true)}
          >
            <Plus size={16} />
          </button>
        </div>
        {workspace.resumes.length > 3 && (
          <div className="search">
            <Search size={14} />
            <input
              aria-label="Search resumes"
              placeholder="Find a resume"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
        <div className="library">
          {filtered.map((r) => (
            <button
              key={r.id}
              className={
                "resume-item " +
                (selected === r.id && mode === "resumes" ? "selected" : "")
              }
              onClick={() => navigate(r.id)}
            >
              <FileText size={16} />
              <span>
                {r.name}
                <small>{r.reviewed ? "Ready to copy" : "Needs review"}</small>
              </span>
              {selected === r.id && <span className="selection-dot" />}
            </button>
          ))}
          {!workspace.resumes.length && (
            <p className="library-empty">
              A resume for every opportunity.
              <br />
              Your library starts here.
            </p>
          )}
        </div>
        <div className="side-bottom">
          <div className="local-badge">
            <span className="status-dot" />
            Local workspace <span>V0.1</span>
          </div>
          <p>Your resumes stay in this browser.</p>
          <div className="backup-actions">
            <button onClick={backup}>
              <Download size={14} />
              Export backup
            </button>
            <button onClick={() => backupInput.current.click()}>
              <Upload size={14} />
              Import
            </button>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            Workspace <ChevronRight size={13} />{" "}
            <span>
              {mode === "profile"
                ? "Personal profile"
                : mode === "applications"
                  ? "Applications"
                  : "My resumes"}
            </span>
          </div>
          <span className="private-label">
            <ShieldCheck size={15} /> Stored on your device
          </span>
        </header>
        <div className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">LESS REPETITION. MORE POSSIBILITY.</div>
              <h1>
                {mode === "profile"
                  ? "The details that stay with you."
                  : mode === "applications"
                    ? "Every application, accounted for."
                    : "Your next role starts here."}
              </h1>
              <p>
                {mode === "profile"
                  ? "Save reusable answers once. Click to copy them into any application."
                  : mode === "applications"
                    ? "Know where you applied and exactly which resume you used."
                    : "Every version of your story, ready for the right opportunity."}
              </p>
            </div>
            <button
              className="primary"
              disabled={busy}
              onClick={() => setUploadOpen(true)}
            >
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Plus size={18} />
              )}
              Upload resume
            </button>
          </div>
          {error && (
            <div className="error" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {mode === "profile" ? (
            <section className="panel profile-panel">
              <div className="panel-heading">
                <div>
                  <h2>Personal profile</h2>
                  <p>
                    Only answers you provide. Authorization answers should name
                    the country.
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={!profileDirty}
                  onClick={() => {
                    if (persist({ ...workspace, profile })) {
                      setProfileDirty(false);
                      announce("Personal profile saved.");
                    }
                  }}
                >
                  <Check size={16} />
                  Save profile
                </button>
              </div>
              <div className="field-grid">
                {Object.entries(profileFields).map(([key, label]) => (
                  <div
                    className={
                      "field " + (key === "preferredAnswers" ? "wide" : "")
                    }
                    key={key}
                  >
                    <label>
                      <span>{label}</span>
                      <textarea
                        rows={key === "preferredAnswers" ? 3 : 1}
                        value={profile[key] || ""}
                        onChange={(e) => {
                          setProfile({ ...profile, [key]: e.target.value });
                          setProfileDirty(true);
                        }}
                      />
                    </label>
                    <button
                      className="profile-copy"
                      disabled={profileDirty || !workspace.profile[key]}
                      onClick={() => copy(workspace.profile[key], key)}
                      aria-label={`Copy ${label}`}
                    >
                      <Copy size={14} />
                      Copy saved answer
                    </button>
                  </div>
                ))}
              </div>
              <p className="subtle">
                Optional questions can be left blank or answered “Prefer not to
                answer.” Save changes to enable copying.
              </p>
            </section>
          ) : mode === "applications" ? (
            <section className="panel profile-panel application-panel">
              <div className="panel-heading">
                <div>
                  <h2>Application history</h2>
                  <p>
                    Log applications yourself. Each record keeps the saved
                    resume as it was at that moment.
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={!!applicationForm}
                  onClick={() => startApplication(selected || "")}
                >
                  <Plus size={16} />
                  Log application
                </button>
              </div>
              {applicationForm && (
                <form onSubmit={saveApplication} className="application-form">
                  <div className="field-grid">
                    {Object.entries({
                      company: "Company",
                      role: "Job title",
                      date: "Application / tracking date",
                      url: "Job posting URL (optional)",
                    }).map(([key, label]) => (
                      <div className="field" key={key}>
                        <label>
                          <span>{label}</span>
                          <input
                            required={key !== "url"}
                            type={
                              key === "date"
                                ? "date"
                                : key === "url"
                                  ? "url"
                                  : "text"
                            }
                            value={applicationForm[key]}
                            onChange={(e) =>
                              setApplicationForm({
                                ...applicationForm,
                                [key]: e.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    ))}
                    <div className="field">
                      <label>
                        <span>Resume used</span>
                        <select
                          required
                          value={applicationForm.resumeId}
                          onChange={(e) =>
                            setApplicationForm({
                              ...applicationForm,
                              resumeId: e.target.value,
                            })
                          }
                        >
                          <option value="">Choose a saved resume</option>
                          {workspace.resumes
                            .filter((r) => r.reviewed)
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                    <div className="field">
                      <label>
                        <span>Application status</span>
                        <select
                          value={applicationForm.status}
                          onChange={(e) =>
                            setApplicationForm({
                              ...applicationForm,
                              status: e.target.value,
                            })
                          }
                        >
                          {APPLICATION_STATUSES.map((status) => (
                            <option key={status}>{status}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="field wide">
                      <label>
                        <span>Notes (optional)</span>
                        <textarea
                          rows={2}
                          value={applicationForm.notes}
                          onChange={(e) =>
                            setApplicationForm({
                              ...applicationForm,
                              notes: e.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>
                  {!workspace.resumes.some((r) => r.reviewed) && (
                    <p className="subtle">
                      Upload, review, and save a resume first.
                    </p>
                  )}
                  <div className="toolbar-actions">
                    <button
                      type="submit"
                      className="primary"
                      disabled={!workspace.resumes.some((r) => r.reviewed)}
                    >
                      <Check size={16} />
                      Save application
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setApplicationForm(null);
                        setError("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
              {!workspace.applications.length && !applicationForm && (
                <div className="section-empty">
                  <BriefcaseBusiness size={30} />
                  <h3>Your next opportunity goes here.</h3>
                  <p>
                    Log the company, role, date, and resume used after you
                    apply.
                  </p>
                </div>
              )}
              {workspace.applications.map((app) => (
                <article className="application-record" key={app.id}>
                  <div className="application-record-heading">
                    <div>
                      <h3>{app.role}</h3>
                      <p>
                        {app.company} <span className="middle-dot">·</span>{" "}
                        {app.date}
                      </p>
                    </div>
                    <label className="status-select">
                      <span className="sr-only">
                        Status for {app.role} at {app.company}
                      </span>
                      <select
                        value={app.status}
                        onChange={(e) =>
                          persist({
                            ...workspace,
                            applications: workspace.applications.map((a) =>
                              a.id === app.id
                                ? { ...a, status: e.target.value }
                                : a,
                            ),
                          })
                        }
                      >
                        {APPLICATION_STATUSES.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="resume-used">
                    <FileText size={15} />
                    Resume used: <strong>{app.resumeSnapshot.name}</strong>
                  </p>
                  {app.url && (
                    <a
                      className="text-button"
                      href={app.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Job posting <ArrowUpRight size={13} />
                    </a>
                  )}
                  {app.notes && (
                    <p className="application-notes">{app.notes}</p>
                  )}
                  <button
                    className="secondary snapshot-toggle"
                    aria-expanded={snapshotId === app.id}
                    onClick={() =>
                      setSnapshotId(snapshotId === app.id ? null : app.id)
                    }
                  >
                    <FileText size={14} />
                    {snapshotId === app.id
                      ? "Hide resume used"
                      : "View resume used"}
                  </button>
                  {snapshotId === app.id && (
                    <div className="application-snapshot">
                      <h3>{app.resumeSnapshot.name}</h3>
                      <p className="subtle">
                        Saved snapshot. Later resume edits or deletion will not
                        change this record. Click a field to copy.
                      </p>
                      <div className="field-grid">
                        {CONTACT_FIELDS.map((key) =>
                          field(
                            LABELS[key],
                            app.resumeSnapshot.contact[key],
                            `${app.id}-${key}`,
                            () => {},
                          ),
                        )}
                      </div>
                      {Object.keys(ENTRY_FIELDS).map((section) => (
                        <div key={section}>
                          <h4>{section[0].toUpperCase() + section.slice(1)}</h4>
                          {app.resumeSnapshot[section].map((entry) => (
                            <div
                              className="field-grid snapshot-entry"
                              key={entry.id}
                            >
                              {ENTRY_FIELDS[section].map((key) =>
                                field(
                                  key === "name"
                                    ? "Project name"
                                    : LABELS[key] || key,
                                  entry[key],
                                  `${app.id}-${entry.id}-${key}`,
                                  () => {},
                                  key === "description",
                                ),
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                      <div className="field-grid">
                        {field(
                          "Skills",
                          app.resumeSnapshot.skills,
                          `${app.id}-skills`,
                          () => {},
                          true,
                        )}
                        {field(
                          "Additional text",
                          app.resumeSnapshot.notes,
                          `${app.id}-notes`,
                          () => {},
                          true,
                        )}
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </section>
          ) : !resume ? (
            <>
              <section
                className={"upload-hero " + (dragging ? "dragging" : "")}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  upload(e.dataTransfer.files[0]);
                }}
              >
                <div className="hero-art">
                  <div className="paper back-paper" />
                  <div className="paper front-paper">
                    <span className="paper-person" />
                    <i />
                    <i />
                    <div />
                    <i />
                    <i />
                    <i />
                    <div />
                    <i />
                    <i />
                    <span className="paper-check">
                      <Check size={20} />
                    </span>
                  </div>
                  <span className="floating-tag">
                    <Clipboard size={13} /> Ready when you are
                  </span>
                </div>
                <div className="hero-copy">
                  <span className="mini-label">
                    ONE UPLOAD. EVERYTHING IN PLACE.
                  </span>
                  <h2>
                    Meet your resume’s
                    <br />
                    new home.
                  </h2>
                  <p>
                    Upload a resume, make it yours, and turn every application
                    field into a single click.
                  </p>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => fileInput.current.click()}
                  >
                    <Upload size={17} />
                    {busy ? "Reading your resume…" : "Upload your first resume"}
                    <ArrowUpRight size={16} />
                  </button>
                  <div className="file-hint">
                    PDF, DOCX, or TXT · up to 15 MB
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setUploadOpen(true)}
                  >
                    Or paste resume text <ArrowRight size={13} />
                  </button>
                </div>
              </section>
              <div className="steps">
                {[
                  [
                    "01",
                    "Bring your resume",
                    "Keep a different version for every kind of role.",
                  ],
                  [
                    "02",
                    "Make sure it’s right",
                    "Review the parsed fields next to your original text.",
                  ],
                  [
                    "03",
                    "Click. Paste. Repeat.",
                    "Click any saved field to copy. Paste where you need it.",
                  ],
                ].map(([n, title, body]) => (
                  <div key={n}>
                    <span>{n}</span>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                ))}
              </div>
              <div className="coming-next">
                <div>
                  <span className="pill">ON THE ROADMAP</span>
                  <p>More applying. Less typing.</p>
                  <small>
                    Browser autofill for Workday, Greenhouse, and Ashby is
                    planned for a future version.
                  </small>
                </div>
                <ArrowUpRight size={22} />
              </div>
            </>
          ) : (
            <>
              <div className="resume-toolbar">
                <div className="resume-title">
                  <div className="file-badge">
                    <FileText size={22} />
                  </div>
                  <div>
                    {editing ? (
                      <input
                        aria-label="Resume name"
                        className="name-input"
                        value={draft.name}
                        onChange={(e) =>
                          setDraft({ ...draft, name: e.target.value })
                        }
                      />
                    ) : (
                      <h2>{saved.name}</h2>
                    )}
                    <span>
                      {resume.filename || "Manually created"}{" "}
                      <span className="middle-dot">·</span>{" "}
                      {editing
                        ? "Review in progress"
                        : `Saved ${new Date(saved.updatedAt).toLocaleDateString()}`}
                    </span>
                  </div>
                </div>
                <div className="toolbar-actions">
                  {editing ? (
                    <>
                      <button
                        className="secondary"
                        onClick={() => {
                          if (allowNavigation()) {
                            setDraft(null);
                            if (saved && !saved.reviewed) setSelected(null);
                            setError("");
                          }
                        }}
                      >
                        Cancel
                      </button>
                      <button className="primary" onClick={save}>
                        <Check size={16} />
                        Reviewed & save
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="secondary"
                        onClick={() => startApplication(saved.id)}
                      >
                        <BriefcaseBusiness size={15} />
                        Log application
                      </button>
                      <span className="ready-badge">
                        <span className="status-dot" />
                        {saved.reviewed ? "Ready to copy" : "Needs review"}
                      </span>
                      <button
                        className="secondary"
                        onClick={() => {
                          setDraft(structuredClone(saved));
                          setError("");
                        }}
                      >
                        <PenLine size={15} />
                        Edit
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Duplicate resume"
                        title="Duplicate resume"
                        onClick={() => {
                          const next = structuredClone(saved);
                          next.id = crypto.randomUUID();
                          next.name += " (copy)";
                          next.createdAt = new Date().toISOString();
                          next.reviewed = false;
                          setDraft(next);
                        }}
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        className="icon-button danger"
                        aria-label="Delete resume"
                        onClick={deleteResume}
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {editing ? (
                <div className="review-banner">
                  <AlertCircle size={19} />
                  <div>
                    <strong>A first pass, ready for your review.</strong>
                    <p>
                      {resume.warnings[0] ||
                        "Compare your fields with the source, then save when everything looks right."}
                    </p>
                    <details>
                      <summary>Parsing notes</summary>
                      {resume.warnings.slice(1).map((w) => (
                        <p key={w}>{w}</p>
                      ))}
                      <p>
                        Undetected fields remain blank. You can add, remove, and
                        rearrange text manually.
                      </p>
                    </details>
                  </div>
                </div>
              ) : (
                <div className="copy-banner">
                  <Clipboard size={17} />
                  <span>
                    Click a field to copy it. Switch to your application and
                    paste.
                  </span>
                  <span className="keyboard-hint">
                    click <ArrowRight size={12} /> Ctrl / ⌘ V
                  </span>
                </div>
              )}
              <div
                className={"editor-layout " + (editing ? "with-source" : "")}
              >
                <section className="panel resume-panel">
                  <div
                    className="tabs"
                    role="tablist"
                    aria-label="Resume sections"
                  >
                    {tabs.map(([key, label, Icon]) => (
                      <button
                        role="tab"
                        aria-selected={tab === key}
                        key={key}
                        className={tab === key ? "active" : ""}
                        onClick={() => setTab(key)}
                      >
                        <Icon size={15} />
                        {label}
                        {ENTRY_FIELDS[key] && <span>{resume[key].length}</span>}
                      </button>
                    ))}
                  </div>
                  <div
                    className="section-content"
                    role="tabpanel"
                    aria-label={tabs.find((t) => t[0] === tab)?.[1]}
                  >
                    {tab === "contact" ? (
                      <>
                        <div className="section-title">
                          <h3>Contact details</h3>
                          <span>
                            {editing
                              ? "Check your header details"
                              : "Click any field to copy"}
                          </span>
                        </div>
                        <div className="field-grid">
                          {CONTACT_FIELDS.map((key) =>
                            field(
                              LABELS[key],
                              resume.contact[key],
                              `contact-${key}`,
                              (value) => updateContact(key, value),
                            ),
                          )}
                        </div>
                      </>
                    ) : ENTRY_FIELDS[tab] ? (
                      <>
                        <div className="section-title">
                          <h3>{tabs.find((t) => t[0] === tab)[1]}</h3>
                          {editing && (
                            <button
                              className="text-button"
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  [tab]: [...draft[tab], blankEntry(tab)],
                                })
                              }
                            >
                              <Plus size={15} />
                              Add entry
                            </button>
                          )}
                        </div>
                        {!resume[tab].length && (
                          <div className="section-empty">
                            <Layers size={28} />
                            <h3>No {tab} added</h3>
                            <p>
                              {editing
                                ? "Add an entry using your source text."
                                : "Edit this resume to add an entry."}
                            </p>
                          </div>
                        )}
                        {resume[tab].map((entry, index) => (
                          <article className="entry" key={entry.id}>
                            <div className="entry-heading">
                              <span className="entry-number">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <h4>
                                {(tab === "experience"
                                  ? entry.company
                                  : tab === "education"
                                    ? entry.school
                                    : entry.name) || "Untitled entry"}
                              </h4>
                              {editing && (
                                <button
                                  className="icon-button danger"
                                  aria-label={`Remove entry ${index + 1}`}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        "Remove this entry from the draft?",
                                      )
                                    )
                                      setDraft({
                                        ...draft,
                                        [tab]: draft[tab].filter(
                                          (e) => e.id !== entry.id,
                                        ),
                                      });
                                  }}
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                            <div className="field-grid">
                              {ENTRY_FIELDS[tab].map((key) =>
                                field(
                                  key === "name"
                                    ? "Project name"
                                    : LABELS[key] || key,
                                  entry[key],
                                  `${entry.id}-${key}`,
                                  (value) =>
                                    updateEntry(tab, entry.id, key, value),
                                  key === "description",
                                ),
                              )}
                            </div>
                          </article>
                        ))}
                      </>
                    ) : (
                      <>
                        <div className="section-title">
                          <h3>Skills & additional text</h3>
                          <span>Preserved in your own words</span>
                        </div>
                        <div className="field-grid">
                          {field(
                            "Skills",
                            resume.skills,
                            "skills",
                            (value) => setDraft({ ...draft, skills: value }),
                            true,
                          )}
                          {field(
                            "Additional / unclassified text",
                            resume.notes,
                            "notes",
                            (value) => setDraft({ ...draft, notes: value }),
                            true,
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </section>
                {editing && (
                  <aside className="source-panel">
                    <div>
                      <FileText size={16} />
                      <h3>Original text</h3>
                      <span>REFERENCE</span>
                    </div>
                    <p>
                      Extracted from your upload. Check company/title order and
                      dates carefully.
                    </p>
                    <pre>
                      {resume.rawText ||
                        "No source text. Add your details in the fields to the left."}
                    </pre>
                  </aside>
                )}
              </div>
            </>
          )}
          <footer>
            <span>Made for your next chapter.</span>
            <span>
              <ShieldCheck size={13} />
              No uploads leave your browser
            </span>
          </footer>
        </div>
      </main>
      {uploadOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setUploadOpen(false);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-title"
            onKeyDown={(e) => {
              if (e.key !== "Tab") return;
              const controls = [
                ...e.currentTarget.querySelectorAll(
                  "button:not(:disabled), textarea, input",
                ),
              ];
              const first = controls[0],
                last = controls.at(-1);
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }}
          >
            <button
              id="upload-close"
              className="modal-close icon-button"
              aria-label="Close upload"
              disabled={busy}
              onClick={() => setUploadOpen(false)}
            >
              <X size={20} />
            </button>
            <span className="mini-label">ADD TO YOUR LIBRARY</span>
            <h2 id="upload-title">A new version of you.</h2>
            <p>
              Upload a resume or paste its text. You’ll review the fields before
              saving.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              className="upload-zone"
              disabled={busy}
              onClick={() => fileInput.current.click()}
            >
              <Upload size={25} />
              <strong>
                {busy ? "Reading your resume…" : "Choose a resume"}
              </strong>
              <span>PDF, DOCX, or TXT · up to 15 MB</span>
            </button>
            <div className="divider">
              <span>or paste text</span>
            </div>
            <label className="paste-label">
              <span>Resume text</span>
              <textarea
                rows={7}
                placeholder="Paste your resume text here…"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
            </label>
            <button
              className="primary full-width"
              disabled={busy || !paste.trim()}
              onClick={fromPaste}
            >
              Parse & review
              <ArrowRight size={16} />
            </button>
            <button
              className="text-button manual"
              disabled={busy}
              onClick={() => {
                if (!allowNavigation()) return;
                setDraft(blankResume());
                setUploadOpen(false);
                setMode("resumes");
                setTab("contact");
                setProfileDirty(false);
              }}
            >
              Start with a blank resume
            </button>
          </section>
        </div>
      )}
      <div
        className={"toast " + (toast ? "visible" : "")}
        role="status"
        aria-live="polite"
      >
        {toast && (
          <>
            <Check size={17} />
            {toast}
          </>
        )}
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
