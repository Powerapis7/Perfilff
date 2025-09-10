import express from "express";
import axios from "axios";
import fs from "fs";
import Canvas, { loadImage } from "canvas";

const app = express();
const PORT = 3000;

// Função para baixar imagem do item pelo ID com logs
async function baixarItemPorID(itemId) {
  try {
    console.log(`🔍 Procurando item ID: ${itemId}`);

    // 1️⃣ Pega a lista de itens
    const { data: items } = await axios.get(
      "https://0xme.github.io/ItemID2/assets/itemData.json"
    );

    const item = items.find((i) => String(i.itemID) === String(itemId));
    if (!item) {
      console.log(`❌ Item ${itemId} não encontrado`);
      return null;
    }
    console.log(`✅ Item encontrado: ${item.description}`);

    // 2️⃣ Pega o CDN para fallback
    const { data: cdnList } = await axios.get(
      "https://0xme.github.io/ItemID2/assets/cdn.json"
    );
    const cdn_img_json = cdnList.reduce((acc, cur) => Object.assign(acc, cur), {});

    // 3️⃣ Monta a URL da imagem
    let imgUrl = `https://raw.githubusercontent.com/0xme/ff-resources/refs/heads/main/pngs/300x300/${item.icon}.png`;
    console.log(`📦 URL inicial: ${imgUrl}`);

    // 4️⃣ Testa se a imagem existe, senão usa o cdn
    try {
      await axios.head(imgUrl);
      console.log(`✅ Imagem encontrada na URL principal`);
    } catch {
      const fallback = cdn_img_json[itemId];
      if (!fallback) {
        console.log("❌ Nenhuma imagem disponível no CDN");
        return null;
      }
      imgUrl = fallback;
      console.log(`⚠️ Usando fallback CDN: ${imgUrl}`);
    }

    // 5️⃣ Baixa a imagem
    const imgRes = await axios.get(imgUrl, { responseType: "arraybuffer" });
    const fileName = `item_${itemId}.png`;
    fs.writeFileSync(fileName, imgRes.data);
    console.log(`📥 Imagem salva: ${fileName}`);

    return fileName; // Retorna o arquivo baixado
  } catch (err) {
    console.error(`❌ Erro ao baixar item ${itemId}: ${err.message}`);
    return null;
  }
}

// Rota /outfit
app.get("/outfit", async (req, res) => {
  try {
    const playerId = req.query.id;
    if (!playerId) return res.status(400).json({ error: "ID necessário" });

    console.log(`\n🔹 Iniciando geração de outfit para o jogador ID: ${playerId}`);

    // 1️⃣ Pega os dados do jogador
    console.log("🌐 Buscando dados do jogador na API infoff2...");
    const { data } = await axios.get(
      `https://world-ecletix.onrender.com/api/infoff2?id=${playerId}`
    );

    const { basicInfo, avatars, profileInfo } = data;
    if (!basicInfo) return res.status(404).json({ error: "Perfil não encontrado" });

    console.log(`✅ Jogador encontrado: ${basicInfo.nickname}`);
    console.log(`📊 Level: ${basicInfo.level}, Rank: ${basicInfo.rank}, Region: ${basicInfo.region}`);

    const personagemUrl = basicInfo.avatars.png;
    const itemIds = profileInfo.clothesImage ? profileInfo.clothesImage.split("ids=")[1].split(",") : [];
    console.log(`🧥 IDs de roupas: ${itemIds.join(", ")}`);

    // 2️⃣ Baixa todas as imagens dos itens
    console.log("📥 Baixando imagens dos itens...");
    const itemFiles = [];
    for (const id of itemIds) {
      const file = await baixarItemPorID(id);
      if (file) itemFiles.push(file);
    }

    console.log(`✅ Total de imagens baixadas: ${itemFiles.length}`);

    // 3️⃣ Cria o Canvas
    console.log("🎨 Criando Canvas...");
    const canvas = Canvas.createCanvas(1200, 1200);
    const ctx = canvas.getContext("2d");

    // Fundo vermelho
    ctx.fillStyle = "#8B0000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Título topo
    ctx.font = "bold 70px Sans";
    ctx.fillStyle = "#FF0000";
    ctx.textAlign = "center";
    ctx.fillText(basicInfo.nickname || "PLAYER", canvas.width / 2, 80);

    // Carrega personagem central
    console.log("🖼️ Carregando personagem central...");
    const personagem = await loadImage(personagemUrl);
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    ctx.drawImage(personagem, centerX - 150, centerY - 300, 300, 600);

    // Função para desenhar hexágono com imagem
    async function drawHex(x, y, radius, filePath) {
      const img = await loadImage(filePath);
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        ctx.lineTo(
          x + radius * Math.cos((Math.PI / 3) * i),
          y + radius * Math.sin((Math.PI / 3) * i)
        );
      }
      ctx.closePath();
      ctx.fillStyle = "#FF0000";
      ctx.fill();
      ctx.clip();
      ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
      ctx.restore();
    }

    // Posições dos hexágonos
    const positions = [
      { x: 300, y: 300 },
      { x: 900, y: 300 },
      { x: 300, y: 900 },
      { x: 900, y: 900 },
      { x: 600, y: 200 },
      { x: 600, y: 1000 },
    ];

    // Desenha itens
    console.log("🎯 Desenhando itens no Canvas...");
    for (let i = 0; i < itemFiles.length && i < positions.length; i++) {
      console.log(`🔹 Desenhando item: ${itemFiles[i]} na posição (${positions[i].x}, ${positions[i].y})`);
      await drawHex(positions[i].x, positions[i].y, 60, itemFiles[i]);

      // Linha conectando ao personagem
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(positions[i].x, positions[i].y);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 4️⃣ Envia a imagem
    console.log("📤 Enviando imagem final...");
    const out = fs.createWriteStream("outfit.png");
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    out.on("finish", () => {
      res.sendFile("outfit.png", { root: "." });
    });

    console.log("✅ Outfit gerado com sucesso!\n");
  } catch (err) {
    console.error(`❌ Erro: ${err.message}`);
    res.status(500).json({ error: "Erro ao gerar imagem de outfit." });
  }
});

// 5️⃣ Inicia servidor
app.listen(PORT, () => {
  // console.log(`Servidor rodando em http://localhost:${PORT}`);
});


