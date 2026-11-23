// Every Claude Code hook runs this with the hook's JSON on stdin. It passes the JSON to the local music server and
// never fails the session: no server, a slow server or odd input all end quietly. On SessionStart it starts the
// server if it is not running, and says where to listen if no page is open yet.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.AGENT_ANTHEM_PORT || 4777);
const BASE = `http://127.0.0.1:${PORT}`;
const ask = (path, init = {}) => fetch(BASE + path, { ...init, signal: AbortSignal.timeout(800) });

let body = "";
for await (const chunk of process.stdin) body += chunk;
let hook = {};
try { hook = JSON.parse(body || "{}"); } catch { process.exit(0); }

if (hook.hook_event_name === "SessionStart") {
  let health = await ask("/health").then(r => r.json()).catch(() => null);
  if (!health) {
    spawn(process.execPath, [fileURLToPath(new URL("./server.mjs", import.meta.url))], { detached: true, stdio: "ignore", env: { ...process.env, AGENT_ANTHEM_PORT: String(PORT) } }).unref();
    for (let i = 0; i < 10 && !health; i++) { await new Promise(r => setTimeout(r, 150)); health = await ask("/health").then(r => r.json()).catch(() => null); }
  }
  if (health && !health.listening) console.log(JSON.stringify({ systemMessage: `Agent Anthem is ready: open http://localhost:${PORT} to hear this session.` }));
} else {
  await ask("/event", { method: "POST", headers: { "Content-Type": "application/json" }, body }).catch(() => {});
}
process.exit(0);
