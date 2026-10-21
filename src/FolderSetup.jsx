import React, { useState, useEffect } from "react";
import {
  FolderOpen,
  ArrowUp,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { listFolders, openFolder } from "./folder-client.js";
export default function FolderSetup({
  onConnected,
  onCancel,
  error: initialError = "",
}) {
  const [listing, setListing] = useState(null),
    [path, setPath] = useState(""),
    [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false);
  async function browse(target = "", keepError = false) {
    setBusy(true);
    try {
      const next = await listFolders(target);
      setListing(next);
      setPath(next.path);
      if (!keepError) setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    browse("", true);
  }, []);
  async function connect(e) {
    e.preventDefault();
    setBusy(true);
    try {
      onConnected(await openFolder(path));
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <main className="folder-setup">
      <div className="setup-brand">
        <FolderOpen size={25} />
        folio<span>.</span>
      </div>
      <section className="panel folder-card">
        <span className="mini-label">YOUR FILES. YOUR FOLDER.</span>
        <h1>A home for your next chapter.</h1>
        <p>
          Choose an empty folder to start, or open an existing Folio data folder
          to pick up where you left off.
        </p>
        <div className="folder-explainer">
          <ShieldCheck size={20} />
          <span>
            Your resumes, originals, and application history are saved on your
            computer. To move computers, close Folio and copy the entire folder.
          </span>
        </div>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <form onSubmit={connect}>
          <label className="folder-path-label">
            <span>Data folder location</span>
            <div className="folder-path-row">
              <input
                autoComplete="off"
                placeholder="Enter the full path to your folder"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                required
              />
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => browse(path)}
              >
                Browse
              </button>
            </div>
          </label>
          {listing && (
            <div className="folder-browser">
              <div className="folder-browser-heading">
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Parent folder"
                  disabled={busy || listing.parent === listing.path}
                  onClick={() => browse(listing.parent)}
                >
                  <ArrowUp size={16} />
                </button>
                <span title={listing.path}>{listing.path}</span>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Refresh folders"
                  disabled={busy}
                  onClick={() => browse(listing.path)}
                >
                  <RefreshCw size={15} />
                </button>
              </div>
              <div className="folder-list">
                {!listing.folders.length && (
                  <p>No subfolders here. You can select this folder below.</p>
                )}
                {listing.folders.map((name) => (
                  <button
                    type="button"
                    disabled={busy}
                    key={name}
                    onClick={() =>
                      browse(
                        listing.path.replace(/[\\/]$/, "") +
                          (listing.path.includes("\\") ? "\\" : "/") +
                          name,
                      )
                    }
                  >
                    <FolderOpen size={16} />
                    {name}
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
              {listing.roots.length > 1 && (
                <div className="drive-list">
                  {listing.roots.map((root) => (
                    <button
                      type="button"
                      key={root}
                      onClick={() => browse(root)}
                    >
                      {root}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <p className="subtle">
            Create an empty folder using your file manager, then browse to it
            here. An existing folder must contain a valid Folio workspace.
          </p>
          <div className="toolbar-actions">
            <button
              type="submit"
              className="primary"
              disabled={busy || !path.trim()}
            >
              <FolderOpen size={16} />
              {busy ? "Opening…" : "Use this folder"}
            </button>
            {onCancel && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={onCancel}
              >
                Back to workspace
              </button>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
