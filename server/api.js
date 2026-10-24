import { randomBytes } from "node:crypto";
import { FolderStore, StorageError } from "./folder-store.js";
import { configuredModel, llmParse } from "./llm-parse.js";
import { redactContact } from "./redact.js";

// Profile values the client may pass for exact-match redaction.
const KNOWN_FIELDS = ["name", "email", "phone", "linkedin", "website"];
function llmInput(data) {
  if (typeof data?.text !== "string" || !data.text.trim())
    throw new StorageError("No resume text to parse.", 400);
  const known = Object.fromEntries(
    KNOWN_FIELDS.filter((k) => typeof data.known?.[k] === "string").map((k) => [
      k,
      data.known[k],
    ]),
  );
  return { text: data.text, known };
}
export function createApi(configPath) {
  const store = new FolderStore(configPath),
    token = randomBytes(32).toString("hex");
  async function body(req, limit = 50 * 1024 * 1024) {
    let size = 0;
    const parts = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw new StorageError("Request is too large.", 413);
      parts.push(chunk);
    }
    return Buffer.concat(parts);
  }
  return async function api(req, res, next) {
    if (!req.url?.startsWith("/api/")) return next();
    const json = (status, value) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(JSON.stringify(value));
    };
    try {
      const host = req.headers.host || "";
      if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host))
        throw new StorageError("Localhost access only.", 403);
      if (req.headers.origin && req.headers.origin !== `http://${host}`)
        throw new StorageError("Cross-origin access is not allowed.", 403);
      if (req.headers["sec-fetch-site"] === "cross-site")
        throw new StorageError("Cross-site access is not allowed.", 403);
      const url = new URL(req.url, `http://${host}`);
      if (url.pathname === "/api/session" && req.method === "GET")
        return json(200, { token, ...(await store.status()) });
      if (req.headers["x-folio-token"] !== token)
        throw new StorageError(
          "Reconnect the app to this localhost server.",
          403,
        );
      const selection = req.headers["x-folio-folder"];
      if (url.pathname === "/api/folders" && req.method === "GET")
        return json(200, await store.list(url.searchParams.get("path")));
      if (url.pathname === "/api/folder" && req.method === "POST") {
        const data = JSON.parse(await body(req));
        return json(200, await store.open(data.path));
      }
      if (url.pathname === "/api/workspace" && req.method === "PUT") {
        const data = JSON.parse(await body(req));
        return json(
          200,
          await store.save(data.workspace, data.revision, selection),
        );
      }
      if (url.pathname === "/api/original" && req.method === "POST")
        return json(
          200,
          await store.addOriginal(
            url.searchParams.get("filename") || "",
            await body(req, 15 * 1024 * 1024),
            selection,
          ),
        );
      if (url.pathname.startsWith("/api/original/") && req.method === "GET") {
        const bytes = await store.getOriginal(
          url.pathname.slice("/api/original/".length),
          selection,
        );
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Length": bytes.length,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        return res.end(bytes);
      }
      // Optional AI parsing. The OpenRouter key stays in this process; the browser
      // only learns whether one is configured. Preview never leaves the machine.
      if (url.pathname === "/api/llm/status" && req.method === "GET") {
        return json(200, {
          configured: Boolean(process.env.OPENROUTER_API_KEY),
          model: configuredModel().id,
        });
      }
      if (url.pathname === "/api/llm/preview" && req.method === "POST") {
        const { text, known } = llmInput(
          JSON.parse(await body(req, 2 * 1024 * 1024)),
        );
        const preview = redactContact(text, known);
        return json(200, { text: preview.text, counts: preview.counts });
      }
      if (url.pathname === "/api/llm/parse" && req.method === "POST") {
        const { text, known } = llmInput(
          JSON.parse(await body(req, 2 * 1024 * 1024)),
        );
        const model = configuredModel();
        try {
          const result = await llmParse(text, {
            model: model.id,
            reasoning: model.reasoning,
            temperature: model.temperature,
            apiKey: process.env.OPENROUTER_API_KEY,
            known,
          });
          return json(200, {
            model: model.id,
            resume: result.resume,
            rejected: result.rejected.length,
            redactions: result.redactions,
            cost: Number(result.usage?.cost) || 0,
            ms: Math.round(result.ms),
          });
        } catch (e) {
          throw new StorageError(`AI parsing failed: ${e.message}`, 502);
        }
      }
      throw new StorageError("Unknown storage operation.", 404);
    } catch (e) {
      json(e.status || 400, {
        error: e instanceof SyntaxError ? "Invalid request data." : e.message,
      });
    }
  };
}
