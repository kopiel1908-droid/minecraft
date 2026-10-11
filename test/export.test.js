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
    assert.equal(status.version, "0.4.30");
    assert.equal(status.ok, true);
    assert.ok(status.supportedTypes.includes("item"));
    assert.ok(status.supportedTypes.includes("item_set"));
    assert.ok(status.supportedTypes.includes("resource_pack"));
    assert.ok(status.supportedTypes.includes("block"));
  });

  await t.test("live icon preview is available in the UI", async () => {
    const pageResponse = await fetch(baseUrl);
    assert.equal(pageResponse.status, 200);
    const page = await pageResponse.text();
    assert.match(page, /id="iconPreview"/);
    assert.match(page, /id="previewLabel"/);
    assert.match(page, /data-preset="weapon"/);
    assert.match(page, /data-preset="potion"/);
    assert.match(page, /data-preset="relic"/);
    assert.match(page, /data-preset="block"/);
    const scriptResponse = await fetch(`${baseUrl}/app.js`);
    assert.equal(scriptResponse.status, 200);
    const script = await scriptResponse.text();
    assert.match(script, /function drawIconPreview\(\)/);
    assert.match(script, /addEventListener\("change", drawIconPreview\)/);
    assert.match(script, /putImageData\(image, 0, 0\)/);
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
        glint: true,
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
    const geometryPath = [...rp.keys()].find(name => /^models\/entity\/.+\.geo\.json$/.test(name));
    assert.ok(geometryPath, "Resource Pack nie ma geometrii modelu.");
    const geometry = JSON.parse(rp.get(geometryPath).toString("utf8"));
    assert.equal(geometry.format_version, "1.16.0");
    const bones = geometry["minecraft:geometry"][0].bones;
    assert.ok(bones.length > 0, "Geometria musi zawierać kość.");
    assert.ok(bones.some(bone => (bone.cubes || []).length > 0), "Geometria musi zawierać bryły.");
    for (const bone of bones) {
      for (const cube of bone.cubes || []) {
        assert.equal(cube.origin.length, 3);
        assert.equal(cube.size.length, 3);
        assert.ok(cube.uv && typeof cube.uv === "object", "Każda bryła musi mieć mapowanie UV Bedrock.");
        for (const face of ["north", "east", "south", "west", "up", "down"]) {
          assert.deepEqual(cube.uv[face].uv, [0, 0]);
          assert.deepEqual(cube.uv[face].uv_size, [16, 16]);
        }
        assert.ok(!JSON.stringify(cube).includes("#layer0"), "Geometria Bedrock nie powinna używać referencji tekstur Java.");
      }
    }
    const attachablePath = [...rp.keys()].find(name => /^attachables\/.+\.json$/.test(name));
    assert.ok(attachablePath, "Resource Pack nie ma definicji attachable.");
    const attachable = JSON.parse(rp.get(attachablePath).toString("utf8"))["minecraft:attachable"];
    assert.ok(attachable.description.identifier.startsWith("studio:"));
    assert.ok(attachable.description.geometry.default.startsWith("geometry."));
    assert.ok(attachable.description.textures.default.startsWith("textures/items/"));
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
    assert.equal(item.components["minecraft:glint"], true, "Efekt magicznego połysku nie został zapisany.");
    assert.equal(item.description.menu_category.category, "equipment", "Domyślna kategoria przedmiotu powinna być wyposażeniem.");
    assert.equal(item.components["minecraft:hand_equipped"], true, "Domyślnie przedmiot powinien być trzymany jak narzędzie.");
    const recipeName = [...bp.keys()].find(name => /^recipes\/.+\.json$/.test(name));
    assert.ok(recipeName, "Behavior Pack nie ma receptury craftingu.");
    const recipe = JSON.parse(bp.get(recipeName).toString("utf8"));
    assert.ok(recipe["minecraft:recipe_shapeless"].ingredients.some(item => item.item === "minecraft:diamond"), "Wybrany składnik receptury nie został zapisany.");
    assert.ok(recipe["minecraft:recipe_shapeless"].ingredients.some(item => item.item === "minecraft:stick"), "Domyślny drugi składnik receptury powinien być patykiem.");
    assert.equal(recipe["minecraft:recipe_shapeless"].result.count, 1, "Domyślna liczba sztuk z receptury powinna wynosić 1.");
  });
  await t.test("item use effect is encoded as a consumable status effect", async () => {
    const response = await fetch(`${baseUrl}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Eliksir szybkości", type: "item", itemEffect: "speed", effectDuration: 25, effectAmplifier: 2, cooldownSeconds: 12, enchantability: 17, enchantSlot: "sword", useAnimation: "drink" })
    });
    assert.equal(response.status, 200);
    const addon = readZipEntries(Buffer.from(await response.arrayBuffer()));
    const bpEntry = [...addon.entries()].find(([name]) => name.endsWith("-BP.mcpack"));
    const bp = readZipEntries(bpEntry[1]);
    const itemPath = [...bp.keys()].find(name => name.startsWith("items/") && name.endsWith(".json"));
    const components = JSON.parse(bp.get(itemPath).toString("utf8"))["minecraft:item"].components;
    assert.deepEqual(components["minecraft:food"].effects, [{ name: "speed", chance: 1, duration: 25, amplifier: 2 }]);
    assert.equal(components["minecraft:food"].can_always_eat, true);
    assert.equal(components["minecraft:use_modifiers"].use_duration, 1.6);
    assert.deepEqual(components["minecraft:cooldown"], { category: "studio:eliksir_szybkosci", duration: 12 });
    assert.deepEqual(components["minecraft:enchantable"], { value: 17, slot: "sword" });
    assert.equal(components["minecraft:use_animation"], "drink");
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
    const rune = await exportTexture("rune", "gold");
    assert.notDeepEqual(sword, crystal, "Styl kryształu powinien dawać inną teksturę niż miecz.");
    assert.notDeepEqual(crystal, orb, "Styl kuli powinien dawać inną teksturę niż kryształ.");
    assert.notDeepEqual(orb, rune, "Styl runiczny powinien różnić się od magicznej kuli.");
  });
  await t.test("item category and hand display are configurable", async () => {
    const response = await fetch(`${baseUrl}/api/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: "Kula mikstur testowa", type: "item", itemCategory: "nature", handEquipped: false }) });
    assert.equal(response.status, 200);
    const addon = readZipEntries(Buffer.from(await response.arrayBuffer()));
    const bpEntry = [...addon.entries()].find(([name]) => name.endsWith("-BP.mcpack"));
    const bp = readZipEntries(bpEntry[1]);
    const itemPath = [...bp.keys()].find(name => name.startsWith("items/") && name.endsWith(".json"));
    const item = JSON.parse(bp.get(itemPath).toString("utf8"))["minecraft:item"];
    assert.equal(item.description.menu_category.category, "nature");
    assert.equal(item.components["minecraft:hand_equipped"], false);
  });

  await t.test("shaped recipe uses a pattern and selected ingredients", async () => {
    const response = await fetch(`${baseUrl}/api/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: "Miecz z receptura ukladu", type: "item", recipeMaterial: "minecraft:diamond", recipeTool: "minecraft:blaze_rod", recipeType: "shaped" }) });
    assert.equal(response.status, 200);
    const addon = readZipEntries(Buffer.from(await response.arrayBuffer()));
    const bpEntry = [...addon.entries()].find(([name]) => name.endsWith("-BP.mcpack"));
    const bp = readZipEntries(bpEntry[1]);
    const recipePath = [...bp.keys()].find(name => name.startsWith("recipes/") && name.endsWith(".json"));
    const recipe = JSON.parse(bp.get(recipePath).toString("utf8"))["minecraft:recipe_shaped"];
    assert.deepEqual(recipe.pattern, ["AB"]);
    assert.equal(recipe.key.A.item, "minecraft:diamond");
    assert.equal(recipe.key.B.item, "minecraft:blaze_rod");
  });

  await t.test("second recipe ingredient is configurable and unsupported values fall back safely", async () => {
    async function getRecipe(recipeTool) {
      const response = await fetch(`${baseUrl}/api/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: "Test drugiego skladnika", type: "item", recipeTool }) });
      assert.equal(response.status, 200);
      const addon = readZipEntries(Buffer.from(await response.arrayBuffer()));
      const bpEntry = [...addon.entries()].find(([name]) => name.endsWith("-BP.mcpack"));
      const bp = readZipEntries(bpEntry[1]);
      const recipePath = [...bp.keys()].find(name => name.startsWith("recipes/") && name.endsWith(".json"));
      return JSON.parse(bp.get(recipePath).toString("utf8"))["minecraft:recipe_shapeless"];
    }
    const boneRecipe = await getRecipe("minecraft:bone");
    assert.ok(boneRecipe.ingredients.some(ingredient => ingredient.item === "minecraft:bone"));
    const safeRecipe = await getRecipe("minecraft:command_block");
    assert.ok(safeRecipe.ingredients.some(ingredient => ingredient.item === "minecraft:stick"), "Nieobsługiwana wartość powinna wrócić do domyślnego patyka.");
    assert.ok(!safeRecipe.ingredients.some(ingredient => ingredient.item === "minecraft:command_block"));
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


  await t.test("block export contains a block definition and terrain texture", async () => {
    const response = await fetch(`${baseUrl}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Blok ametystowy", type: "block", colorTheme: "void", blockHardness: 4.5, explosionResistance: 12, blockLight: 11, blockFriction: 0.15, blockSound: "glass" })
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200, bytes.toString("utf8").slice(0, 300));
    assert.match(response.headers.get("content-disposition") || "", /\.mcaddon/i);
    const addon = readZipEntries(bytes);
    const rpEntry = [...addon.entries()].find(([name]) => name.endsWith("-RP.mcpack"));
    const bpEntry = [...addon.entries()].find(([name]) => name.endsWith("-BP.mcpack"));
    assert.ok(rpEntry && bpEntry, "Blok powinien mieć Resource Pack i Behavior Pack.");
    const rp = readZipEntries(rpEntry[1]);
    const bp = readZipEntries(bpEntry[1]);
    assert.ok(rp.has("textures/terrain_texture.json"), "Brakuje atlasu tekstur bloków.");
    assert.ok(rp.has("blocks.json"), "Brakuje mapowania tekstury bloku.");
    assert.equal(JSON.parse(rp.get("blocks.json").toString("utf8"))["studio:blok_ametystowy"].sound, "glass", "Wybrany dźwięk bloku nie został zapisany.");
    assert.ok([...rp.keys()].some(name => name.startsWith("textures/blocks/") && name.endsWith(".png")), "Brakuje tekstury PNG bloku.");
    const blockPath = [...bp.keys()].find(name => name.startsWith("blocks/") && name.endsWith(".json"));
    assert.ok(blockPath, "Behavior Pack nie zawiera definicji bloku.");
    const block = JSON.parse(bp.get(blockPath).toString("utf8"))["minecraft:block"];
    assert.equal(block.description.identifier, "studio:blok_ametystowy");
    assert.equal(block.components["minecraft:material_instances"]["*"].texture, "blok_ametystowy");
    assert.equal(block.components["minecraft:destructible_by_mining"].seconds_to_destroy, 4.5);
    assert.equal(block.components["minecraft:destructible_by_explosion"].explosion_resistance, 12);
    assert.equal(block.components["minecraft:light_emission"], 11, "Emisja światła bloku nie została zapisana.");
    assert.equal(block.components["minecraft:friction"], 0.15, "Tarcie powierzchni bloku nie zostało zapisane.");
  });


  await t.test("block texture styles generate different PNG patterns", async () => {
    async function exportBlockTexture(blockTextureStyle) {
      const response = await fetch(`${baseUrl}/api/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Tekstura bloku testowego", type: "block", blockTextureStyle })
      });
      assert.equal(response.status, 200);
      const addon = readZipEntries(Buffer.from(await response.arrayBuffer()));
      const rpEntry = [...addon.entries()].find(([name]) => name.endsWith("-RP.mcpack"));
      assert.ok(rpEntry, "Brakuje Resource Pack.");
      const rp = readZipEntries(rpEntry[1]);
      const texturePath = [...rp.keys()].find(name => name.startsWith("textures/blocks/") && name.endsWith(".png"));
      assert.ok(texturePath, "Brakuje tekstury PNG bloku.");
      return rp.get(texturePath);
    }
    const crystal = await exportBlockTexture("crystal");
    const bricks = await exportBlockTexture("bricks");
    const ore = await exportBlockTexture("ore");
    const metal = await exportBlockTexture("metal");
    assert.notDeepEqual(crystal, bricks, "Wzór cegieł powinien różnić się od kryształu.");
    assert.notDeepEqual(bricks, ore, "Wzór rudy powinien różnić się od cegieł.");
    assert.notDeepEqual(ore, metal, "Metal powinien różnić się od rudy.");
  });

  await t.test("item set exports three items with six pack files", async () => {
    const response = await fetch(`${baseUrl}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Relikt burzy", type: "item_set", colorTheme: "emerald" })
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200, bytes.toString("utf8").slice(0, 300));
    assert.match(response.headers.get("content-disposition") || "", /zestaw-3-przedmiotow\.mcaddon/i);
    const addon = readZipEntries(bytes);
    const packs = [...addon.keys()].filter(name => name.endsWith(".mcpack"));
    assert.equal(packs.length, 6, "Zestaw powinien zawierać trzy pary Resource Pack i Behavior Pack.");
    assert.equal(packs.filter(name => name.endsWith("-RP.mcpack")).length, 3);
    assert.equal(packs.filter(name => name.endsWith("-BP.mcpack")).length, 3);
    const itemIds = [];
    for (const name of packs.filter(name => name.endsWith("-BP.mcpack"))) {
      const bp = readZipEntries(addon.get(name));
      const itemPath = [...bp.keys()].find(entry => entry.startsWith("items/") && entry.endsWith(".json"));
      assert.ok(itemPath, "Każdy Behavior Pack zestawu powinien zawierać przedmiot.");
      const item = JSON.parse(bp.get(itemPath).toString("utf8"))["minecraft:item"];
      itemIds.push(item.description.identifier);
      assert.ok([...bp.keys()].some(entry => entry.startsWith("recipes/") && entry.endsWith(".json")));
    }
    assert.equal(new Set(itemIds).size, 3, "Wszystkie trzy przedmioty muszą mieć różne identyfikatory.");
  });

  await t.test("rule-based prompt matching uses valid keyword patterns", async () => {
    const { readFile } = await import("node:fs/promises");
    const js = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
    assert.match(js, /\\\\b\\(ruda\\|blok/);
    assert.match(js, /set\\("colorTheme", "fire"/);
    assert.match(js, /set\\("itemEffect", "regeneration"/);
    assert.doesNotMatch(js, /\\\\\\\\b\\(ruda\\|blok/);
  });

  await t.test("UI exposes explicit rule-based prompt matching without auto-export", async () => {
    const { readFile } = await import("node:fs/promises");
    const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
    assert.match(html, /id="matchIdea"/);
    assert.match(html, /id="matchMessage"/);
    assert.match(js, /function matchIdeaToSettings\(\)/);
    assert.match(js, /To nie jest model AI/);
    assert.match(js, /addEventListener\("click", matchIdeaToSettings\)/);
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
        glint: "yes",
        blockLight: 99,
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
