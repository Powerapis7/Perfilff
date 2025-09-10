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
      console.log(`⚠️ [${tipo}] item ${itemId} não encontrado`);
      return null;
    }
    const { data: cdnList } = await axios.get("https://0xme.github.io/ItemID2/assets/cdn.json");
    const cdn_img_json = cdnList.reduce((acc, cur) => Object.assign(acc, cur), {});
    let url = `https://raw.githubusercontent.com/0xme/ff-resources/refs/heads/main/pngs/300x300/${item.icon}.png`;
    try { await axios.head(url); } 
    catch { 
      const fb = cdn_img_json[itemId]; 
      if (!fb) { console.log(`❌ [${tipo}] sem fallback pra ${itemId}`); return null; }
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

// desenha hex (com imagem)
async function drawHex(ctx, x, y, r, imgBuffer) {
  try {
    const img = await loadImage(imgBuffer);
    ctx.save();
    // path hex
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const px = x + r * Math.cos((Math.PI / 3) * i);
      const py = y + r * Math.sin((Math.PI / 3) * i);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    // sombra
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = "#2a0000";
    ctx.fill();
    ctx.clip();
    // escala
    const scaleFactor = 1.2;
    const drawW = r*2*scaleFactor;
    const drawH = r*2*scaleFactor;
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
    ctx.lineWidth = Math.max(3, r*0.06);
    ctx.strokeStyle = "#FFD700";
    ctx.stroke();
  } catch (err) { console.error("❌ drawHex erro:", err.message); }
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
    const weapons = profileInfo.weaponSkinShows || basicInfo.weaponSkinShows || data.captainBasicInfo?.weaponSkinShows || [];
    const firstWeaponId = weapons.length ? weapons[0] : null;

    const bannerUrl = basicInfo.avatars?.png || null;
    const clothesIds = parseClothesIds(profileInfo.clothesImage);
    console.log(`🔸 clothesIds: ${clothesIds.join(", ") || "nenhum"}`);
    console.log(`🔸 firstWeaponId: ${firstWeaponId ?? "nenhuma"}`);
    console.log(`🔸 petInfo: ${petInfo ? JSON.stringify(petInfo) : "nenhum"}`);

    const personagemBuf = profileInfo.avatarId ? await baixarItemBuffer(profileInfo.avatarId, "Personagem") : null;
    const itensBuffers = [];
    for (const id of clothesIds) { const b = await baixarItemBuffer(id, "Roupa"); if (b) itensBuffers.push(b); }
    if (firstWeaponId) { const bw = await baixarItemBuffer(firstWeaponId, "Weapon"); if (bw) itensBuffers.push(bw); }
    if (petInfo && (petInfo.skinId || petInfo.petId)) { const pid = petInfo.skinId || petInfo.petId; const bp = await baixarItemBuffer(pid, "Pet"); if (bp) itensBuffers.push(bp); }

    console.log(`✅ Buffers itens prontos: ${itensBuffers.length}`);

    const canvasW = 1600, canvasH = 1600;
    const canvas = Canvas.createCanvas(canvasW, canvasH);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#8B0000";
    ctx.fillRect(0,0,canvasW,canvasH);

    const bannerWidth = 900, bannerHeight = 180;
    const bannerX = (canvasW-bannerWidth)/2;
    const bannerY = canvasH-bannerHeight-40;

    const personagemW = 420, personagemH = 840;
    const paddingBetween = 50;
    const centerX = canvasW/2;
    const centerY = bannerY - paddingBetween - personagemH/2;

    // desenha hexes atrás do personagem
    if (itensBuffers.length > 0) {
      const hexR = 140;
      const circleRadius = 360;
      for (let i=0;i<itensBuffers.length;i++) {
        const angle = (2*Math.PI*i)/itensBuffers.length - Math.PI/2;
        const x = centerX + circleRadius*Math.cos(angle);
        const y = centerY + circleRadius*Math.sin(angle);

        // linhas
        const dx = x-centerX, dy=y-centerY;
        const dist = Math.sqrt(dx*dx+dy*dy)||1;
        const startRadius = Math.sqrt((personagemW/2)**2 + (personagemH/2)**2)*0.72;
        const startX = centerX + dx/dist*startRadius;
        const startY = centerY + dy/dist*startRadius;
        const endX = x - dx/dist*(hexR*0.9);
        const endY = y - dy/dist*(hexR*0.9);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.lineWidth = Math.max(3, hexR*0.04);
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.shadowColor = "rgba(0,0,0,0.25)";
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.restore();

        await drawHex(ctx, x, y, hexR, itensBuffers[i]);
      }
    }

    // personagem
    if (personagemBuf) { const pImg = await loadImage(personagemBuf); ctx.drawImage(pImg, centerX-personagemW/2, centerY-personagemH/2, personagemW, personagemH); }

    // banner/avatar
    if (bannerUrl) { try { const bannerImg = await loadImage(bannerUrl); ctx.drawImage(bannerImg, bannerX, bannerY, bannerWidth, bannerHeight); console.log("✅ banner desenhado"); } 
    catch(err) { console.log("⚠️ falha carregar banner:", err.message); } }

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
