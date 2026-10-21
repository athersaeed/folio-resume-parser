import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { FolderStore } from "../server/folder-store.js";
import { createApi } from "../server/api.js";
import { blankResume } from "../src/parser.js";
import { emptyWorkspace } from "../src/storage.js";
import { createApplication } from "../src/applications.js";
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "folio-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const folder = path.join(root, "Folio Data");
  await fs.mkdir(folder);
  return { root, folder, config: path.join(root, "config.json") };
}
test("initializes an empty folder, saves revision history, and reconnects after restart", async (t) => {
  const { folder, config } = await fixture(t);
  const store = new FolderStore(config);
  const first = await store.open(folder);
  assert.equal(first.connected, true);
  const resume = { ...blankResume(), name: "Synthetic resume", reviewed: true };
  const result = await store.save(
    { ...emptyWorkspace(), resumes: [resume] },
    first.revision,
    first.selection,
  );
  assert.notEqual(result.revision, first.revision);
  const history = await fs.readdir(path.join(folder, "history"));
  assert.equal(history.length, 2);
  const old = JSON.parse(
    await fs.readFile(path.join(folder, "history", first.revision + ".json")),
  );
  assert.equal(old.workspace.resumes.length, 0);
  const restarted = await new FolderStore(config).status();
  assert.deepEqual(restarted.workspace, result.workspace);
});
test("a complete folder can move to a new computer without old paths or browser data", async (t) => {
  const { folder, root, config } = await fixture(t);
  const store = new FolderStore(config);
  const first = await store.open(folder);
  const bytes = Buffer.from("Synthetic original resume contents");
  const original = await store.addOriginal(
    "same-name.txt",
    bytes,
    first.selection,
  );
  const resume = { ...blankResume(), reviewed: true, name: "Role A", original };
  const application = createApplication(
    {
      company: "Synthetic",
      role: "Engineer",
      date: "2026-10-21",
      status: "Applied",
    },
    resume,
  );
  const saved = await store.save(
    {
      ...emptyWorkspace(),
      resumes: [resume],
      applications: [application],
      profile: { email: "example@example.test" },
    },
    first.revision,
    first.selection,
  );
  const moved = path.join(root, "New Computer");
  await fs.cp(folder, moved, { recursive: true });
  await fs.rm(folder, { recursive: true });
  const newStore = new FolderStore(path.join(root, "new-config.json"));
  const reopened = await newStore.open(moved);
  assert.deepEqual(reopened.workspace, saved.workspace);
  assert.deepEqual(
    await newStore.getOriginal(original.id, reopened.selection),
    bytes,
  );
  assert.equal(JSON.stringify(reopened.workspace).includes(folder), false);
});
test("archives same-named uploads independently and preserves originals after resume deletion", async (t) => {
  const { folder, config } = await fixture(t);
  const store = new FolderStore(config);
  const first = await store.open(folder);
  const one = await store.addOriginal(
    "resume.txt",
    Buffer.from("first content"),
    first.selection,
  );
  const two = await store.addOriginal(
    "resume.txt",
    Buffer.from("different content"),
    first.selection,
  );
  assert.notEqual(one.id, two.id);
  const again = await store.addOriginal(
    "resume.txt",
    Buffer.from("first content"),
    first.selection,
  );
  assert.equal(one.id, again.id);
  const resume = { ...blankResume(), reviewed: true, original: one };
  const saved = await store.save(
    { ...emptyWorkspace(), resumes: [resume] },
    first.revision,
    first.selection,
  );
  await store.save(emptyWorkspace(), saved.revision, first.selection);
  assert.equal(
    (await store.getOriginal(one.id, first.selection)).toString(),
    "first content",
  );
  assert.equal((await fs.readdir(path.join(folder, "originals"))).length, 2);
});
test("refuses nonempty unrelated folders and corrupted workspaces without modifying them", async (t) => {
  const { folder, config } = await fixture(t);
  const store = new FolderStore(config);
  await fs.writeFile(path.join(folder, "important.txt"), "keep");
  await assert.rejects(store.open(folder), /empty folder/);
  assert.deepEqual(await fs.readdir(folder), ["important.txt"]);
  await fs.rm(path.join(folder, "important.txt"));
  const first = await store.open(folder);
  await fs.writeFile(path.join(folder, "workspace.json"), "broken");
  await assert.rejects(
    store.save(emptyWorkspace(), first.revision, first.selection),
    /could not be read/,
  );
  assert.equal(
    await fs.readFile(path.join(folder, "workspace.json"), "utf8"),
    "broken",
  );
});
test("rejects stale revisions, switched folders, and missing disk storage without overwriting data", async (t) => {
  const { folder, root, config } = await fixture(t);
  const store = new FolderStore(config);
  const first = await store.open(folder);
  const current = await store.save(
    { ...emptyWorkspace(), profile: { name: "Newer" } },
    first.revision,
    first.selection,
  );
  await assert.rejects(
    store.save(
      { ...emptyWorkspace(), profile: { name: "Stale" } },
      first.revision,
      first.selection,
    ),
    /Another tab/,
  );
  assert.equal((await store.status()).workspace.profile.name, "Newer");
  const second = path.join(root, "second");
  await fs.mkdir(second);
  await store.open(second);
  await assert.rejects(
    store.save(emptyWorkspace(), current.revision, first.selection),
    /active folder changed/,
  );
  await fs.rm(second, { recursive: true });
  assert.equal((await store.status()).connected, false);
});
test("cross-process lock and missing original references prevent unsafe saves", async (t) => {
  const { folder, config } = await fixture(t);
  const store = new FolderStore(config);
  const first = await store.open(folder);
  await fs.writeFile(path.join(folder, ".folio-write.lock"), "");
  await assert.rejects(
    store.save(emptyWorkspace(), first.revision, first.selection),
    /Another Folio process/,
  );
  await fs.rm(path.join(folder, ".folio-write.lock"));
  const resume = {
    ...blankResume(),
    reviewed: true,
    original: {
      id: "a".repeat(64) + ".txt",
      filename: "missing.txt",
      size: 10,
    },
  };
  await assert.rejects(
    store.save(
      { ...emptyWorkspace(), resumes: [resume] },
      first.revision,
      first.selection,
    ),
    /original resume file is missing/,
  );
  assert.equal((await store.status()).revision, first.revision);
  assert.equal((await fs.readdir(folder)).includes(".folio-write.lock"), false);
});
test("API requires localhost, same-origin requests and a session token", async (t) => {
  const { folder, config } = await fixture(t);
  const api = createApi(config);
  const server = http.createServer((req, res) =>
    api(req, res, () => {
      res.writeHead(404);
      res.end();
    }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  assert.equal((await fetch(base + "/api/folders")).status, 403);
  const session = await (await fetch(base + "/api/session")).json();
  const headers = {
    "X-Folio-Token": session.token,
    "Content-Type": "application/json",
  };
  assert.equal(
    (
      await fetch(base + "/api/folder", {
        method: "POST",
        headers: { ...headers, Origin: "https://evil.example" },
        body: JSON.stringify({ path: folder }),
      })
    ).status,
    403,
  );
  const badHostStatus = await new Promise((resolve, reject) => {
    const request = http.get(
      base + "/api/session",
      { headers: { Host: "evil.example" } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.on("error", reject);
  });
  assert.equal(badHostStatus, 403);
  const opened = await (
    await fetch(base + "/api/folder", {
      method: "POST",
      headers,
      body: JSON.stringify({ path: folder }),
    })
  ).json();
  assert.equal(opened.connected, true);
  const saved = await (
    await fetch(base + "/api/workspace", {
      method: "PUT",
      headers: { ...headers, "X-Folio-Folder": opened.selection },
      body: JSON.stringify({
        workspace: emptyWorkspace(),
        revision: opened.revision,
      }),
    })
  ).json();
  assert.ok(saved.revision);
  assert.equal(
    (
      await fetch(base + "/api/workspace", {
        method: "PUT",
        headers: { ...headers, "X-Folio-Folder": opened.selection },
        body: JSON.stringify({
          workspace: emptyWorkspace(),
          revision: opened.revision,
        }),
      })
    ).status,
    409,
  );
});

test("a failed disk write leaves the current revision untouched and removes the write lock", async (t) => {
  const { folder, config } = await fixture(t);
  const store = new FolderStore(config);
  const first = await store.open(folder);
  await fs.rename(
    path.join(folder, "history"),
    path.join(folder, "history-held"),
  );
  await fs.writeFile(path.join(folder, "history"), "blocked");
  await assert.rejects(
    store.save(
      { ...emptyWorkspace(), profile: { name: "Unsaved" } },
      first.revision,
      first.selection,
    ),
  );
  assert.equal((await store.status()).revision, first.revision);
  assert.equal((await store.status()).workspace.profile.name, undefined);
  assert.equal((await fs.readdir(folder)).includes(".folio-write.lock"), false);
  await fs.rm(path.join(folder, "history"));
  await fs.rename(
    path.join(folder, "history-held"),
    path.join(folder, "history"),
  );
  const saved = await store.save(
    { ...emptyWorkspace(), profile: { name: "Saved after retry" } },
    first.revision,
    first.selection,
  );
  assert.equal(saved.workspace.profile.name, "Saved after retry");
});
