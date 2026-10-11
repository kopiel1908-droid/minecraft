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
    assert.equal(status.version, "0.4.10");
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
        stackSize: 1,
        durability: 321,
        rarity: "epic",
        recipeMaterial: "minecraft:diamond",
        iconStyle: "crystal",
        colorTheme: "fire"
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
    const textureName = [...rp.keys()].find(name => /^textures\/items\/.+\.png$/.test(name));
    const png = rp.get(textureName);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "Tekstura nie ma prawidłowego nagłówka PNG.");
    assert.ok(bp.has("manifest.json"), "Behavior Pack nie ma manifest.json.");
    assert.ok([...bp.keys()].some(name => /^items\/.+\.json$/.test(name)), "Behavior Pack nie ma definicji przedmiotu.");
    const itemPath = [...bp.keys()].find(name => /^items\/.+\.json$/.test(name));
    const item = JSON.parse(bp.get(itemPath).toString("utf8"))["minecraft:item"];
    assert.equal(item.components["minecraft:durability"].max_durability, 321, "Ustawiona trwałość nie została zapisana w definicji przedmiotu.");
    assert.equal(item.components["minecraft:rarity"].value, "epic", "Wybrana rzadkość nie została zapisana w definicji przedmiotu.");
    const recipeName = [...bp.keys()].find(name => /^recipes\/.+\.json$/.test(name));
    assert.ok(recipeName, "Behavior Pack nie ma receptury craftingu.");
    const recipe = JSON.parse(bp.get(recipeName).toString("utf8"));
    assert.ok(recipe["minecraft:recipe_shapeless"].ingredients.some(item => item.item === "minecraft:diamond"), "Wybrany składnik receptury nie został zapisany.");
    assert.equal(recipe["minecraft:recipe_shapeless"].result.count, 1, "Domyślna liczba sztuk z receptury powinna wynosić 1.");
  });
  await t.test("icon style and palette change the generated texture", async () => {
    async function exportTexture(iconStyle, colorTheme) {
      const response = await fetch(`${baseUrl}/api/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "Porownanie ikony testowej",
          type: "resource_pack",
          iconStyle,
          colorTheme
        })
      });
      assert.equal(response.status, 200);
      const archive = readZipEntries(Buffer.from(await response.arrayBuffer()));
      const texturePath = [...archive.keys()].find(name => /^textures\/items\/.+\.png$/.test(name));
      assert.ok(texturePath, "Eksport nie zawiera tekstury PNG.");
      return archive.get(texturePath);
    }
    const sword = await exportTexture("sword", "ice");
    const crystal = await exportTexture("crystal", "fire");
    const orb = await exportTexture("orb", "void");
    assert.notDeepEqual(sword, crystal, "Styl kryształu powinien dawać inną teksturę niż miecz.");
    assert.notDeepEqual(crystal, orb, "Styl kuli powinien dawać inną teksturę niż kryształ.");
  });
  await t.test("recipe output count is configurable and bounded", async () => {
    const response = await fetch(`${baseUrl}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Receptura z trzema sztukami", type: "item", recipeCount: 3 })
    });
    assert.equal(response.status, 200);
    const addon = readZipEntries(Buffer.from(await response.arrayBuffer()));
    const bpEntry = [...addon.entries()].find(([name]) => name.endsWith("-BP.mcpack"));
    assert.ok(bpEntry, "Nie znaleziono pliku Behavior Pack.");
    const bp = readZipEntries(bpEntry[1]);
    const recipePath = [...bp.keys()].find(name => name.startsWith("recipes/") && name.endsWith(".json"));
    assert.equal(JSON.parse(bp.get(recipePath).toString("utf8"))["minecraft:recipe_shapeless"].result.count, 3);
  });

  await t.test("rejects descriptions that are too short and unsupported project types", async () => {
    const shortResponse = await fetch(`${baseUrl}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "abc", type: "item" })
    });
    assert.equal(shortResponse.status, 400);
    assert.match((await shortResponse.json()).error, /minimum 5/i);

    const unsupportedResponse = await fetch(`${baseUrl}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Nowy mob testowy", type: "mob" })
    });
    assert.equal(unsupportedResponse.status, 400);
    assert.match((await unsupportedResponse.json()).error, /przygotowaniu/i);
  });

  await t.test("clamps extreme item settings to safe supported ranges", async () => {
    const response = await fetch(`${baseUrl}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "Test ograniczen parametrow",
        type: "item",
        damage: 999,
        stackSize: 999,
        durability: 99999,
        recipeCount: 99,
        rarity: "mythic",
        recipeMaterial: "minecraft:command_block"
      })
    });
    assert.equal(response.status, 200);
    const addon = readZipEntries(Buffer.from(await response.arrayBuffer()));
    const bpEntry = [...addon.entries()].find(([name]) => name.endsWith("-BP.mcpack"));
    assert.ok(bpEntry);
    const bp = readZipEntries(bpEntry[1]);
    const itemPath = [...bp.keys()].find(name => name.startsWith("items/") && name.endsWith(".json"));
    const item = JSON.parse(bp.get(itemPath).toString("utf8"))["minecraft:item"];
    assert.equal(item.components["minecraft:damage"], 20);
    assert.equal(item.components["minecraft:max_stack_size"], 64);
    assert.equal(item.components["minecraft:durability"].max_durability, 1000);
    assert.equal(item.components["minecraft:rarity"].value, "common");
    const recipePath = [...bp.keys()].find(name => name.startsWith("recipes/") && name.endsWith(".json"));
    const recipe = JSON.parse(bp.get(recipePath).toString("utf8"))["minecraft:recipe_shapeless"];
    assert.equal(recipe.result.count, 4);
    assert.ok(recipe.ingredients.some(ingredient => ingredient.item === "minecraft:iron_ingot"));
  });

});
