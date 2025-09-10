import express from "express";
import axios from "axios";
import fs from "fs";
import Canvas, { loadImage } from "canvas";

const app = express();
const PORT = 3000;

if (!fs.existsSync("./temp")) fs.mkdirSync("./temp");

async function baixarItemPorID(itemId, tipo = "Item") {
  try {
    console.log(`🔍 [${tipo}] Procurando item ID: ${itemId}`);
    const { data: items } = await axios.get(
      "https://0xme.github.io/ItemID2/assets/itemData.json"
    );
    const item = items.find((i) => String(i.itemID) === String(itemId));
    if (!item) {
      console.log(`❌ [${tipo}] Item ${itemId} não encontrado`);
      return null;
    }
    console.log(`✅ [${tipo}] Item encontrado: ${item.description}`);

    const { data: cdnList } = await axios.get(
      "https://0xme.github.io/ItemID2/assets/cdn.json"
    );
    const cdn_img_json = cdnList.reduce((acc, cur) => Object.assign(acc, cur), {});

    let imgUrl = `https://raw.githubusercontent.com/0xme/ff-resources/refs/heads/main/pngs/300x300/${item.icon}.png`;
    try {
      await axios.head(imgUrl);
      console.log(`✅ [${tipo}] Imagem encontrada na URL principal`);
    } catch {
      const fallback = cdn_img_json[itemId];
      if (!fallback) {
        console.log(`❌ [${tipo}] Nenhuma imagem disponível no CDN`);
        return null;
      }
      imgUrl = fallback;
      console.log(`⚠️ [${tipo}] Usando fallback CDN: ${imgUrl}`);
    }

    const imgRes = await axios.get(imgUrl, { responseType: "arraybuffer" });
    const fileName = `./temp/${tipo}_${itemId}.png`;
    fs.writeFileSync(fileName, imgRes.data);
    console.log(`📥 [${tipo}] Imagem salva: ${fileName}`);

    return fileName;
  } catch (err) {
    console.error(`❌ Erro ao baixar [${tipo}] ${itemId}: ${err.message}`);
    return null;
  }
}

async function drawHex(ctx, x, y, radius, filePath) {
  try {
    const img = await loadImage(filePath);

    // Sombra e contorno
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      ctx.lineTo(
        x + radius * Math.cos((Math.PI / 3) * i),
        y + radius * Math.sin((Math.PI / 3) * i)
      );
    }
    ctx.closePath();

    // Contorno
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#FFD700";
    ctx.stroke();

    ctx.clip();
    ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  } catch (err) {
    console.error(`❌ Erro ao desenhar hexágono: ${err.message}`);
  }
}

app.get("/outfit", async (req, res) => {
  try {
    const playerId = req.query.id;
    if (!playerId) return res.status(400).json({ error: "ID necessário" });

    console.log(`\n🔹 Gerando outfit para jogador ID: ${playerId}`);

    const { data } = await axios.get(
      `https://world-ecletix.onrender.com/api/infoff2?id=${playerId}`
    );

    const { basicInfo, profileInfo, petInfo, weaponSkinShows, title } = data;

    if (!basicInfo) return res.status(404).json({ error: "Perfil não encontrado" });

    console.log(`✅ Jogador encontrado: ${basicInfo.nickname}`);

    // 1️⃣ Baixa personagem central
    const personagemFile = await baixarItemPorID(profileInfo.avatarId, "Personagem");
    if (!personagemFile) return res.status(500).json({ error: "Erro ao baixar personagem" });

    // 2️⃣ Carrega banner/avatar
    const banner = await loadImage(basicInfo.avatars.png);

    // 3️⃣ Cria Canvas
    const canvas = Canvas.createCanvas(1600, 1600);
    const ctx = canvas.getContext("2d");

    // Fundo vermelho
    ctx.fillStyle = "#8B0000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Banner/avatar embaixo do personagem
    const bannerWidth = 800;
    const bannerHeight = 280;
    ctx.drawImage(banner, centerX - bannerWidth / 2, centerY + 400, bannerWidth, bannerHeight);

    // Personagem central
    const personagemImg = await loadImage(personagemFile);
    const personagemWidth = 400;
    const personagemHeight = 800;
    ctx.drawImage(personagemImg, centerX - personagemWidth / 2, centerY - personagemHeight / 2, personagemWidth, personagemHeight);

    // 4️⃣ Baixa e organiza itens hexagonais
    let hexItems = [];

    // Roupas
    if (profileInfo.clothesImage.includes("ids=")) {
      const itemIds = profileInfo.clothesImage.split("ids=")[1].split(",");
      for (const id of itemIds) {
        const file = await baixarItemPorID(id, "Roupa");
        if (file) hexItems.push(file);
      }
    }

    // Title
    if (title) {
      for (const t of title) {
        const titleFile = await baixarItemPorID(t, "Title");
        if (titleFile) hexItems.push(titleFile);
      }
    }

    // Weapons (todos iguais)
    if (weaponSkinShows && weaponSkinShows.length > 0) {
      for (const id of weaponSkinShows) {
        const file = await baixarItemPorID(id, "Weapon");
        if (file) hexItems.push(file);
      }
    }

    // Pet
    if (petInfo && petInfo.petId) {
      const petFile = petInfo.skinId
        ? await baixarItemPorID(petInfo.skinId, "Pet")
        : await baixarItemPorID(petInfo.petId, "Pet");
      if (petFile) hexItems.push(petFile);
    }

    console.log(`✅ Total de hexItems: ${hexItems.length}`);

    // 5️⃣ Desenhar hexágonos em círculo ao redor do personagem
    const radiusHex = 180;
    const circleRadius = 550;
    for (let i = 0; i < hexItems.length; i++) {
      const file = hexItems[i];
      const angle = (2 * Math.PI * i) / hexItems.length - Math.PI / 2;
      const x = centerX + circleRadius * Math.cos(angle);
      const y = centerY + circleRadius * Math.sin(angle);

      await drawHex(ctx, x, y, radiusHex, file);

      // Linha conectando fora do personagem
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const startX = centerX + (dx / dist) * (personagemWidth/2);
      const startY = centerY + (dy / dist) * (personagemHeight/2);
      const endX = x - (dx / dist) * radiusHex;
      const endY = y - (dy / dist) * radiusHex;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 4;
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 5;
      ctx.stroke();
    }

    // 6️⃣ Envia imagem final
    const buffer = canvas.toBuffer();
    res.setHeader("Content-Type", "image/png");
    res.send(buffer);

    console.log("✅ Outfit gerado com sucesso!\n");
  } catch (err) {
    console.error(`❌ Erro: ${err.message}`);
    res.status(500).json({ error: "Erro ao gerar imagem de outfit." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
