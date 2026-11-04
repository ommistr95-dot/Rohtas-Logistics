import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import cors from "cors";
import express from "express";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import { createBotHandler } from "./lib/bot.js";
import { getLeads, saveLead } from "./lib/leads.js";
import { getRates, quoteRate } from "./lib/rates.js";

const root = dirname(fileURLToPath(import.meta.url));

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function requireAdminKey(req, res, next) {
  const expected = process.env.ADMIN_KEY;
  if (!expected) return res.status(503).json({ error: "Admin access is not configured" });

  const supplied = req.get("x-admin-key") ?? req.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!supplied || !safeEqual(supplied, expected)) {
    return res.status(401).json({ error: "Invalid admin key" });
  }
  next();
}

function messageText(message = {}) {
  let content = message;
  while (content.ephemeralMessage || content.viewOnceMessage || content.viewOnceMessageV2) {
    content = content.ephemeralMessage?.message ??
      content.viewOnceMessage?.message ??
      content.viewOnceMessageV2?.message ?? {};
  }
  return content.conversation ??
    content.extendedTextMessage?.text ??
    content.imageMessage?.caption ??
    content.videoMessage?.caption ?? "";
}

export function createApp(botState) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "32kb" }));
  app.use(express.static(join(root, "public")));

  app.get("/api/status", requireAdminKey, (_req, res) => {
    res.json({ status: botState.status, qrAvailable: Boolean(botState.qr) });
  });

  app.get("/api/rates", requireAdminKey, (_req, res) => res.json(getRates()));

  app.post("/api/quote", requireAdminKey, (req, res) => {
    try {
      res.json(quoteRate(req.body));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/leads", requireAdminKey, async (_req, res, next) => {
    try {
      res.json(await getLeads());
    } catch (error) {
      next(error);
    }
  });

  app.get("/qr", requireAdminKey, async (_req, res, next) => {
    if (!botState.qr) {
      return res.status(409).json({ error: "QR code is not available", status: botState.status });
    }
    try {
      res.type("png").send(await QRCode.toBuffer(botState.qr, { width: 360, margin: 2 }));
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    console.error("Request failed:", error);
    res.status(500).json({ error: "Internal server error" });
  });
  return app;
}

export function extractMessageText(message) {
  return messageText(message);
}

export async function startWhatsAppBot(botState) {
  let reconnectTimer;
  let socket;
  const handleMessage = createBotHandler({ sendMessage: (jid, text) => socket.sendMessage(jid, { text }), saveLead });

  async function connect() {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(join(root, "auth_info"));
      socket = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" }),
        browser: ["Rohtas Logistics", "Chrome", "1.0.0"]
      });

      socket.ev.on("creds.update", saveCreds);
      socket.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
        if (qr) {
          botState.qr = qr;
          botState.status = "Waiting for scan";
          console.log("WhatsApp QR is ready at /qr");
        }
        if (connection === "open") {
          botState.qr = "";
          botState.status = "Connected";
          console.log("WhatsApp bot connected");
        }
        if (connection === "close") {
          botState.qr = "";
          botState.status = "Disconnected";
          const loggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
          if (!loggedOut && !reconnectTimer) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = undefined;
              void connect();
            }, 2000);
          }
        }
      });

      socket.ev.on("messages.upsert", async ({ messages }) => {
        for (const message of messages) {
          const jid = message.key?.remoteJid;
          const text = messageText(message.message);
          if (!jid || jid === "status@broadcast" || jid.endsWith("@g.us") || message.key.fromMe || !text) continue;
          try {
            await handleMessage({ jid, text, pushName: message.pushName });
          } catch (error) {
            console.error("Could not handle WhatsApp message:", error);
          }
        }
      });
    } catch (error) {
      botState.status = "Disconnected";
      console.error("Could not start WhatsApp connection:", error);
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined;
          void connect();
        }, 5000);
      }
    }
  }

  await connect();
  return () => {
    clearTimeout(reconnectTimer);
    socket?.end(undefined);
  };
}

export async function startServer() {
  const port = Number(process.env.PORT ?? 3000);
  const botState = { status: "Starting", qr: "" };
  const server = createServer(createApp(botState));
  server.listen(port, () => console.log(`Admin panel: http://localhost:${port}/admin.html`));
  const stopBot = await startWhatsAppBot(botState);

  const shutdown = () => {
    stopBot();
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch(error => {
    console.error("Server startup failed:", error);
    process.exitCode = 1;
  });
}
