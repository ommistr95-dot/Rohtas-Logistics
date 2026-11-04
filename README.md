# Rohtas Logistics WhatsApp Rate Bot

WhatsApp rate quotes and booking requests for the Dehri-on-Sone, Sasaram, and Rohtas corridor. Sample rates are illustrative; confirm current prices and availability before dispatch.

## Setup

Requirements: Node.js 20.18 or newer and an internet-connected WhatsApp account for the bot.

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `ADMIN_KEY` to a long, private value. Keep `.env` out of source control.
3. Start the server with `npm start`.
4. Open `http://localhost:3000/admin.html`, enter the admin key, then scan the QR code shown in the dashboard using WhatsApp's **Linked devices** screen.

The authenticated QR image is also available at `GET /qr`; send the key in the `x-admin-key` header. Admin APIs use the same header. Do not expose this service publicly without HTTPS and a private admin key.

## WhatsApp flow

Send `rate` to the connected WhatsApp account, choose a material, destination, and truck count, then reply `yes` to start a booking. The bot asks for a name and a loading date (`DD/MM/YYYY` or `YYYY-MM-DD`). A `no` reply ends after the quote; `cancel` abandons the current request.

Booking requests are stored in `data/leads.json`; Baileys session credentials are stored in `auth_info/`. Both paths are ignored by git. Back them up securely if needed, and never share the WhatsApp credentials or lead data.

## Admin dashboard and API

The dashboard at `/admin.html` shows connection status, the pairing QR, a quote tester, and saved leads. Protected endpoints:

- `GET /api/status`
- `GET /api/rates`
- `POST /api/quote` with `materialKey`, `destinationKey`, and `truckCount`
- `GET /api/leads`
- `GET /qr` (PNG)

Every endpoint above requires `x-admin-key: <ADMIN_KEY>`. Sample material and freight rates live in `lib/rates.js` and are not live market rates.

## Tests

Run the focused unit and API checks with `npm test`.