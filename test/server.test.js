import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { createApp, extractMessageText } from "../server.js";

test("admin API and QR route require the admin key", async t => {
  const originalKey = process.env.ADMIN_KEY;
  process.env.ADMIN_KEY = "test-secret";
  const server = createServer(createApp({ status: "Waiting for scan", qr: "test-qr" }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (originalKey === undefined) delete process.env.ADMIN_KEY;
    else process.env.ADMIN_KEY = originalKey;
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const unauthorized = await fetch(`${baseUrl}/api/status`);
  assert.equal(unauthorized.status, 401);

  const headers = { "x-admin-key": "test-secret" };
  const status = await fetch(`${baseUrl}/api/status`, { headers });
  assert.deepEqual(await status.json(), { status: "Waiting for scan", qrAvailable: true });

  const qr = await fetch(`${baseUrl}/qr`, { headers });
  assert.equal(qr.status, 200);
  assert.match(qr.headers.get("content-type"), /image\/png/);

  const quote = await fetch(`${baseUrl}/api/quote`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ materialKey: "crusher_dust", destinationKey: "sasaram", truckCount: 1 })
  });
  assert.equal((await quote.json()).total, 26700);
});

test("message parser unwraps ephemeral text", () => {
  assert.equal(extractMessageText({ ephemeralMessage: { message: { conversation: "rate" } } }), "rate");
});