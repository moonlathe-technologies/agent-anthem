// The local music server. Claude Code hooks POST their JSON to /event (through hook.mjs), and the page in the
// browser hears each one over /events and changes the music. It listens on 127.0.0.1 only and keeps nothing on
// disk: the session history lives in memory for "your session as a song".
import http from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const PORT = Number(process.env.SESSION_MUSIC_PORT || 4777);
const PUBLIC = new URL("./public/", import.meta.url);
const TYPES = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", mp3: "audio/mpeg", svg: "image/svg+xml" };
const HISTORY_MAX = 50000;

// Bash output that says tests or a command failed. "0 failed" and "# fail 0" are passes, so only non-zero counts count.
const FAILED_OUTPUT = /\b[1-9]\d* (failed|failing)\b|# fail [1-9]|\bnot ok \d|\bFAIL\b/;

export function failed(hook) {
  const r = hook.tool_response;
  if (!r || typeof r !== "object") return false;
  if (r.is_error === true || r.isError === true || r.interrupted === true) return true;
  if (hook.tool_name !== "Bash") return false;
  if (Number(r.exit_code ?? r.exitCode ?? 0) !== 0) return true;
  return FAILED_OUTPUT.test(`${r.stdout ?? ""}\n${r.stderr ?? ""}`);
}

// What the music cares about: you asked, it is working, something failed, it finished, it is waiting on you.
export function classify(hook) {
  switch (hook.hook_event_name) {
    case "UserPromptSubmit": return { kind: "prompt" };
    case "PreToolUse": return { kind: "tool", tool: hook.tool_name };
    case "PostToolUse": return failed(hook) ? { kind: "fail", tool: hook.tool_name } : null;
    case "PostToolUseFailure": return { kind: "fail", tool: hook.tool_name };
    case "Stop": return { kind: "done" };
    case "Notification": return { kind: "waiting" };
    default: return null;
  }
}

// Only this machine, by name: a web page that points its own domain at 127.0.0.1 (DNS rebinding) is turned away.
export const localHost = host => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host ?? "");

// Public files: the page, its scripts and the instrument samples, by a strict pattern so no path can climb out.
export const publicFile = path => {
  const name = path === "/" ? "index.html" : path.slice(1);
  return /^([a-z0-9-]+\.(html|js|css|svg)|samples\/[a-z-]+\/[A-G]s?\d\.mp3)$/.test(name) ? name : null;
};

export function createServer() {
  const listeners = new Set(), history = [];
  const send = event => { for (const res of listeners) res.write(`data: ${JSON.stringify(event)}\n\n`); };

  return http.createServer(async (req, res) => {
    if (!localHost(req.headers.host)) return res.writeHead(403).end();
    const url = new URL(req.url, "http://localhost");
    if (req.method === "POST" && url.pathname === "/event") {
      let body = "";
      for await (const chunk of req) body += chunk;
      res.writeHead(204).end();
      try {
        const hook = JSON.parse(body || "{}");
        const event = classify(hook);
        if (!event) return;
        const full = { ...event, session: hook.session_id ?? "", project: String(hook.cwd ?? "").split(/[\\/]/).pop(), at: Date.now() };
        history.push(full);
        if (history.length > HISTORY_MAX) history.splice(0, history.length - HISTORY_MAX);
        send(full);
      } catch { /* a hook sent something odd; the music carries on */ }
      return;
    }
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, listening: listeners.size > 0 }));
    }
    // The events of one session: the one asked for, or the session heard from most recently.
    if (url.pathname === "/history") {
      const session = url.searchParams.get("session") || history.at(-1)?.session;
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(history.filter(e => e.session === session)));
    }
    if (url.pathname === "/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      res.write(": hello\n\n");
      listeners.add(res);
      req.on("close", () => listeners.delete(res));
      return;
    }
    const name = publicFile(url.pathname);
    if (!name) return res.writeHead(404).end();
    try {
      const body = await readFile(new URL(name, PUBLIC));
      res.writeHead(200, { "Content-Type": TYPES[name.split(".").pop()], "Cache-Control": name.startsWith("samples/") ? "max-age=31536000" : "no-store" }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer()
    .on("error", e => { if (e.code !== "EADDRINUSE") throw e; }) // another session started it first: fine
    .listen(PORT, "127.0.0.1", () => console.log(`Session Music on http://localhost:${PORT}`));
}
