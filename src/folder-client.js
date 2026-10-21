let token, selection, revision;
export async function session() {
  const response = await fetch("/api/session", { cache: "no-store" });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    throw new Error(
      "Could not connect to local storage. Start Folio with npm run dev or npm start.",
    );
  const result = await response.json();
  token = result.token;
  accept(result);
  return result;
}
function accept(result) {
  if (result.connected) {
    selection = result.selection;
    revision = result.revision;
  }
  return result;
}
async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "X-Folio-Token": token,
      "X-Folio-Folder": selection || "",
      ...options.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(
      result.error ||
        "Local storage is unavailable. Your changes have not been saved.",
    );
  }
  return response;
}
export async function listFolders(path = "") {
  return (
    await request("/api/folders?path=" + encodeURIComponent(path))
  ).json();
}
export async function openFolder(path) {
  return accept(
    await (
      await request("/api/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      })
    ).json(),
  );
}
export async function saveToFolder(workspace) {
  return accept(
    await (
      await request("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace, revision }),
      })
    ).json(),
  );
}
export async function archiveOriginal(file) {
  return (
    await request("/api/original?filename=" + encodeURIComponent(file.name), {
      method: "POST",
      body: file,
    })
  ).json();
}
export async function downloadOriginal(original) {
  const response = await request("/api/original/" + original.id);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = original.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
