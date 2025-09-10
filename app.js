import express from "express";
import axios from "axios";
import Canvas, { loadImage } from "canvas";

const app = express();
const PORT = 3000;

// Função para baixar imagem de um item (roupa, arma, pet)
async function baixarItemPorID(itemId) {
  try {
    console.log(`[LOG] Baixando item ID: ${itemId}`);
    const { data: items } = await axios.get(
      "https://0xme.github.io/ItemID2/assets/itemData.json"
    );
    const item = items.find(i => String(i.itemID) === String(itemId));
    if (!item) throw new Error(`Item ${itemId} não encontrado`);

    const { data: cdnList } = await axios.get(
      "https://0xme.github.io/ItemID2/assets/cdn.json"
    );
    const cdn_img_json = cdnList.reduce((acc, cur) => Object.assign(acc, cur), {});

    let imgUrl = `https://raw.githubusercontent.com/0xme/ff-resources/refs/heads/main/pngs/300x300/${item.icon}.png`;

    try {
      await axios.head(imgUrl);
    } catch {
      const fallback = cdn_img_json[itemId];
      if (!fallback) throw new Error(`Nenhuma imagem disponível no CDN para item ${itemId}`);
      imgUrl = fallback;
    }

    const imgRes = await axios.get(imgUrl, { responseType: "arraybuffer" });
    console.log(`[LOG] Item ID ${itemId} baixado com sucesso`);
    return imgRes.data;
  } catch (err) {
    console.error(`[ERRO] ${err.message}`);
    return null;
  }
}

// Rota para gerar o loadout
app.get("/loadout", async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "ID necessário" });

  try {
    console.log(`[LOG] Buscando dados do jogador ID: ${id}`);
    const { data } = await axios.get(`https://world-ecletix.onrender.com/api/infoff2?id=${id}`);

    const { basicInfo, profileInfo } = data;

    // Pegando o personagem central
    const personagemId = profileInfo.avatarId;
    console.log(`[LOG] Personagem ID: ${personagemId}`);
    const personagemBuffer = await baixarItemPorID(personagemId);
    const personagemImage = await loadImage(personagemBuffer);

    // Pegando as roupas
    const roupasIds = profileInfo.clothesImage
      .split("ids=")[1]
      .split(",");
    console.log(`[LOG] Roupas IDs: ${roupasIds.join(", ")}`);
    const roupasBuffers = [];
    for (const rid of roupasIds) {
      const buf = await baixarItemPorID(rid);
      if (buf) roupasBuffers.push(buf);
    }

    // Pegando a arma
    const weaponId = basicInfo.weaponSkinShows && basicInfo.weaponSkinShows.length > 0
      ? basicInfo.weaponSkinShows[0]
      : null;
    let weaponBuffer = null;
    if (weaponId) weaponBuffer = await baixarItemPorID(weaponId);
    console.log(`[LOG] Arma ID: ${weaponId}`);

    // Pegando o pet
    let petId = null;
    if (data.petInfo) {
      petId = data.petInfo.skinId || data.petInfo.petId;
    }
    let petBuffer = null;
    if (petId) petBuffer = await baixarItemPorID(petId);
    console.log(`[LOG] Pet ID: ${petId}`);

    // Pegando avatar/banner
    const avatarUrl = basicInfo.avatars.png;
    console.log(`[LOG] Avatar/Banner URL: ${avatarUrl}`);
    const avatarImage = await loadImage(avatarUrl);

    // Canvas
    const canvas = Canvas.createCanvas(1200, 1200);
    const ctx = canvas.getContext("2d");

    // Fundo vermelho
    ctx.fillStyle = "#8B0000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Posicionamento
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2 - 100; // sobe um pouco pra caber o avatar/banner embaixo
    const hexRadius = 90; // tamanho das fotos dentro dos hexágonos
    const circleRadius = 250; // distância do personagem

    // Função para desenhar hexágono
    async function drawHex(x, y, radius, buffer) {
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        ctx.lineTo(x + radius * Math.cos(Math.PI / 3 * i), y + radius * Math.sin(Math.PI / 3 * i));
      }
      ctx.closePath();
      ctx.fillStyle = "#FF0000";
      ctx.fill();
      ctx.clip();

      const img = await loadImage(buffer);
      ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
      ctx.restore();
    }

    // Distribuindo roupas/arma/pet ao redor do personagem
    const itensBuffers = [...roupasBuffers];
    if (weaponBuffer) itensBuffers.push(weaponBuffer);
    if (petBuffer) itensBuffers.push(petBuffer);

    const angleStep = (Math.PI * 1.5) / itensBuffers.length; // distribui em arco de 270°
    let startAngle = Math.PI / 4; // começa 45° para não ir pra baixo
    for (let i = 0; i < itensBuffers.length; i++) {
      const angle = startAngle + angleStep * i;
      const x = centerX + circleRadius * Math.cos(angle);
      const y = centerY + circleRadius * Math.sin(angle);
      await drawHex(x, y, hexRadius, itensBuffers[i]);

      // Linha conectando ao personagem
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // Desenha o personagem central
    ctx.drawImage(personagemImage, centerX - 150, centerY - 300, 300, 600);

    // Desenha o avatar/banner embaixo do personagem
    ctx.drawImage(avatarImage, centerX - 200, centerY + 250, 400, 200);

    // Envia imagem
    const buffer = canvas.toBuffer("image/png");
    res.setHeader("Content-Type", "image/png");
    res.send(buffer);
    console.log("[LOG] Imagem gerada com sucesso!");

  } catch (err) {
    console.error(`[ERRO] ${err.message}`);
    res.status(500).json({ error: "Erro ao gerar loadout" });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
