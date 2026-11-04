export const rates = {
  currency: "INR",
  truckCapacityTons: 30,
  materials: {
    "10mm_pink": { name: "10mm Pink Stone Gitti", materialPerTon: 1150 },
    "20mm_pink": { name: "20mm Pink Stone Gitti", materialPerTon: 1200 },
    river_baalu: { name: "River Sand (Baalu)", materialPerTon: 980 },
    crusher_dust: { name: "Crusher Dust", materialPerTon: 650 }
  },
  destinations: {
    dehri: { name: "Dehri-on-Sone", freightPerTon: 180 },
    sasaram: { name: "Sasaram", freightPerTon: 240 },
    rohtas: { name: "Rohtas", freightPerTon: 320 }
  }
};

export function getRates() {
  return structuredClone(rates);
}

export function quoteRate({ materialKey, destinationKey, truckCount = 1 }) {
  const material = rates.materials[materialKey];
  const destination = rates.destinations[destinationKey];
  const trucks = Number(truckCount);

  if (!material) throw new Error("Unknown material");
  if (!destination) throw new Error("Unknown destination");
  if (!Number.isInteger(trucks) || trucks < 1 || trucks > 100) {
    throw new Error("Truck count must be between 1 and 100");
  }

  const quantityTons = trucks * rates.truckCapacityTons;
  const materialCost = quantityTons * material.materialPerTon;
  const freightCost = quantityTons * destination.freightPerTon;

  return {
    materialKey,
    material: material.name,
    destinationKey,
    destination: destination.name,
    truckCount: trucks,
    quantityTons,
    materialPerTon: material.materialPerTon,
    freightPerTon: destination.freightPerTon,
    materialCost,
    freightCost,
    total: materialCost + freightCost,
    currency: rates.currency
  };
}