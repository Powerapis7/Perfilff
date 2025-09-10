import express from "express";
import axios from "axios";
import Canvas, { loadImage } from "canvas";

const app = express();
const PORT = 3000;

// helper: baixa item do ItemID2 (retorna Buffer) com fallback CDN
async function baixarItemBuffer(itemId, tipo = "Item") {
  try {
    console.log(`🔍 [${tipo}] buscando item ${itemId}`);
    const { data: items } = await axios.get("https://0xme.github.io/ItemID2/assets/itemData.json");
    const item = items.find(i => String(i.itemID) === String(itemId));
    if (!item) {
      console.log(`⚠️ [${tipo}] item ${itemId} não encontrado no itemData`);
      return null;
    }
    const { data: cdnList } = await axios.get("https://0xme.github.io/ItemID2/assets/cdn.json");
    const cdn_img_json = cdnList.reduce((acc, cur) => Object.assign(acc, cur), {});
    let url = `https://raw.githubusercontent.com/0xme/ff-resources/refs/heads/main/pngs/300x300/${item.icon}.png`;
    try {
      await axios.head(url);
    } catch {
      const fb = cdn_img_json[itemId];
      if (!fb) {
        console.log(`❌ [${tipo}] sem fallback pra ${itemId}`);
        return null;
      }
      url = fb;
      console.log(`⚠️ [${tipo}] usando fallback: ${url}`);
    }
    const res = await axios.get(url, { responseType: "arraybuffer" });
    console.log(`📥 [${tipo}] baixado ${itemId}`);
    return Buffer.from(res.data);
  } catch (err) {
    console.error(`❌ Erro baixar ${itemId}: ${err.message}`);
    return null;
  }
}

// parse clothesImage -> array de ids
function parseClothesIds(clothesImage) {
  if (!clothesImage) return [];
  const s = String(clothesImage);
  const m = s.match(/ids=([0-9,]+)/);
  if (m) return m[1].split(",").map(x => x.trim()).filter(Boolean);
  if (s.includes(",")) return s.split(",").map(x => x.trim()).filter(Boolean);
  if (/^\d+$/.test(s.trim())) return [s.trim()];
  return [];
}

// desenha hex (com imagem) — imagem preenchendo mais que o hex (scaleFactor)
async function drawHex(ctx, x, y, r, imgBuffer, options = {}) {
  try {
    const img = await loadImage(imgBuffer);
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const px = x + r * Math.cos((Math.PI / 3) * i);
      const py = y + r * Math.sin((Math.PI / 3) * i);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();

    // sombra suave
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;

    // fundo levemente escuro
    ctx.fillStyle = "#2a0000";
    ctx.fill();

    // clip e desenha imagem maior que o hex
    ctx.clip();
    const scaleFactor = options.scaleFactor ?? 1.15;
    const drawW = r * 2 * scaleFactor;
    const drawH = r * 2 * scaleFactor;
    ctx.drawImage(img, x - drawW/2, y - drawH/2, drawW, drawH);
    ctx.restore();

    // contorno
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const px = x + r * Math.cos((Math.PI / 3) * i);
      const py = y + r * Math.sin((Math.PI / 3) * i);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.lineWidth = Math.max(4, r * 0.08);
    ctx.strokeStyle = "#FFD700";
    ctx.stroke();
  } catch (err) {
    console.error("❌ drawHex erro:", err.message);
  }
}

app.get("/outfit", async (req, res) => {
  try {
    const playerId = req.query.id;
    if (!playerId) return res.status(400).json({ error: "ID necessário" });

    console.log(`\n🔹 Gerando outfit para ID: ${playerId}`);

    const resp = await axios.get(`https://world-ecletix.onrender.com/api/infoff2?id=${playerId}`);
    const data = resp.data || {};
    const basicInfo = data.basicInfo || {};
    const profileInfo = data.profileInfo || {};
    const petInfo = data.petInfo || profileInfo?.petInfo || {};

    const weapons =
      (profileInfo.weaponSkinShows && profileInfo.weaponSkinShows.length) ? profileInfo.weaponSkinShows
      : (basicInfo.weaponSkinShows && basicInfo.weaponSkinShows.length) ? basicInfo.weaponSkinShows
      : (data.captainBasicInfo?.weaponSkinShows && data.captainBasicInfo.weaponSkinShows.length) ? data.captainBasicInfo.weaponSkinShows
      : (data.weaponSkinShows || []);
    const firstWeaponId = weapons && weapons.length ? weapons[0] : null;

    const bannerUrl = basicInfo.avatars?.png || null;
    const clothesIds = parseClothesIds(profileInfo.clothesImage);

    console.log(`🔸 clothesIds: ${clothesIds.join(", ") || "nenhum"}`);
    console.log(`🔸 firstWeaponId: ${firstWeaponId ?? "nenhuma"}`);
    console.log(`🔸 petInfo: ${petInfo ? JSON.stringify(petInfo) : "nenhum"}`);

    const personagemId = profileInfo.avatarId;
    let personagemBuf = null;
    if (personagemId) personagemBuf = await baixarItemBuffer(personagemId, "Personagem");

    const itensBuffers = [];
    for (const id of clothesIds) {
      const b = await baixarItemBuffer(id, "Roupa");
      if (b) itensBuffers.push(b);
    }
    if (firstWeaponId) {
      const bw = await baixarItemBuffer(firstWeaponId, "Weapon");
      if (bw) itensBuffers.push(bw);
    }
    if (petInfo && (petInfo.skinId || petInfo.petId)) {
      const pid = petInfo.skinId || petInfo.petId;
      const bp = await baixarItemBuffer(pid, "Pet");
      if (bp) itensBuffers.push(bp);
    }

    console.log(`✅ Buffers itens prontos: ${itensBuffers.length}`);

    const canvasW = 1600;
    const canvasH = 1600;
    const canvas = Canvas.createCanvas(canvasW, canvasH);
    const ctx = canvas.getContext("2d");

    // Banner menor
    const bannerWidth = 700;
    const bannerHeight = 200;
    const bannerX = (canvasW - bannerWidth) / 2;
    const bannerY = canvasH - bannerHeight - 20;

    // Personagem mantém tamanho, só mais acima
    const personagemW = 420;
    const personagemH = 840;
    const centerX = canvasW / 2;
    const centerY = bannerY - 220 - personagemH / 2; // mais acima que antes

    // Hexes
    let hexR = 160;
    const hexMin = 70;
    const margin = 30;
    const characterCirc = Math.sqrt((personagemW/2)**2 + (personagemH/2)**2);
    let circleRadius = Math.max(characterCirc + hexR + margin, 280);
    const maxCircleRadius = centerY - hexR - margin; 
    if (circleRadius > maxCircleRadius) circleRadius = maxCircleRadius;

    console.log(`Layout ajustado: canvas ${canvasW}x${canvasH}, personagem ${personagemW}x${personagemH}, banner ${bannerWidth}x${bannerHeight}, hexR ${hexR}, circleRadius ${circleRadius}`);

    // Fundo
    ctx.fillStyle = "#8B0000";
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Banner
    if (bannerUrl) {
      try {
        const bannerImg = await loadImage(bannerUrl);
        ctx.drawImage(bannerImg, bannerX, bannerY, bannerWidth, bannerHeight);
        console.log("✅ banner desenhado");
      } catch (err) {
        console.log("⚠️ falha carregar banner:", err.message);
      }
    }

    // Hexes
    for (let i = 0; i < itensBuffers.length; i++) {
      const angle = (2 * Math.PI * i) / itensBuffers.length - Math.PI/2;
      const x = centerX + circleRadius * Math.cos(angle);
      const y = centerY + circleRadius * Math.sin(angle);
      await drawHex(ctx, x, y, hexR, itensBuffers[i], { scaleFactor: 1.18 });

      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const startRadius = characterCirc * 0.72;
      const startX = centerX + (dx/dist)*startRadius;
      const startY = centerY + (dy/dist)*startRadius;
      const endX = x - (dx/dist)*(hexR*0.9);
      const endY = y - (dy/dist)*(hexR*0.9);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.lineWidth = Math.max(3, hexR * 0.04);
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.restore();
    }

    // Personagem (frente)
    if (personagemBuf) {
      const pImg = await loadImage(personagemBuf);
      ctx.drawImage(pImg, centerX - personagemW/2, centerY - personagemH/2, personagemW, personagemH);
      console.log("✅ personagem desenhado (frente)");
    }

    const out = canvas.toBuffer("image/png");
    res.setHeader("Content-Type", "image/png");
    res.send(out);
    console.log("✅ imagem enviada");

  } catch (err) {
    console.error("❌ erro geral outfit:", err);
    res.status(500).json({ error: "Erro ao gerar imagem" });
  }
});
    
app.listen(PORT, () => console.log(`Server rodando em http://localhost:${PORT}`));
