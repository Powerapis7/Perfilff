import express from "express";
import axios from "axios";
import fs from "fs";
import Canvas, { loadImage } from "canvas";

const app = express();
const PORT = 3000;

if (!fs.existsSync("./temp")) fs.mkdirSync("./temp");

// util: pontos do hexágono (para reutilizar)
function hexPoints(x, y, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    pts.push({
      x: x + r * Math.cos((Math.PI / 3) * i),
      y: y + r * Math.sin((Math.PI / 3) * i),
    });
  }
  return pts;
}

// baixa imagem a partir do ItemID2 + fallback CDN (logs)
async function baixarItemPorID(itemId, tipo = "Item") {
  try {
    console.log(`🔍 [${tipo}] Procurando item ID: ${itemId}`);
    const { data: items } = await axios.get(
      "https://0xme.github.io/ItemID2/assets/itemData.json"
    );
    const item = items.find((i) => String(i.itemID) === String(itemId));
    if (!item) {
      console.log(`❌ [${tipo}] Item ${itemId} não encontrado no itemData`);
      return null;
    }
    console.log(`✅ [${tipo}] Encontrado: ${item.description}`);

    const { data: cdnList } = await axios.get(
      "https://0xme.github.io/ItemID2/assets/cdn.json"
    );
    const cdn_img_json = cdnList.reduce((acc, cur) => Object.assign(acc, cur), {});
    let imgUrl = `https://raw.githubusercontent.com/0xme/ff-resources/refs/heads/main/pngs/300x300/${item.icon}.png`;

    try {
      await axios.head(imgUrl);
      console.log(`📦 [${tipo}] Imagem disponível na URL principal`);
    } catch {
      const fallback = cdn_img_json[itemId];
      if (!fallback) {
        console.log(`❌ [${tipo}] Nenhum fallback encontrado para ${itemId}`);
        return null;
      }
      imgUrl = fallback;
      console.log(`⚠️ [${tipo}] Usando fallback CDN: ${imgUrl}`);
    }

    const imgRes = await axios.get(imgUrl, { responseType: "arraybuffer" });
    const fileName = `./temp/${tipo}_${itemId}.png`;
    fs.writeFileSync(fileName, imgRes.data);
    console.log(`📥 [${tipo}] Baixado: ${fileName}`);
    return fileName;
  } catch (err) {
    console.error(`❌ Erro ao baixar [${tipo}] ${itemId}: ${err.message}`);
    return null;
  }
}

// desenha hex (com sombra, imagem dentro e contorno)
// cria forma > preenche (com sombra) > desenha imagem dentro (clip) > desenha contorno por cima
async function drawHex(ctx, x, y, radius, filePath) {
  try {
    const pts = hexPoints(x, y, radius);

    // Carrega imagem (pode lançar)
    const img = await loadImage(filePath);

    // Preencher com sombra/shape
    ctx.save();
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();

    // sombra + fundo (leve)
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#330000"; // fundo escuro por baixo da imagem
    ctx.fill();

    // clip e desenha imagem ajustada
    ctx.clip();
    ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);

    ctx.restore();

    // desenha contorno por cima (sem sombra)
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#FFD700";
    ctx.stroke();
  } catch (err) {
    console.error(`❌ Erro drawHex (${filePath}): ${err.message}`);
  }
}

app.get("/outfit", async (req, res) => {
  try {
    const playerId = req.query.id;
    if (!playerId) return res.status(400).json({ error: "ID necessário" });

    console.log(`\n🔹 Gerando outfit para jogador ID: ${playerId}`);

    // busca os dados
    const resp = await axios.get(`https://world-ecletix.onrender.com/api/infoff2?id=${playerId}`);
    const data = resp.data || {};
    const basicInfo = data.basicInfo || {};
    const profileInfo = data.profileInfo || {};
    const petInfo = data.petInfo || data.profileInfo?.petInfo || data.basicInfo?.petInfo || {};
    // weapons pode vir em vários lugares: data.weaponSkinShows, data.basicInfo.weaponSkinShows, data.profileInfo.weaponSkinShows
    const weapons =
      data.weaponSkinShows ||
      data.basicInfo?.weaponSkinShows ||
      data.profileInfo?.weaponSkinShows ||
      [];
    const title = data.title ?? data.basicInfo?.title ?? null;

    if (!basicInfo || Object.keys(basicInfo).length === 0) {
      console.log("❌ basicInfo ausente");
      return res.status(404).json({ error: "Perfil não encontrado" });
    }
    console.log(`✅ Jogador: ${basicInfo.nickname || basicInfo.accountId || playerId}`);

    // --- parâmetros visuais / espaços ---
    const canvasW = 1600;
    const canvasH = 1600;
    const bannerWidth = 900;
    const bannerHeight = 300;
    const personagemWidth = 400;
    const personagemHeight = 800;
    const paddingBetweenCharacterAndBanner = 60; // espaço mínimo entre personagem base e banner top
    let radiusHex = 180; // tamanho hex
    const minCircleRadius = 220; // valor mínimo aceitável
    const requestedCircleRadius = 600; // preferido

    // Calcula posições: reserva banner em bottom area
    const canvas = Canvas.createCanvas(canvasW, canvasH);
    const ctx = canvas.getContext("2d");

    // banner position: bem embaixo, com margin
    const bannerX = (canvasW - bannerWidth) / 2;
    const bannerY = canvasH - bannerHeight - 40; // 40px margin bottom

    // centerY: coloque personagem acima do banner com espaçamento
    const centerX = canvasW / 2;
    // centerY = bannerY - padding - personagemHeight/2
    const centerY = bannerY - paddingBetweenCharacterAndBanner - personagemHeight / 2;

    console.log(`Layout: canvasH=${canvasH} bannerY=${bannerY} centerY=${centerY}`);

    // Preenche fundo vermelho
    ctx.fillStyle = "#8B0000";
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Carrega banner
    let bannerImg = null;
    try {
      if (basicInfo.avatars && basicInfo.avatars.png) {
        bannerImg = await loadImage(basicInfo.avatars.png);
        console.log("✅ Banner carregado");
      } else {
        console.log("⚠️ Banner não encontrado em basicInfo.avatars.png");
      }
    } catch (err) {
      console.log("⚠️ Erro ao carregar banner:", err.message);
      bannerImg = null;
    }

    // Parse roupas (clothesImage pode ter 'ids=' ou lista)
    let clothesIds = [];
    if (profileInfo && profileInfo.clothesImage) {
      const m = String(profileInfo.clothesImage).match(/ids=([0-9,]+)/);
      if (m) clothesIds = m[1].split(",").filter(Boolean);
      else if (String(profileInfo.clothesImage).includes(",")) clothesIds = String(profileInfo.clothesImage).split(",").filter(Boolean);
      else if (/^\d+$/.test(String(profileInfo.clothesImage).trim())) clothesIds = [String(profileInfo.clothesImage).trim()];
    }

    console.log(`🔸 clothesIds parsed: ${clothesIds.join(", ") || "none"}`);
    console.log(`🔸 weapons parsed: ${weapons.length} item(s)`);
    console.log(`🔸 title: ${title ?? "none"}`);
    console.log(`🔸 petInfo: ${petInfo ? JSON.stringify(petInfo) : "none"}`);

    // Baixa personagem central (avatarId)
    let personagemFile = null;
    if (profileInfo.avatarId) {
      personagemFile = await baixarItemPorID(profileInfo.avatarId, "Personagem");
      if (!personagemFile) console.log("❌ Falha ao baixar personagem via avatarId");
    } else {
      console.log("⚠️ profileInfo.avatarId ausente");
    }

    // Baixa clothes, weapons (apenas primeiro weapon se existir), title(s), pet
    const hexFiles = [];

    // roupas
    for (const id of clothesIds) {
      const f = await baixarItemPorID(id, "Roupa");
      if (f) hexFiles.push(f);
    }

    // primeira arma (se existir) — tratada igual roupa
    if (weapons && weapons.length > 0) {
      const firstWeaponId = weapons[0];
      const wf = await baixarItemPorID(firstWeaponId, "Weapon");
      if (wf) hexFiles.push(wf);
      else console.log(`⚠️ primeira arma (${firstWeaponId}) não pôde ser baixada`);
    }

    // title (pode ser número ou array)
    if (title) {
      if (Array.isArray(title)) {
        for (const t of title) {
          const tf = await baixarItemPorID(t, "Title");
          if (tf) hexFiles.push(tf);
        }
      } else {
        const tf = await baixarItemPorID(title, "Title");
        if (tf) hexFiles.push(tf);
      }
    }

    // pet (skinId preferencial)
    if (petInfo && (petInfo.skinId || petInfo.petId)) {
      const petIdToUse = petInfo.skinId || petInfo.petId;
      const pf = await baixarItemPorID(petIdToUse, "Pet");
      if (pf) hexFiles.push(pf);
      else console.log(`⚠️ pet ${petIdToUse} não pôde ser baixado`);
    }

    console.log(`✅ hexFiles total: ${hexFiles.length}`);

    // Ajusta circleRadius pra não tocar banner:
    let circleRadius = Math.min(requestedCircleRadius, Math.max(minCircleRadius, bannerY - 40 - radiusHex - centerY));
    // se espaço insuficiente, reduz radiusHex e recalcula
    if (circleRadius < minCircleRadius) {
      console.log("⚠️ Espaço insuficiente, reduzindo tamanho dos hexágonos");
      radiusHex = 130;
      circleRadius = Math.min(requestedCircleRadius, Math.max(160, bannerY - 40 - radiusHex - centerY));
    }
    if (circleRadius < 120) circleRadius = 120;

    console.log(`Layout chosen: radiusHex=${radiusHex}, circleRadius=${circleRadius}`);

    //  DRAW ORDER:
    // 1) banner (embaixo)
    // 2) hexes + linhas (acima do fundo, abaixo do personagem)
    // 3) personagem (na frente)
    // 4) (opcionais) pequenos detalhes

    // 1) banner
    if (bannerImg) {
      ctx.drawImage(bannerImg, bannerX, bannerY, bannerWidth, bannerHeight);
    }

    // 2) hexes + linhas
    if (hexFiles.length > 0) {
      for (let i = 0; i < hexFiles.length; i++) {
        const file = hexFiles[i];
        const angle = (2 * Math.PI * i) / hexFiles.length - Math.PI / 2; // começa em cima
        const x = centerX + circleRadius * Math.cos(angle);
        const y = centerY + circleRadius * Math.sin(angle);

        await drawHex(ctx, x, y, radiusHex, file);

        // desenha linha fora do personagem (começa na borda do personagem, termina na borda do hex)
        const dx = x - centerX;
        const dy = y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        const startRadius = Math.max(personagemWidth, personagemHeight) / 2 * 0.9; // um pouco menor que metade (evita entrar no personagem)
        const startX = centerX + (dx / dist) * startRadius;
        const startY = centerY + (dy / dist) * startRadius;
        const endX = x - (dx / dist) * (radiusHex * 0.95);
        const endY = y - (dy / dist) * (radiusHex * 0.95);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.shadowColor = "rgba(0,0,0,0.25)";
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.restore();
      }
    } else {
      console.log("⚠️ Nenhum hexItem disponível para desenhar");
    }

    // 3) personagem (por último, para ficar sobre as linhas/hexes)
    if (personagemFile) {
      try {
        const personagemImg2 = await loadImage(personagemFile);
        ctx.drawImage(
          personagemImg2,
          centerX - personagemWidth / 2,
          centerY - personagemHeight / 2,
          personagemWidth,
          personagemHeight
        );
        console.log("✅ Personagem desenhado por cima das linhas/hexes");
      } catch (err) {
        console.error("❌ Erro ao desenhar personagem:", err.message);
      }
    } else {
      console.log("⚠️ Personagem não disponível para desenhar");
    }

    // 4) encaminha imagem
    const buffer = canvas.toBuffer();
    res.setHeader("Content-Type", "image/png");
    res.send(buffer);
    console.log("✅ Outfit enviado com sucesso");
  } catch (err) {
    console.error("❌ Erro geral:", err);
    res.status(500).json({ error: "Erro ao gerar imagem de outfit." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
