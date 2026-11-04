import { getRates, quoteRate } from "./rates.js";

const sessions = new Map();
const currency = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function normalized(value) {
  return value.trim().toLocaleLowerCase("en-IN");
}

function formatChoices(items) {
  return items.map(([key, item], index) => `${index + 1}. ${item.name}`).join("\n");
}

function chooseItem(text, items) {
  const entries = Object.entries(items);
  const value = normalized(text);
  const number = Number(value);
  if (Number.isInteger(number) && number >= 1 && number <= entries.length) {
    return entries[number - 1];
  }
  return entries.find(([key, item]) =>
    normalized(key) === value || normalized(item.name) === value
  );
}

function parseLoadingDate(value) {
  const input = value.trim();
  let year;
  let month;
  let day;

  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const indian = input.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (iso) {
    [, year, month, day] = iso;
  } else if (indian) {
    [, day, month, year] = indian;
  } else {
    return null;
  }

  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function welcome() {
  const { materials } = getRates();
  return `Namaste! Rohtas Logistics rate bot mein swagat hai.\n\nMaterial chuniye:\n${formatChoices(Object.entries(materials))}\n\nRate ya booking ke liye number bhejein. Restart: 0`;
}

export function createBotHandler({ sendMessage, saveLead }) {
  return async function handleMessage({ jid, text, pushName = "" }) {
    const message = text.trim();
    const value = normalized(message);
    if (!jid || !message) return;

    if (["0", "hi", "hello", "namaste", "rate", "rates", "quote", "start"].includes(value)) {
      sessions.set(jid, { step: "material", data: {} });
      await sendMessage(jid, welcome());
      return;
    }

    const session = sessions.get(jid);
    if (!session) {
      await sendMessage(jid, `Namaste${pushName ? ` ${pushName}` : ""}! Rate dekhne ke liye "rate" bhejein.`);
      return;
    }

    if (value === "cancel") {
      sessions.delete(jid);
      await sendMessage(jid, "Theek hai, request cancel kar di. Nayi quote ke liye rate bhejein.");
      return;
    }

    const { materials, destinations } = getRates();
    if (session.step === "material") {
      const selected = chooseItem(message, materials);
      if (!selected) {
        await sendMessage(jid, `Material number ya naam bhejein:\n${formatChoices(Object.entries(materials))}`);
        return;
      }
      session.data.materialKey = selected[0];
      session.data.material = selected[1].name;
      session.step = "destination";
      await sendMessage(jid, `Material: ${session.data.material}\n\nDestination chuniye:\n${formatChoices(Object.entries(destinations))}`);
      return;
    }

    if (session.step === "destination") {
      const selected = chooseItem(message, destinations);
      if (!selected) {
        await sendMessage(jid, `Destination number ya naam bhejein:\n${formatChoices(Object.entries(destinations))}`);
        return;
      }
      session.data.destinationKey = selected[0];
      session.data.destination = selected[1].name;
      session.step = "trucks";
      await sendMessage(jid, "Kitne 30-ton trucks chahiye? 1 se 100 tak number bhejein.");
      return;
    }

    if (session.step === "trucks") {
      try {
        session.data.quote = quoteRate({
          materialKey: session.data.materialKey,
          destinationKey: session.data.destinationKey,
          truckCount: message
        });
      } catch {
        await sendMessage(jid, "Truck count 1 se 100 ke beech number mein bhejein.");
        return;
      }
      const quote = session.data.quote;
      session.step = "booking";
      await sendMessage(jid, `*RATE QUOTE*\nMaterial: ${quote.material}\nDestination: ${quote.destination}\nQuantity: ${quote.quantityTons} ton (${quote.truckCount} truck)\nMaterial: ₹${currency.format(quote.materialCost)}\nFreight: ₹${currency.format(quote.freightCost)}\n*Total: ₹${currency.format(quote.total)}*\n\nBooking continue karne ke liye yes, warna no bhejein.`);
      return;
    }

    if (session.step === "booking") {
      if (["yes", "y", "haan", "ha", "book"].includes(value)) {
        session.step = "name";
        await sendMessage(jid, "Booking ke liye aapka naam kya hai?");
      } else if (["no", "n", "nahi"].includes(value)) {
        sessions.delete(jid);
        await sendMessage(jid, "Quote noted. Jab booking karni ho, rate bhejkar nayi request shuru karein.");
      } else {
        await sendMessage(jid, "Booking ke liye yes ya quote par rukne ke liye no bhejein.");
      }
      return;
    }

    if (session.step === "name") {
      if (message.length < 2 || message.length > 100) {
        await sendMessage(jid, "Kripya apna poora naam bhejein (2-100 characters).");
        return;
      }
      session.data.name = message;
      session.step = "loadingDate";
      await sendMessage(jid, "Loading date bhejein: DD/MM/YYYY ya YYYY-MM-DD.");
      return;
    }

    if (session.step === "loadingDate") {
      const loadingDate = parseLoadingDate(message);
      if (!loadingDate) {
        await sendMessage(jid, "Date samajh nahi aayi. DD/MM/YYYY ya YYYY-MM-DD format use karein.");
        return;
      }
      const lead = await saveLead({
        phone: jid,
        name: session.data.name,
        loadingDate,
        material: session.data.material,
        materialKey: session.data.materialKey,
        destination: session.data.destination,
        destinationKey: session.data.destinationKey,
        truckCount: session.data.quote.truckCount,
        quantityTons: session.data.quote.quantityTons,
        quoteTotal: session.data.quote.total
      });
      sessions.delete(jid);
      await sendMessage(jid, `Shukriya ${lead.name}! Booking request save ho gayi.\nMaterial: ${lead.material}\nLoading date: ${lead.loadingDate}\nTeam aapse confirm karegi.`);
    }
  };
}

export function resetBotSessions() {
  sessions.clear();
}