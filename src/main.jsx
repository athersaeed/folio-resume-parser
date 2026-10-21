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
import { readWorkspace, mergeWorkspace, validateWorkspace } from "./storage.js";
import { createApplication, APPLICATION_STATUSES } from "./applications.js";
import FolderSetup from "./FolderSetup.jsx";
import {
  session,
  saveToFolder,
  archiveOriginal,
  downloadOriginal,
} from "./folder-client.js";
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
function App({ initial, folderPath, onChangeFolder }) {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [legacyData, setLegacyData] = useState(() => {
    try {
      return readWorkspace();
    } catch {
      return null;
    }
  });
  const legacyAvailable =
    legacyData &&
    (legacyData.resumes.some(
      (r) => !initial.resumes.some((saved) => saved.id === r.id),
    ) ||
      legacyData.applications.some(
        (a) => !initial.applications.some((saved) => saved.id === a.id),
      ) ||
      Object.keys(legacyData.profile).some((key) => !(key in initial.profile)));
  const [workspace, setWorkspace] = useState(initial),
    [selected, setSelected] = useState(initial.resumes[0]?.id || null),
    [draft, setDraft] = useState(
      initial.resumes[0]?.reviewed === false
        ? structuredClone(initial.resumes[0])
        : null,
    ),
    [mode, setMode] = useState("resumes"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
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
  async function saveApplication(e) {
    e.preventDefault();
    try {
      const record = createApplication(
        applicationForm,
        workspace.resumes.find((r) => r.id === applicationForm.resumeId),
      );
      if (
        await persist({
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
  async function persist(next) {
    if (savingRef.current) {
      setError("A save is already in progress. Please wait.");
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await saveToFolder(next);
      setWorkspace(result.workspace);
      setError("");
      return true;
    } catch (e) {
      setError(
        e.message +
          " Your edits are still open. Export a JSON backup before reloading if needed.",
      );
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
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
    setError("");
  }
  async function upload(file) {
    if (!file || busy) return;
    if (!allowNavigation()) return;
    setBusy(true);
    setError("");
    try {
      const { extractFile } = await import("./files.js");
      const text = await extractFile(file);
      const original = await archiveOriginal(file);
      setDraft({ ...parseResume(text, file.name), original });
      setMode("resumes");
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
      setPaste("");
      setError("");
      setProfileDirty(false);
      setApplicationForm(null);
    } catch (e) {
      setError(e.message);
    }
  }
  async function save() {
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
    if (await persist({ ...workspace, resumes })) {
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
        : "JSON exported. Copy the entire data folder to back up originals and history.",
    );
  }
  async function importBackup(file) {
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("Backup is too large (maximum 20 MB).");
      const incoming = validateWorkspace(JSON.parse(await file.text()));
      if (await persist(mergeWorkspace(workspace, incoming))) {
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
  async function deleteResume() {
    if (
      !saved ||
      !window.confirm(
        `Delete “${saved.name}” from the current workspace? Its earlier revisions stay in folder history.`,
      )
    )
      return;
    const resumes = workspace.resumes.filter((r) => r.id !== saved.id);
    if (await persist({ ...workspace, resumes })) {
      setSelected(resumes[0]?.id || null);
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
  function inlineCopy(label, value, id, className = "") {
    if (!value) return null;
    return (
      <button
        key={id}
        className={"inline-copy " + className}
        aria-label={`Copy ${label}`}
        onClick={() => copy(value, id)}
        title={`Click to copy ${label}`}
      >
        <span>{value}</span>
        {copied === id ? <Check size={14} /> : <Copy size={13} />}
      </button>
    );
  }
  function editSection(id) {
    setDraft(structuredClone(saved));
    setError("");
    requestAnimationFrame(() =>
      document
        .getElementById(id)
        ?.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  }
  function sectionHeading(id, title, Icon, action = null) {
    return (
      <div className="section-title">
        <h3>
          <Icon size={17} />
          {title}
        </h3>
        {editing ? (
          action
        ) : (
          <button
            className="icon-button"
            aria-label={`Edit ${title}`}
            onClick={() => editSection(id)}
          >
            <PenLine size={14} />
          </button>
        )}
      </div>
    );
  }
  function description(value, id) {
    if (!value) return null;
    const blocks = [];
    for (const line of value.split(/\n/)) {
      if (!line.trim()) continue;
      const isBullet = /^[•●▪◦*\-–]\s*/.test(line);
      if (!isBullet && blocks.at(-1)?.isBullet)
        blocks.at(-1).text += "\n" + line;
      else blocks.push({ isBullet, text: line.replace(/^[•●▪◦*\-–]\s*/, "") });
    }
    return (
      <div className="resume-description">
        {blocks.map(({ text, isBullet }, index) => {
          return (
            <div
              className={
                isBullet ? "description-line bullet-line" : "description-line"
              }
              key={index}
            >
              {inlineCopy(
                `description line ${index + 1}`,
                text,
                `${id}-${index}`,
              )}
            </div>
          );
        })}
        <button
          className="text-button copy-description"
          onClick={() => copy(value, id)}
        >
          {copied === id ? <Check size={13} /> : <Copy size={13} />}Copy full
          description
        </button>
      </div>
    );
  }
  const filtered = workspace.resumes.filter((r) =>
    r.name.toLowerCase().includes(query.toLowerCase()),
  );
  React.useEffect(() => {
    const handler = (e) => {
      if (draft || profileDirty || applicationForm || saving) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [draft, profileDirty, applicationForm, saving]);
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
    <div className="app-shell" inert={saving ? true : undefined}>
      {saving && <div className="saving-indicator">Saving to folder…</div>}
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
            Folder workspace <span>V0.2</span>
          </div>
          <p className="data-folder-path" title={folderPath}>
            {folderPath}
          </p>
          <button
            className="text-button change-folder"
            onClick={() => {
              if (allowNavigation()) onChangeFolder();
            }}
          >
            <FolderOpen size={14} />
            Change data folder
          </button>
          <div className="backup-actions">
            <button onClick={backup}>
              <Download size={14} />
              Export JSON
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
            <ShieldCheck size={15} /> Saved in your data folder
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
          {legacyAvailable && (
            <div className="copy-banner legacy-banner">
              <div>
                <strong>Bring your existing browser data with you.</strong>
                <p>
                  Merge saved resumes, profile answers, and applications into
                  this folder. Browser data is kept intact. Old uploads must be
                  reuploaded to archive their original files.
                </p>
              </div>
              <button
                className="secondary"
                onClick={async () => {
                  if (await persist(mergeWorkspace(workspace, legacyData))) {
                    setLegacyData(null);
                    announce("Browser data copied to your folder.");
                  }
                }}
              >
                Import browser data
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
                  onClick={async () => {
                    if (await persist({ ...workspace, profile })) {
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
                      {app.resumeSnapshot.original && (
                        <button
                          className="text-button"
                          onClick={() =>
                            downloadOriginal(app.resumeSnapshot.original).catch(
                              (e) => setError(e.message),
                            )
                          }
                        >
                          <Download size={14} />
                          Download original file
                        </button>
                      )}
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
                      {saved.original && (
                        <button
                          className="secondary"
                          onClick={() =>
                            downloadOriginal(saved.original).catch((e) =>
                              setError(e.message),
                            )
                          }
                        >
                          <Download size={15} />
                          Original file
                        </button>
                      )}
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
                    Click any text to copy it. Paste into your application.
                    Scroll for all your details.
                  </span>
                  <span className="keyboard-hint">
                    click <ArrowRight size={12} /> Ctrl / ⌘ V
                  </span>
                </div>
              )}
              <div
                className={"editor-layout " + (editing ? "with-source" : "")}
              >
                <div className="resume-stack">
                  <section className="panel resume-card" id="resume-contact">
                    {sectionHeading(
                      "resume-contact",
                      "Contact details",
                      UserRound,
                    )}
                    {editing ? (
                      <div className="field-grid">
                        {CONTACT_FIELDS.filter(
                          (key) => !["linkedin", "website"].includes(key),
                        ).map((key) =>
                          field(
                            LABELS[key],
                            resume.contact[key],
                            `contact-${key}`,
                            (value) => updateContact(key, value),
                          ),
                        )}
                      </div>
                    ) : (
                      <div className="contact-summary">
                        <div className="contact-avatar" aria-hidden="true">
                          {resume.contact.name
                            .split(/\s+/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((n) => n[0])
                            .join("") || <UserRound size={23} />}
                        </div>
                        <div>
                          {inlineCopy(
                            "Full name",
                            resume.contact.name,
                            "contact-name",
                            "contact-name",
                          )}
                          {["location", "email", "phone"].map((key) =>
                            inlineCopy(
                              LABELS[key],
                              resume.contact[key],
                              `contact-${key}`,
                            ),
                          )}
                          {!Object.values(resume.contact).some(Boolean) && (
                            <p className="subtle">
                              No contact details added yet.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                  {["education", "experience", "projects"].map((section) => {
                    const title = {
                      education: "Education",
                      experience: "Experience",
                      projects: "Projects",
                    }[section];
                    const Icon = {
                      education: BookOpen,
                      experience: BriefcaseBusiness,
                      projects: Layers,
                    }[section];
                    return (
                      <section
                        key={section}
                        className="panel resume-card"
                        id={`resume-${section}`}
                      >
                        {sectionHeading(
                          `resume-${section}`,
                          title,
                          Icon,
                          <button
                            className="text-button"
                            onClick={() =>
                              setDraft({
                                ...draft,
                                [section]: [
                                  ...draft[section],
                                  blankEntry(section),
                                ],
                              })
                            }
                          >
                            <Plus size={14} />
                            Add{" "}
                            {section === "education"
                              ? "education"
                              : section === "experience"
                                ? "experience"
                                : "project"}
                          </button>,
                        )}
                        {!resume[section].length && (
                          <p className="card-empty">
                            {editing
                              ? "Add an entry using your source text."
                              : `No ${section} added yet.`}
                          </p>
                        )}
                        {resume[section].map((entry, index) => (
                          <article
                            className="resume-history-entry"
                            key={entry.id}
                          >
                            {editing ? (
                              <>
                                <div className="entry-heading">
                                  <span className="entry-number">
                                    {String(index + 1).padStart(2, "0")}
                                  </span>
                                  <h4>
                                    {(section === "education"
                                      ? entry.school
                                      : section === "experience"
                                        ? entry.company
                                        : entry.name) || "Untitled entry"}
                                  </h4>
                                  <button
                                    className="icon-button danger"
                                    aria-label={`Remove ${section} entry ${index + 1}`}
                                    onClick={() => {
                                      if (
                                        window.confirm(
                                          "Remove this entry from the draft?",
                                        )
                                      )
                                        setDraft({
                                          ...draft,
                                          [section]: draft[section].filter(
                                            (e) => e.id !== entry.id,
                                          ),
                                        });
                                    }}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                                <div className="field-grid">
                                  {ENTRY_FIELDS[section].map((key) =>
                                    field(
                                      key === "name"
                                        ? "Project name"
                                        : LABELS[key] || key,
                                      entry[key],
                                      `${entry.id}-${key}`,
                                      (value) =>
                                        updateEntry(
                                          section,
                                          entry.id,
                                          key,
                                          value,
                                        ),
                                      key === "description",
                                    ),
                                  )}
                                </div>
                              </>
                            ) : (
                              <div className="entry-summary">
                                <div
                                  className="entry-symbol"
                                  aria-hidden="true"
                                >
                                  <Icon size={20} />
                                </div>
                                <div className="entry-copy-content">
                                  {section === "experience" ? (
                                    <>
                                      {inlineCopy(
                                        "Job title",
                                        entry.title,
                                        `${entry.id}-title`,
                                        "entry-title",
                                      ) || (
                                        <h4 className="entry-title">
                                          Untitled experience
                                        </h4>
                                      )}
                                      <div className="entry-meta">
                                        {inlineCopy(
                                          "Company",
                                          entry.company,
                                          `${entry.id}-company`,
                                        )}
                                        {entry.company && entry.location && (
                                          <span>·</span>
                                        )}
                                        {inlineCopy(
                                          "Location",
                                          entry.location,
                                          `${entry.id}-location`,
                                        )}
                                      </div>
                                    </>
                                  ) : section === "education" ? (
                                    <>
                                      {inlineCopy(
                                        "School",
                                        entry.school,
                                        `${entry.id}-school`,
                                        "entry-title",
                                      ) || (
                                        <h4 className="entry-title">
                                          Untitled education
                                        </h4>
                                      )}
                                      <div className="entry-meta">
                                        {inlineCopy(
                                          "Degree",
                                          entry.degree,
                                          `${entry.id}-degree`,
                                        )}
                                        {entry.degree && entry.fieldOfStudy && (
                                          <span>·</span>
                                        )}
                                        {inlineCopy(
                                          "Field of study",
                                          entry.fieldOfStudy,
                                          `${entry.id}-fieldOfStudy`,
                                        )}
                                      </div>
                                      {inlineCopy(
                                        "Location",
                                        entry.location,
                                        `${entry.id}-location`,
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      {inlineCopy(
                                        "Project name",
                                        entry.name,
                                        `${entry.id}-name`,
                                        "entry-title",
                                      ) || (
                                        <h4 className="entry-title">
                                          Untitled project
                                        </h4>
                                      )}
                                      {inlineCopy(
                                        "Project URL",
                                        entry.url,
                                        `${entry.id}-url`,
                                      )}
                                    </>
                                  )}
                                  {section !== "projects" && (
                                    <div className="entry-dates">
                                      {inlineCopy(
                                        "Start date",
                                        entry.startDate,
                                        `${entry.id}-startDate`,
                                      )}
                                      {entry.startDate && entry.endDate && (
                                        <span>–</span>
                                      )}
                                      {inlineCopy(
                                        "End date",
                                        entry.endDate,
                                        `${entry.id}-endDate`,
                                      )}
                                    </div>
                                  )}
                                  {description(
                                    entry.description,
                                    `${entry.id}-description`,
                                  )}
                                </div>
                              </div>
                            )}
                          </article>
                        ))}
                      </section>
                    );
                  })}
                  <section className="panel resume-card" id="resume-uploads">
                    <div className="section-title">
                      <h3>
                        <FileText size={17} />
                        Uploads
                      </h3>
                    </div>
                    {resume.original ? (
                      <div className="upload-summary">
                        <div className="entry-symbol">
                          <FileText size={21} />
                        </div>
                        <div>
                          <strong>{resume.original.filename}</strong>
                          <p>Original uploaded file</p>
                          <button
                            className="text-button"
                            onClick={() =>
                              downloadOriginal(resume.original).catch((e) =>
                                setError(e.message),
                              )
                            }
                          >
                            <Download size={14} />
                            Download original
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="card-empty">
                        {resume.filename
                          ? `${resume.filename} · Extracted text is available; no original file was archived.`
                          : "Created from text. No original file attached."}
                      </p>
                    )}
                  </section>
                  <section className="panel resume-card" id="resume-links">
                    {sectionHeading("resume-links", "Links", ArrowUpRight)}
                    {editing ? (
                      <div className="field-grid">
                        {["linkedin", "website"].map((key) =>
                          field(
                            LABELS[key],
                            resume.contact[key],
                            `contact-${key}`,
                            (value) => updateContact(key, value),
                          ),
                        )}
                      </div>
                    ) : (
                      <div className="resume-links">
                        {["linkedin", "website"].map(
                          (key) =>
                            resume.contact[key] && (
                              <div key={key}>
                                <h4>{LABELS[key]}</h4>
                                {inlineCopy(
                                  LABELS[key],
                                  resume.contact[key],
                                  `contact-${key}`,
                                )}
                              </div>
                            ),
                        )}
                        {!resume.contact.linkedin &&
                          !resume.contact.website && (
                            <p className="card-empty">No links added yet.</p>
                          )}
                      </div>
                    )}
                  </section>
                  <section className="panel resume-card" id="resume-skills">
                    {sectionHeading("resume-skills", "Skills", Layers)}
                    {editing ? (
                      field(
                        "Skills",
                        resume.skills,
                        "skills",
                        (value) => setDraft({ ...draft, skills: value }),
                        true,
                      )
                    ) : resume.skills ? (
                      <>
                        <div className="skill-chips">
                          {resume.skills
                            .split(/[,;|\n]+/)
                            .map((skill) => skill.trim())
                            .filter(Boolean)
                            .map((skill, index) => (
                              <button
                                className={
                                  "skill-chip " +
                                  (copied === `skill-${index}`
                                    ? "is-copied"
                                    : "")
                                }
                                aria-label={`Copy skill ${skill}`}
                                key={index}
                                onClick={() => copy(skill, `skill-${index}`)}
                              >
                                {skill}
                                {copied === `skill-${index}` && (
                                  <Check size={12} />
                                )}
                              </button>
                            ))}
                        </div>
                        <button
                          className="text-button copy-description"
                          onClick={() => copy(resume.skills, "skills")}
                        >
                          <Copy size={13} />
                          Copy all skills
                        </button>
                      </>
                    ) : (
                      <p className="card-empty">No skills added yet.</p>
                    )}
                  </section>
                  <section className="panel resume-card" id="resume-notes">
                    {sectionHeading(
                      "resume-notes",
                      "Additional text",
                      FileText,
                    )}
                    {editing ? (
                      field(
                        "Additional / unclassified text",
                        resume.notes,
                        "notes",
                        (value) => setDraft({ ...draft, notes: value }),
                        true,
                      )
                    ) : resume.notes ? (
                      description(resume.notes, "notes")
                    ) : (
                      <p className="card-empty">No additional text.</p>
                    )}
                  </section>
                </div>
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
              Files stay on your computer
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
function WorkspaceGate() {
  const [connection, setConnection] = useState(null),
    [choosing, setChoosing] = useState(false),
    [connectionError, setConnectionError] = useState("");
  async function reconnect() {
    try {
      setConnectionError("");
      setConnection(await session());
    } catch (e) {
      setConnectionError(e.message);
    }
  }
  React.useEffect(() => {
    reconnect();
  }, []);
  if (connectionError)
    return (
      <main className="folder-setup">
        <section className="panel folder-card">
          <h1>Local storage is unavailable.</h1>
          <p role="alert">{connectionError}</p>
          <button className="primary" onClick={reconnect}>
            Reconnect
          </button>
        </section>
      </main>
    );
  if (!connection)
    return (
      <div className="folder-setup">
        <p role="status">Opening your local workspace…</p>
      </div>
    );
  if (!connection.connected || choosing)
    return (
      <FolderSetup
        error={connection.error}
        onCancel={connection.connected ? () => setChoosing(false) : null}
        onConnected={(next) => {
          setConnection(next);
          setChoosing(false);
        }}
      />
    );
  return (
    <App
      key={connection.selection}
      initial={connection.workspace}
      folderPath={connection.path}
      onChangeFolder={() => setChoosing(true)}
    />
  );
}
createRoot(document.getElementById("root")).render(<WorkspaceGate />);
