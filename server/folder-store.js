import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { emptyWorkspace, validateWorkspace } from "../src/storage.js";
const FORMAT = "folio-folder";
export class StorageError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
async function atomicWrite(filename, contents) {
  const temporary = filename + "." + randomUUID() + ".tmp";
  let handle;
  try {
    handle = await fs.open(temporary, "wx", 0o600);
    await handle.writeFile(contents);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporary, filename);
  } finally {
    await handle?.close();
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}
function envelope(workspace) {
  return {
    format: FORMAT,
    version: 1,
    revision: randomUUID(),
    savedAt: new Date().toISOString(),
    workspace: validateWorkspace(workspace),
  };
}
async function readEnvelope(folder) {
  let data;
  try {
    data = JSON.parse(
      await fs.readFile(path.join(folder, "workspace.json"), "utf8"),
    );
  } catch (e) {
    throw new StorageError(
      e.code === "ENOENT"
        ? "The workspace file is missing. Reconnect the correct folder, or restore a revision from history."
        : "The workspace file could not be read. Restore a backup or a revision from history.",
      422,
    );
  }
  if (
    data.format !== FORMAT ||
    data.version !== 1 ||
    typeof data.revision !== "string"
  )
    throw new StorageError(
      "This folder uses an unsupported workspace format.",
      422,
    );
  try {
    data.workspace = validateWorkspace(data.workspace);
  } catch {
    throw new StorageError(
      "This workspace contains invalid data. The file has not been changed.",
      422,
    );
  }
  return data;
}
export class FolderStore {
  constructor(configPath) {
    this.configPath = configPath;
    this.folder = null;
    this.selection = null;
    this.queue = Promise.resolve();
  }
  serial(task) {
    const result = this.queue.then(task);
    this.queue = result.catch(() => {});
    return result;
  }
  async status() {
    if (!this.folder) {
      try {
        const config = JSON.parse(await fs.readFile(this.configPath, "utf8"));
        if (config.folder) await this.open(config.folder, false);
      } catch (e) {
        if (e.code !== "ENOENT") return { connected: false, error: e.message };
      }
    }
    if (!this.folder) return { connected: false };
    try {
      return this.response(await readEnvelope(this.folder));
    } catch (e) {
      return { connected: false, path: this.folder, error: e.message };
    }
  }
  response(data) {
    return {
      connected: true,
      path: this.folder,
      selection: this.selection,
      ...data,
    };
  }
  async list(directory) {
    const target = await fs.realpath(directory || os.homedir());
    const entries = await fs.readdir(target, { withFileTypes: true });
    const roots =
      process.platform === "win32"
        ? await Promise.all(
            "CDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(async (letter) => {
              const drive = letter + ":\\";
              try {
                await fs.access(drive);
                return drive;
              } catch {
                return null;
              }
            }),
          ).then((items) => items.filter(Boolean))
        : ["/"];
    return {
      path: target,
      parent: path.dirname(target),
      roots,
      folders: entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b)),
    };
  }
  open(directory, remember = true) {
    return this.serial(async () => {
      if (typeof directory !== "string" || !path.isAbsolute(directory))
        throw new StorageError(
          "Enter an absolute folder path, or browse to a folder.",
        );
      const target = await fs.realpath(directory).catch(() => {
        throw new StorageError(
          "Folder not found. Create an empty folder first, then select it.",
        );
      });
      if (!(await fs.stat(target)).isDirectory())
        throw new StorageError("Choose a folder, not a file.");
      let data;
      const names = (await fs.readdir(target)).filter(
        (name) => ![".DS_Store", "Thumbs.db", "desktop.ini"].includes(name),
      );
      if (!names.length) {
        data = envelope(emptyWorkspace());
        await fs.mkdir(path.join(target, "history"), { mode: 0o700 });
        await fs.mkdir(path.join(target, "originals"), { mode: 0o700 });
        await atomicWrite(
          path.join(target, "history", data.revision + ".json"),
          JSON.stringify(data, null, 2),
        );
        await atomicWrite(
          path.join(target, "workspace.json"),
          JSON.stringify(data, null, 2),
        );
        await fs.writeFile(
          path.join(target, "README.txt"),
          "Folio portable data folder\nCopy this ENTIRE folder to move computers.\nworkspace.json is the current workspace; history/ keeps prior saves; originals/ keeps uploaded files.\nClose Folio before copying. Keep this folder private and backed up.\nTo recover, close Folio and copy a valid history/*.json file over workspace.json.\n",
          { flag: "wx", mode: 0o600 },
        );
      } else {
        if (!names.includes("workspace.json"))
          throw new StorageError(
            "Choose an empty folder or an existing Folio data folder. Nothing was changed.",
          );
        data = await readEnvelope(target);
        for (const name of ["history", "originals"]) {
          const info = await fs
            .lstat(path.join(target, name))
            .catch(() => null);
          if (!info?.isDirectory() || info.isSymbolicLink())
            throw new StorageError(
              "This Folio folder is incomplete or contains redirected storage folders.",
              422,
            );
        }
      }
      if (remember)
        await atomicWrite(this.configPath, JSON.stringify({ folder: target }));
      this.folder = target;
      this.selection = randomUUID();
      return this.response(data);
    });
  }
  assertSelection(selection) {
    if (!this.folder || selection !== this.selection)
      throw new StorageError(
        "The active folder changed. Reload to reconnect before saving; your edits are still open.",
        409,
      );
  }
  save(workspace, revision, selection) {
    return this.serial(async () => {
      this.assertSelection(selection);
      const normalized = validateWorkspace(workspace);
      const lockPath = path.join(this.folder, ".folio-write.lock");
      let lock;
      try {
        lock = await fs.open(lockPath, "wx", 0o600);
      } catch (e) {
        if (e.code === "EEXIST")
          throw new StorageError(
            "Another Folio process is saving. Try again. If it crashed, close Folio and remove .folio-write.lock from this folder.",
            409,
          );
        throw e;
      }
      try {
        const previous = await readEnvelope(this.folder);
        if (previous.revision !== revision)
          throw new StorageError(
            "Another tab or app changed this workspace. Export your edits before reloading; nothing was overwritten.",
            409,
          );
        await this.verifyOriginals(normalized);
        const data = envelope(normalized);
        const contents = JSON.stringify(data, null, 2);
        await atomicWrite(
          path.join(this.folder, "history", data.revision + ".json"),
          contents,
        );
        await atomicWrite(path.join(this.folder, "workspace.json"), contents);
        return this.response(data);
      } finally {
        await lock.close();
        await fs.rm(lockPath, { force: true });
      }
    });
  }
  async verifyOriginals(workspace) {
    const resumes = [
      ...workspace.resumes,
      ...workspace.applications.map((a) => a.resumeSnapshot),
    ];
    for (const resume of resumes)
      if (resume.original) {
        const location = this.originalPath(resume.original.id);
        const info = await fs.stat(location).catch(() => null);
        if (!info?.isFile() || info.size !== resume.original.size)
          throw new StorageError(
            "An original resume file is missing from this folder. Restore the full data folder before saving.",
            422,
          );
      }
  }
  originalPath(id) {
    if (!/^[a-f0-9]{64}\.(pdf|docx|txt)$/.test(id))
      throw new StorageError("Invalid original file identifier.");
    return path.join(this.folder, "originals", id);
  }
  addOriginal(filename, bytes, selection) {
    return this.serial(async () => {
      this.assertSelection(selection);
      await readEnvelope(this.folder);
      const extension = filename.split(".").pop()?.toLowerCase();
      if (
        !["pdf", "docx", "txt"].includes(extension) ||
        bytes.length > 15 * 1024 * 1024
      )
        throw new StorageError("Use a PDF, DOCX, or TXT file up to 15 MB.");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const id = sha256 + "." + extension;
      const target = this.originalPath(id);
      // Content-addressed filenames keep every original intact, including duplicate names.
      const existing = await fs.readFile(target).catch((e) => {
        if (e.code === "ENOENT") return null;
        throw e;
      });
      if (existing) {
        if (createHash("sha256").update(existing).digest("hex") !== sha256)
          throw new StorageError(
            "An archived original is damaged. Restore it from backup.",
            422,
          );
      } else await atomicWrite(target, bytes);
      return {
        id,
        filename: filename.split(/[\\/]/).pop(),
        size: bytes.length,
      };
    });
  }
  async getOriginal(id, selection) {
    this.assertSelection(selection);
    return fs.readFile(this.originalPath(id));
  }
}
