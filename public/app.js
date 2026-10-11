const $ = id => document.getElementById(id);
const description = $("description");
const button = $("export");
const message = $("message");
description.addEventListener("input", () => {
  $("count").textContent = `${description.value.length} / 3000`;
});
$("type").addEventListener("change", () => {
  button.textContent = $("type").value === "resource_pack" ? "Generuj paczkę zasobów ↓" : "Generuj dodatek ↓";
});
button.addEventListener("click", async () => {
  const value = description.value.trim();
  if (value.length < 5) {
    message.textContent = "Wpisz opis (minimum 5 znaków).";
    description.focus();
    return;
  }
  const damage = Number($("damage").value), stackSize = Number($("stackSize").value), durability = Number($("durability").value);
  if (!Number.isInteger(damage) || damage < 1 || damage > 20) { message.textContent = "Obrażenia muszą być liczbą całkowitą od 1 do 20."; $("damage").focus(); return; }
  if (!Number.isInteger(stackSize) || stackSize < 1 || stackSize > 64) { message.textContent = "Wielkość stosu musi być liczbą całkowitą od 1 do 64."; $("stackSize").focus(); return; }
  if (!Number.isInteger(durability) || durability < 0 || durability > 1000) { message.textContent = "Trwałość musi być liczbą całkowitą od 0 do 1000."; $("durability").focus(); return; }
  button.disabled = true;
  button.textContent = "Tworzę paczkę…";
  message.textContent = "Generuję pliki Minecraft Bedrock…";
  try {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: value, type: $("type").value, damage: Number($("damage").value), stackSize: Number($("stackSize").value), durability: Number($("durability").value), recipeMaterial: $("recipeMaterial").value, recipeCount: Number($("recipeCount").value), iconStyle: $("iconStyle").value, colorTheme: $("colorTheme").value })
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
    button.textContent = $("type").value === "resource_pack" ? "Generuj paczkę zasobów ↓" : "Generuj dodatek ↓";
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
