import { aiLog, aiLogChannels, createDatabaseTables, onClientCallback, optionalExport } from "@aicore-fivem/lib/server";
import { createLogger } from "@aicore-fivem/lib/shared";
import { Locale, ResourceName } from "common";
import { EVENTS } from "common/drugs";
import { content, core, fail, policeOnDuty, pos } from "./content";
import { startPlants } from "./plants";

const log = createLogger(ResourceName);
aiLogChannels({ drugs: {} });

// Tables first; the plants load after them.
createDatabaseTables(ResourceName, "sql/main.sql")
  .then(startPlants)
  .catch((error: unknown) => log.error("database setup failed", error));

/** When each player may sell again (server clock). */
const nextSale = new Map<number, number>();

/**
 * A sale to the stranger the client brought over: the server picks the first drug of the panel list the player
 * carries, the count and the price; strangers may refuse and sales may alert the police.
 */
onClientCallback(
  EVENTS.sell,
  (source) => {
    const s = content.settings;
    const now = Date.now();
    if ((nextSale.get(source) ?? 0) > now) return fail("DRUGS_ERR_WAIT");
    if (policeOnDuty() < s.sellMinPolice) return fail("DRUGS_ERR_POLICE");
    const inventory = optionalExport("ai-inventory");
    const drug = s.drugs.find((d) => (inventory?.GetItemCount(source, d.name) ?? 0) > 0);
    if (!inventory || !drug) return fail("DRUGS_ERR_NOTHING");
    nextSale.set(source, now + s.saleCooldown * 1000);
    if (Math.random() * 100 < s.refuseChance) return fail("DRUGS_ERR_REFUSED");
    const count = Math.min(inventory.GetItemCount(source, drug.name), 1 + Math.floor(Math.random() * 3));
    const price = (drug.min + Math.floor(Math.random() * (drug.max - drug.min + 1))) * count;
    if (!inventory.RemoveItem(source, drug.name, count)) return fail("DRUGS_ERR_NOTHING");
    core.AddMoney(source, s.account, price, "drugs:sale");
    if (Math.random() * 100 < s.alertChance) {
      const p = pos(source);
      optionalExport("ai-police")?.SendAlert(p.x, p.y, p.z, Locale("DRUGS_ALERT"));
    }
    aiLog("drugs", `sold ${count} ${drug.name}`, { source, metadata: { price } });
    return { ok: true, count, price };
  },
  { lock: true },
);

on("playerDropped", () => nextSale.delete(Number(globalThis.source)));
