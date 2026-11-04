const express = require('express');
const cors = require('cors');
const path = require('path');
const pino = require('pino');
const qrcode = require('qrcode'); // Browser me QR dikhane ke liye
const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason 
} = require('@whiskeysockets/baileys');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

let rateDatabase = {
  materials: {
    "10mm_pink": { name: "10mm Pink Stone Gitti", baseRate: 1150 },
    "20mm_pink": { name: "20mm Pink Stone Gitti", baseRate: 1200 },
    "river_baalu": { name: "Red River Sand (Baalu)", baseRate: 980 },
    "crusher_dust": { name: "Crusher Dust / Plaster Sand", baseRate: 650 }
  },
  freight: {
    "banaras": { name: "Banaras (Varanasi, UP)", costPerTon: 450 },
    "patna": { name: "Patna (Bihar)", costPerTon: 620 },
    "buxar": { name: "Buxar (Bihar)", costPerTon: 380 }
  }
};

const userSessions = {};

// Admin API
app.get('/api/rates', (req, res) => res.json(rateDatabase));

app.post('/api/rates/update', (req, res) => {
  const { materials, freight } = req.body;
  if (materials) rateDatabase.materials = { ...rateDatabase.materials, ...materials };
  if (freight) rateDatabase.freight = { ...rateDatabase.freight, ...freight };
  res.json({ success: true, message: "Rates updated successfully!" });
});

// WhatsApp Bot & Browser QR Route
let latestQR = "";
let botStatus = "Disconnected";

// Route to display QR code directly on browser screen
app.get('/qr', async (req, res) => {
  if (botStatus === "Connected") {
    return res.send(`<h1>✅ WhatsApp Bot is Already Connected & Running!</h1>`);
  }
  if (!latestQR) {
    return res.send(`<h1>⏳ Generating QR Code, please refresh the page in 5 seconds...</h1>`);
  }
  try {
    const qrImageURL = await qrcode.toDataURL(latestQR);
    res.send(`
      <div style="text-align: center; margin-top: 50px; font-family: sans-serif;">
        <h2>Scan this QR Code to Connect WhatsApp Bot</h2>
        <img src="${qrImageURL}" alt="WhatsApp QR Code" style="width: 300px; height: 300px; border: 2px solid #ccc; padding: 10px; border-radius: 10px;" />
        <p>Refresh this page if it expires.</p>
      </div>
    `);
  } catch (err) {
    res.status(500).send("Error generating QR code image.");
  }
});

let sock;
async function startWhatsAppBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ["Rohtas Logistics", "Chrome", "1.0.0"]
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      latestQR = qr;
      botStatus = "Waiting for Scan";
      console.log('📌 New QR Code Generated!');
    }

    if (connection === 'close') {
      botStatus = "Disconnected";
      const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
      if (shouldReconnect) startWhatsAppBot();
    } else if (connection === 'open') {
      botStatus = "Connected";
      latestQR = "";
      console.log('🚀 WhatsApp Bot Successfully Connected!');
    }
  });

  // Bot Message Handler
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

    if (!userSessions[from]) userSessions[from] = { step: 0, data: {} };
    const session = userSessions[from];

    if (body.toLowerCase().includes('hi') || body.toLowerCase().includes('rate') || body === '0') {
      session.step = 1;
      await sock.sendMessage(from, { text: `*🚜 ROHTAS LOGISTICS BOT*\n\nNamaste! Dehri/Sasaram Mining Corridor Rate Engine.\n\n*Material Chuniye (Number Bhejein):*\n1️⃣ 10mm Pink Stone Gitti\n2️⃣ 20mm Pink Stone Gitti\n3️⃣ Red River Sand (Baalu)\n4️⃣ Crusher Dust` });
      return;
    }

    if (session.step === 1) {
      const keys = ["10mm_pink", "20mm_pink", "river_baalu", "crusher_dust"];
      const idx = parseInt(body.trim()) - 1;
      if (idx >= 0 && idx < keys.length) {
        session.data.matKey = keys[idx];
        session.data.matName = rateDatabase.materials[keys[idx]].name;
        session.data.baseRate = rateDatabase.materials[keys[idx]].baseRate;
        session.step = 2;
        await sock.sendMessage(from, { text: `✅ *Material:* ${session.data.matName}\n\n*Destination Chuniye:*\n1️⃣ Banaras\n2️⃣ Patna\n3️⃣ Buxar` });
      } else {
        await sock.sendMessage(from, { text: "❌ Kripya sahi number bhejein (1 se 4)." });
      }
      return;
    }

    if (session.step === 2) {
      const locKeys = ["banaras", "patna", "buxar"];
      const idx = parseInt(body.trim()) - 1;
      if (idx >= 0 && idx < locKeys.length) {
        session.data.locKey = locKeys[idx];
        session.data.locName = rateDatabase.freight[locKeys[idx]].name;
        session.data.freight = rateDatabase.freight[locKeys[idx]].costPerTon;
        session.step = 3;
        await sock.sendMessage(from, { text: `📍 *Destination:* ${session.data.locName}\n\n*Kitne Truck chahiye? (30 Ton per truck)*\n1️⃣ 1 Truck (30 Tons)\n2️⃣ 5 Trucks (150 Tons)\n3️⃣ 10 Trucks (300 Tons)` });
      } else {
        await sock.sendMessage(from, { text: "❌ Kripya sahi destination number bhejein." });
      }
      return;
    }

    if (session.step === 3) {
      const truckMap = { "1": 1, "2": 5, "3": 10 };
      const count = truckMap[body.trim()];
      if (count) {
        const tons = count * 30;
        const matCost = tons * session.data.baseRate;
        const freightCost = tons * session.data.freight;
        const total = matCost + freightCost;

        const invoice = `📋 *OFFICIAL LOGISTICS QUOTATION*\n-----------------------------------\n*Material:* ${session.data.matName}\n*Quantity:* ${tons} Tons (${count} Trucks)\n*Location:* ${session.data.locName}\n-----------------------------------\n*Material Cost:* ₹${matCost.toLocaleString('en-IN')}\n*Freight Cost:* ₹${freightCost.toLocaleString('en-IN')}\n*GRAND TOTAL:* ₹${total.toLocaleString('en-IN')}\n-----------------------------------\n✅ *Spot Dispatch Ready.*\n_Reset ke liye 0 bhejein._`;

        await sock.sendMessage(from, { text: invoice });
        session.step = 0;
      } else {
        await sock.sendMessage(from, { text: "❌ Kripya 1, 2 ya 3 select karein." });
      }
      return;
    }
  });
}

startWhatsAppBot();
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
