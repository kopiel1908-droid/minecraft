import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { inflateRawSync } from "node:zlib";

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

function readZipEntries(buffer) {
  const entries = new Map();
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  assert.notEqual(eocd, -1, "Nie znaleziono końca archiwum ZIP.");
  const count = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50, "Nieprawidłowy wpis centralnego katalogu ZIP.");
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = inflateRawSync(compressed);
    else throw new Error(`Nieobsługiwana metoda kompresji ZIP: ${method}`);
    entries.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

test("AI Addon Studio smoke tests", async (t) => {
  server = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
    windowsHide: true
  });
  t.after(() => {
    if (server && server.exitCode === null) server.kill();
  });

  await waitForServer(server);

  await t.test("status endpoint responds with supported export types", async () => {
    const response = await fetch(`${baseUrl}/api/status`);
    const status = await response.json();
    assert.equal(response.status, 200);
    assert.equal(status.version, "0.4.2");
    assert.equal(status.ok, true);
    assert.ok(status.supportedTypes.includes("item"));
    assert.ok(status.supportedTypes.includes("resource_pack"));
  });

  await t.test("mcaddon contains valid resource and behavior pack files", async () => {
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

    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200, bytes.toString("utf8").slice(0, 300));
    assert.match(response.headers.get("content-disposition") || "", /\.mcaddon/i);
    assert.ok(bytes.length > 100, "Archiwum nie powinno być puste.");

    const addonEntries = readZipEntries(bytes);
    const rpEntry = [...addonEntries.entries()].find(([name]) => name.endsWith("-RP.mcpack"));
    const bpEntry = [...addonEntries.entries()].find(([name]) => name.endsWith("-BP.mcpack"));
    assert.ok(rpEntry, "W .mcaddon brakuje paczki Resource Pack.");
    assert.ok(bpEntry, "W .mcaddon brakuje paczki Behavior Pack.");

    const rp = readZipEntries(rpEntry[1]);
    const bp = readZipEntries(bpEntry[1]);
    assert.ok(rp.has("manifest.json"), "Resource Pack nie ma manifest.json.");
    assert.ok(rp.has("textures/item_texture.json"), "Resource Pack nie ma atlasu tekstur.");
    assert.ok([...rp.keys()].some(name => /^textures\/items\/.+\.png$/.test(name)), "Resource Pack nie ma tekstury PNG.");
    assert.ok(bp.has("manifest.json"), "Behavior Pack nie ma manifest.json.");
    assert.ok([...bp.keys()].some(name => /^items\/.+\.json$/.test(name)), "Behavior Pack nie ma definicji przedmiotu.");
    assert.ok([...bp.keys()].some(name => /^recipes\/.+\.json$/.test(name)), "Behavior Pack nie ma receptury craftingu.");
  });
});
