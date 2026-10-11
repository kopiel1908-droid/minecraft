const $ = id => document.getElementById(id);
const description = $("description");
const button = $("export");
const message = $("message");

function drawIconPreview() {
  const canvas = $("iconPreview");
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const image = context.createImageData(16, 16);
  const style = $("iconStyle").value;
  const palettes = {
    ice: [70, 175, 235],
    fire: [235, 82, 45],
    emerald: [45, 190, 115],
    void: [160, 90, 230],
    gold: [235, 185, 55]
  };
  const base = palettes[$("colorTheme").value] || palettes.ice;
  const set = (x, y, color) => {
    if (x < 0 || x >= 16 || y < 0 || y >= 16) return;
    const i = (y * 16 + x) * 4;
    image.data[i] = color[0];
    image.data[i + 1] = color[1];
    image.data[i + 2] = color[2];
    image.data[i + 3] = 255;
  };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) set(x, y, [22, 29, 37]);
  if (style === "rune") {
    for (let i = 3; i <= 12; i++) { set(8, i, base); set(i, 8, base); }
    for (const [x, y] of [[8,3],[7,4],[9,4],[6,5],[10,5],[5,6],[11,6],[4,8],[12,8],[5,10],[11,10],[6,11],[10,11],[7,12],[9,12]]) set(x, y, base);
    for (const [x, y] of [[7,7],[8,7],[7,8],[8,8]]) set(x, y, [245,250,255]);
    for (const [x, y] of [[7,13],[8,13],[7,14],[8,14]]) set(x, y, [240,196,100]);
  } else if (style === "crystal") {
    for (let y = 3; y <= 12; y++) {
      const half = Math.floor((y <= 7 ? y - 2 : 13 - y) / 2);
      for (let x = 8 - half; x <= 8 + half; x++) set(x, y, base);
    }
    for (let y = 4; y <= 8; y++) set(8, y, [220,248,255]);
    for (let x = 6; x <= 10; x++) set(x, 13, [170,220,245]);
    for (let x = 7; x <= 9; x++) set(x, 14, [170,220,245]);
  } else if (style === "orb") {
    for (let y = 3; y <= 12; y++) for (let x = 3; x <= 12; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      if (dx * dx + dy * dy <= 23) set(x, y, base);
    }
    for (const [x, y] of [[5,5],[6,5],[5,6]]) set(x, y, [245,250,255]);
    set(9, 10, [25,45,70]);
    for (const [x, y] of [[7,13],[8,13],[7,14],[8,14]]) set(x, y, [240,196,100]);
  } else {
    for (let i = 0; i < 8; i++) { set(12-i, 2+i, [210,242,255]); set(11-i, 2+i, [120,207,244]); }
    for (let i = 0; i < 4; i++) { set(5-i, 10+i, base); set(6-i, 10+i, base); }
    for (let x = 3; x < 9; x++) set(x, 9, [240,196,100]);
    set(3, 13, [190,140,90]); set(4, 14, [190,140,90]); set(2, 12, [190,140,90]);
  }
  context.putImageData(image, 0, 0);
  const styleName = $("iconStyle").selectedOptions[0].textContent.trim();
  const colorName = $("colorTheme").selectedOptions[0].textContent.trim();
  $("previewLabel").textContent = `${styleName} • ${colorName}`;
  canvas.setAttribute("aria-label", `Podgląd tekstury: ${styleName}, ${colorName}`);
}
$("iconStyle").addEventListener("change", drawIconPreview);
$("colorTheme").addEventListener("change", drawIconPreview);
drawIconPreview();

const presets = {
  weapon: {
    description: "Miecz kryształowy mrozu",
    type: "item", damage: 12, stackSize: 1, durability: 650,
    rarity: "rare", glint: true, itemCategory: "equipment", handEquipped: true,
    iconStyle: "crystal", colorTheme: "ice", itemEffect: "none",
    recipeMaterial: "minecraft:diamond", recipeTool: "minecraft:stick",
    recipeType: "shaped", recipeCount: 1, cooldownSeconds: 0,
    enchantability: 18, enchantSlot: "sword", useAnimation: "default"
  },
  potion: {
    description: "Eliksir regeneracji",
    type: "item", damage: 1, stackSize: 16, durability: 0,
    rarity: "uncommon", glint: true, itemCategory: "items", handEquipped: false,
    iconStyle: "orb", colorTheme: "emerald", itemEffect: "regeneration",
    effectDuration: 30, effectAmplifier: 1, recipeMaterial: "minecraft:slime_ball",
    recipeTool: "minecraft:amethyst_shard", recipeType: "shapeless", recipeCount: 1,
    cooldownSeconds: 5, enchantability: 0, enchantSlot: "sword", useAnimation: "drink"
  },
  relic: {
    description: "Epicki relikt pustki",
    type: "item", damage: 8, stackSize: 1, durability: 900,
    rarity: "epic", glint: true, itemCategory: "equipment", handEquipped: false,
    iconStyle: "rune", colorTheme: "void", itemEffect: "night_vision",
    effectDuration: 20, effectAmplifier: 0, recipeMaterial: "minecraft:amethyst_shard",
    recipeTool: "minecraft:blaze_rod", recipeType: "shaped", recipeCount: 1,
    cooldownSeconds: 10, enchantability: 25, enchantSlot: "all", useAnimation: "default"
  },
  block: {
    description: "Świecąca ruda szmaragdowa",
    type: "block", damage: 7, stackSize: 64, durability: 0,
    rarity: "rare", glint: false, itemCategory: "nature", handEquipped: false,
    iconStyle: "crystal", colorTheme: "emerald", itemEffect: "none",
    recipeMaterial: "minecraft:iron_ingot", recipeTool: "minecraft:stick",
    recipeType: "shapeless", recipeCount: 1, blockHardness: 3,
    explosionResistance: 8, blockLight: 12, blockFriction: 0.6,
    blockSound: "stone", blockTextureStyle: "ore"
  }
};
document.querySelectorAll("[data-preset]").forEach(button => {
  button.addEventListener("click", () => {
    const preset = presets[button.dataset.preset];
    if (!preset) return;
    for (const [id, value] of Object.entries(preset)) {
      const field = $(id);
      if (!field) continue;
      if (field.type === "checkbox") field.checked = Boolean(value);
      else field.value = String(value);
    }
    $("blockSettings").hidden = preset.type !== "block";
    $("count").textContent = `${description.value.length} / 3000`;
    $("export").textContent = preset.type === "block" ? "Generuj blok ↓" : "Generuj dodatek ↓";
    drawIconPreview();
    $("presetMessage").textContent = `Ustawiono szablon: ${button.textContent.trim()}. Możesz edytować każde pole przed eksportem.`;
    message.textContent = "";
    description.focus();
  });
});
description.addEventListener("input", () => {
  $("count").textContent = `${description.value.length} / 3000`;
});
$("type").addEventListener("change", () => {
  button.textContent = $("type").value === "resource_pack" ? "Generuj paczkę zasobów ↓" : $("type").value === "block" ? "Generuj blok ↓" : $("type").value === "item_set" ? "Generuj zestaw 3 przedmiotów ↓" : "Generuj dodatek ↓";
  $("blockSettings").hidden = $("type").value !== "block";
});
button.addEventListener("click", async () => {
  const value = description.value.trim();
  if (value.length < 5) {
    message.textContent = "Wpisz opis (minimum 5 znaków).";
    description.focus();
    return;
  }
  const damage = Number($("damage").value), stackSize = Number($("stackSize").value), durability = Number($("durability").value), blockHardness = Number($("blockHardness").value), explosionResistance = Number($("explosionResistance").value), blockLight = Number($("blockLight").value), blockFriction = Number($("blockFriction").value), blockSound = $("blockSound").value, blockTextureStyle = $("blockTextureStyle").value;
  if (!Number.isInteger(damage) || damage < 1 || damage > 20) { message.textContent = "Obrażenia muszą być liczbą całkowitą od 1 do 20."; $("damage").focus(); return; }
  if (!Number.isInteger(stackSize) || stackSize < 1 || stackSize > 64) { message.textContent = "Wielkość stosu musi być liczbą całkowitą od 1 do 64."; $("stackSize").focus(); return; }
  if (!Number.isInteger(durability) || durability < 0 || durability > 1000) { message.textContent = "Trwałość musi być liczbą całkowitą od 0 do 1000."; $("durability").focus(); return; }
  if (!Number.isFinite(blockHardness) || blockHardness < 0.1 || blockHardness > 10) { message.textContent = "Twardość bloku musi wynosić od 0,1 do 10."; $("blockHardness").focus(); return; }
  if (!Number.isFinite(explosionResistance) || explosionResistance < 0 || explosionResistance > 1200) { message.textContent = "Odporność na wybuch musi wynosić od 0 do 1200."; $("explosionResistance").focus(); return; }
  if (!Number.isInteger(blockLight) || blockLight < 0 || blockLight > 15) { message.textContent = "Emisja światła musi być liczbą całkowitą od 0 do 15."; $("blockLight").focus(); return; }
  if (!Number.isFinite(blockFriction) || blockFriction < 0 || blockFriction > 1) { message.textContent = "Tarcie musi wynosić od 0 do 1."; $("blockFriction").focus(); return; }
  button.disabled = true;
  button.textContent = "Tworzę paczkę…";
  message.textContent = "Generuję pliki Minecraft Bedrock…";
  try {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: value, type: $("type").value, damage: Number($("damage").value), stackSize: Number($("stackSize").value), durability: Number($("durability").value), rarity: $("rarity").value, glint: $("glint").checked, recipeMaterial: $("recipeMaterial").value, recipeTool: $("recipeTool").value, recipeType: $("recipeType").value, recipeCount: Number($("recipeCount").value), itemCategory: $("itemCategory").value, handEquipped: $("handEquipped").checked, iconStyle: $("iconStyle").value, colorTheme: $("colorTheme").value, blockHardness: Number($("blockHardness").value), explosionResistance: Number($("explosionResistance").value), blockLight: Number($("blockLight").value), blockFriction: Number($("blockFriction").value), blockSound, blockTextureStyle, itemEffect: $("itemEffect").value, effectDuration: Number($("effectDuration").value), effectAmplifier: Number($("effectAmplifier").value), cooldownSeconds: Number($("cooldownSeconds").value), enchantability: Number($("enchantability").value), enchantSlot: $("enchantSlot").value, useAnimation: $("useAnimation").value })
    });
    if (!response.ok) {
      let error = {};
      try { error = await response.json(); } catch {}
      throw new Error(error.error || "Eksport nie powiódł się.");
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] || "ai-addon.mcaddon";
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    message.textContent = `Gotowe: ${filename}. To wczesny prototyp; sprawdź paczkę w swojej wersji Minecraft Bedrock.`;
  } catch (error) {
    message.textContent = error.message || "Nieznany błąd.";
  } finally {
    button.disabled = false;
    button.textContent = $("type").value === "resource_pack" ? "Generuj paczkę zasobów ↓" : $("type").value === "block" ? "Generuj blok ↓" : $("type").value === "item_set" ? "Generuj zestaw 3 przedmiotów ↓" : "Generuj dodatek ↓";
  }
});
async function checkStatus() {
  try {
    const response = await fetch("/api/status");
    const data = await response.json();
    if (!data.ok) throw new Error("offline");
  } catch {
    document.querySelector(".status").innerHTML = '<span class="dot dot-error"></span> status nieznany';
  }
}
checkStatus();
