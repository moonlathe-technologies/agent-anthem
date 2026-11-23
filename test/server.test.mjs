import { test } from "node:test";
import http from "node:http";
import assert from "node:assert/strict";
import { classify, failed, localHost, publicFile, createServer } from "../server.mjs";

const bash = (stdout, extra = {}) => ({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_response: { stdout, stderr: "", ...extra } });

test("each hook becomes the moment the music cares about", () => {
  assert.deepEqual(classify({ hook_event_name: "UserPromptSubmit", prompt: "secret" }), { kind: "prompt" }, "the prompt text is never kept");
  assert.deepEqual(classify({ hook_event_name: "PreToolUse", tool_name: "Edit" }), { kind: "tool", tool: "Edit" });
  assert.deepEqual(classify({ hook_event_name: "PostToolUseFailure", tool_name: "Bash" }), { kind: "fail", tool: "Bash" });
  assert.deepEqual(classify({ hook_event_name: "Stop" }), { kind: "done" });
  assert.deepEqual(classify({ hook_event_name: "Notification" }), { kind: "waiting" });
  assert.equal(classify({ hook_event_name: "PostToolUse", tool_name: "Read", tool_response: { content: "FAIL" } }), null, "only Bash output is read for failures");
});

// Passing test runs print "0 failed" and "# fail 0"; those must not turn the music minor.
test("a failure is a non-zero count, an exit code, or an error flag", () => {
  for (const ok of ["# pass 300\n# fail 0", "Tests: 0 failed, 12 passed", "all good"]) assert.equal(failed(bash(ok)), false, ok);
  for (const bad of ["Tests: 2 failed, 10 passed", "# fail 1", "not ok 3 - thing", "FAIL src/a.test.js"]) assert.equal(failed(bash(bad)), true, bad);
  assert.equal(failed(bash("", { exit_code: 1 })), true);
  assert.equal(failed(bash("", { interrupted: true })), true);
  assert.equal(failed({ tool_name: "Edit", tool_response: { is_error: true } }), true);
});

test("only this machine may talk to the server", () => {
  for (const h of ["localhost:4777", "127.0.0.1:4777", "[::1]:4777", "localhost"]) assert.ok(localHost(h), h);
  for (const h of ["evil.example:4777", "localhost.evil.example", "", undefined]) assert.ok(!localHost(h), String(h));
});

test("public files follow a strict pattern, so no path can climb out", () => {
  assert.equal(publicFile("/"), "index.html");
  assert.equal(publicFile("/music.js"), "music.js");
  assert.equal(publicFile("/samples/piano/Ds4.mp3"), "samples/piano/Ds4.mp3");
  for (const bad of ["/../server.mjs", "/samples/../../hook.mjs", "/server.mjs", "/samples/piano/x.mp3", "/.git/config"]) assert.equal(publicFile(bad), null, bad);
});

test("events reach the page, history keeps the latest session, strangers are refused", async () => {
  const server = createServer().listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = hook => fetch(`${base}/event`, { method: "POST", body: JSON.stringify(hook) });
  try {
    assert.deepEqual(await (await fetch(`${base}/health`)).json(), { ok: true, listening: false });
    const stream = await fetch(`${base}/events`);
    const reader = stream.body.getReader();
    await reader.read(); // the hello
    assert.equal((await (await fetch(`${base}/health`)).json()).listening, true);
    await post({ hook_event_name: "PreToolUse", tool_name: "Bash", session_id: "a", cwd: "/home/me/shop" });
    const heard = new TextDecoder().decode((await reader.read()).value);
    assert.match(heard, /"kind":"tool".*"session":"a".*"project":"shop"/);
    await post({ hook_event_name: "Stop", session_id: "b", cwd: "C:\\work\\blog" });
    const latest = await (await fetch(`${base}/history`)).json();
    assert.deepEqual(latest.map(e => [e.kind, e.project]), [["done", "blog"]], "the most recent session only, Windows paths too");
    // fetch will not send a made-up Host, so ask the way a rebinding page's browser would.
    const status = await new Promise(r => http.get({ host: "127.0.0.1", port: server.address().port, path: "/history", headers: { Host: "evil.example:4777" } }, res => { res.resume(); r(res.statusCode); }));
    assert.equal(status, 403);
    await reader.cancel();
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
