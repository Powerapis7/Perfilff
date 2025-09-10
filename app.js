import express from "express";
import axios from "axios";
import Canvas, { loadImage } from "canvas";

const app = express();
const PORT = 3000;

// Função para baixar imagem de URL e retornar como Image
async function fetchImage(url) {
  console.log("⬇️ Baixando imagem:", url);
  return await loadImage(url);
}

// Função para criar canvas dinamicamente
async function generateCanvas(data) {
  console.log("🎨 Iniciando criação do canvas...");

  const { basicInfo, profileInfo, petInfo } = data;

  const canvasSize = 1200;
  const canvas = Canvas.createCanvas(canvasSize, canvasSize);
  const ctx = canvas.getContext("2d");

  // Fundo vermelho
  ctx.fillStyle = "#8B0000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Personagem no centro
  const avatarId = profileInfo.avatarId;
  const characterUrl = `https://raw.githubusercontent.com/0xme/ff-resources/refs/heads/main/pngs/300x300/${avatarId}.png`;
  const personagem = await fetchImage(characterUrl);
  const charWidth = 300;
  const charHeight = 600;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2 - 50;
  console.log(`🧍 Personagem posicionado em (${centerX}, ${centerY})`);
  ctx.drawImage(personagem, centerX - charWidth / 2, centerY - charHeight / 2, charWidth, charHeight);

  // Banner/avatar abaixo do personagem
  const bannerUrl = basicInfo.avatars.png;
  const banner = await fetchImage(bannerUrl);
  const bannerWidth = 400;
  const bannerHeight = 400;
  const bannerX = centerX - bannerWidth / 2;
  const bannerY = centerY + charHeight / 2 - 50; // 50px de distância
  console.log(`🖼️ Banner posicionado em (${bannerX}, ${bannerY})`);
  ctx.drawImage(banner, bannerX, bannerY, bannerWidth, bannerHeight);

  // Itens ao redor (roupas + primeira arma + pet)
  let itemIds = [];

  // Roupas
  if (profileInfo.clothesImage) {
    const clothesIds = profileInfo.clothesImage.split("ids=")[1].split(",");
    itemIds.push(...clothesIds);
  }

  // Primeira arma
  if (basicInfo.weaponSkinShows && basicInfo.weaponSkinShows.length > 0) {
    itemIds.push(basicInfo.weaponSkinShows[0]);
  }

  // Pet
  if (petInfo && petInfo.petId) {
    if (petInfo.skinId) itemIds.push(petInfo.skinId);
    else itemIds.push(petInfo.petId);
  }

  console.log("🧩 IDs de itens a baixar:", itemIds);

  // Carregar imagens dos itens
  const itemImages = [];
  for (const id of itemIds) {
    try {
      const url = `https://raw.githubusercontent.com/0xme/ff-resources/refs/heads/main/pngs/300x300/${id}.png`;
      const img = await fetchImage(url);
      itemImages.push(img);
      console.log(`✅ Item baixado: ${id}`);
    } catch (err) {
      console.warn(`⚠️ Erro ao baixar item ${id}: ${err.message}`);
    }
  }

  // Desenhar hexes ao redor do personagem
  const hexR = 100; // raio dos hexes
  const numItems = itemImages.length;
  const circleRadius = 400; // distância do centro do personagem
  for (let i = 0; i < numItems; i++) {
    const angle = (2 * Math.PI * i) / numItems - Math.PI / 2;
    const x = centerX + circleRadius * Math.cos(angle);
    const y = centerY + circleRadius * Math.sin(angle);

    ctx.save();
    ctx.beginPath();
    for (let h = 0; h < 6; h++) {
      ctx.lineTo(
        x + hexR * Math.cos(Math.PI / 3 * h),
        y + hexR * Math.sin(Math.PI / 3 * h)
      );
    }
    ctx.closePath();
    ctx.fillStyle = "#FF0000";
    ctx.fill();
    ctx.clip();

    ctx.drawImage(itemImages[i], x - hexR, y - hexR, hexR * 2, hexR * 2);
    ctx.restore();

    // Linha conectando ao personagem
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  console.log("🎉 Canvas finalizado!");
  return canvas;
}

// Rota principal
app.get("/outfit", async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "ID necessário" });

    console.log("🔎 Buscando dados da API Free Fire...");
    const { data } = await axios.get(`https://world-ecletix.onrender.com/api/infoff2?id=${id}`);
    if (!data.basicInfo) return res.status(404).json({ error: "Perfil não encontrado." });

    const canvas = await generateCanvas(data);

    const buffer = canvas.toBuffer("image/png");
    res.setHeader("Content-Type", "image/png");
    res.send(buffer);
  } catch (err) {
    console.error("❌ Erro na rota /outfit:", err.message);
    res.status(500).json({ error: "Erro ao gerar imagem" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
