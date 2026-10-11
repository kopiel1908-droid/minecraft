import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 43127;
const baseUrl = `http://127.0.0.1:${port}`;
let server;

async function waitForServer(child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Serwer zakończył działanie przed startem.");
    try {
      const response = await fetch(`${baseUrl}/api/status`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("Serwer nie uruchomił się w ciągu 15 sekund.");
}

test("status endpoint responds with supported export types", async (t) => {
  server = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
    windowsHide: true
  });
  t.after(() => {
    if (server && server.exitCode === null) server.kill();
  });

  await waitForServer(server);
  const response = await fetch(`${baseUrl}/api/status`);
  const status = await response.json();
  assert.equal(response.status, 200);
  assert.equal(status.ok, true);
  assert.ok(status.supportedTypes.includes("item"));
  assert.ok(status.supportedTypes.includes("resource_pack"));
});

test("export endpoint returns a ZIP-based mcaddon for a generated item", async () => {
  const response = await fetch(`${baseUrl}/api/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      description: "Miecz slime testowy",
      type: "item",
      damage: 7,
      stackSize: 1
    })
  });

  assert.equal(response.status, 200, await response.text());
  assert.match(response.headers.get("content-disposition") || "", /\.mcaddon/i);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length > 100, "Archiwum nie powinno być puste.");
  assert.equal(bytes[0], 0x50, "Archiwum ZIP powinno zaczynać się od P.");
  assert.equal(bytes[1], 0x4b, "Archiwum ZIP powinno zaczynać się od PK.");
});
