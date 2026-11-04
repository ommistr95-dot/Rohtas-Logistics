import assert from "node:assert/strict";
import test from "node:test";
import { createBotHandler } from "../lib/bot.js";
import { quoteRate } from "../lib/rates.js";

test("quote uses corridor material and freight rates", () => {
  const quote = quoteRate({ materialKey: "10mm_pink", destinationKey: "dehri", truckCount: 2 });
  assert.equal(quote.quantityTons, 60);
  assert.equal(quote.materialCost, 69000);
  assert.equal(quote.freightCost, 10800);
  assert.equal(quote.total, 79800);
});

test("quote rejects invalid truck counts", () => {
  assert.throws(() => quoteRate({ materialKey: "10mm_pink", destinationKey: "dehri", truckCount: 0 }));
  assert.throws(() => quoteRate({ materialKey: "10mm_pink", destinationKey: "dehri", truckCount: 101 }));
});

test("bot quotes and saves a booking with name and loading date", async () => {
  const messages = [];
  const leads = [];
  const bot = createBotHandler({
    sendMessage: async (_jid, text) => messages.push(text),
    saveLead: async lead => {
      const savedLead = { id: "lead-1", ...lead };
      leads.push(savedLead);
      return savedLead;
    }
  });
  const jid = "919876543210@s.whatsapp.net";

  for (const text of ["rate", "1", "1", "2", "yes", "Asha Kumar", "31/02/2027", "04/12/2026"]) {
    await bot({ jid, text });
  }

  assert.equal(leads.length, 1);
  assert.equal(leads[0].name, "Asha Kumar");
  assert.equal(leads[0].loadingDate, "2026-12-04");
  assert.equal(leads[0].material, "10mm Pink Stone Gitti");
  assert.equal(leads[0].quoteTotal, 79800);
  assert.match(messages.at(-2), /DD\/MM\/YYYY/);
  assert.match(messages.at(-1), /Booking request save ho gayi/);
});