import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const leadsPath = fileURLToPath(new URL("../data/leads.json", import.meta.url));
let writeQueue = Promise.resolve();

export async function getLeads() {
  try {
    return JSON.parse(await readFile(leadsPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export function saveLead(lead) {
  const operation = writeQueue.then(async () => {
    const leads = await getLeads();
    const savedLead = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...lead
    };

    await mkdir(dirname(leadsPath), { recursive: true });
    const temporaryPath = `${leadsPath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify([...leads, savedLead], null, 2)}\n`);
    await rename(temporaryPath, leadsPath);
    return savedLead;
  });

  writeQueue = operation.catch(() => {});
  return operation;
}