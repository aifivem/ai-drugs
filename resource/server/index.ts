import {
  aiLog,
  aiLogChannels,
  coordsOf,
  createDatabaseTables,
  dispatch,
  entityCoords,
  inventory,
  isNear,
  onClientCallback,
  online,
} from "@aicore-fivem/lib/server";
import { createLogger, fail, oneArg, readId } from "@aicore-fivem/lib/shared";
import { Locale, ResourceName } from "common";
import { EVENTS } from "common/drugs";
import { core, policeOnDuty, settings } from "./content";
import { startPlants } from "./plants";

const log = createLogger(ResourceName);
aiLogChannels({ drugs: {} });

// Tables first; the plants load after them.
createDatabaseTables(ResourceName, "sql/main.sql")
  .then(startPlants)
  .catch((error: unknown) => log.error("database setup failed", error));

/**
 * When each character may sell again (Date.now), kept by character id so a reconnect does not reset it; expired
 * entries go on the next sale.
 */
const nextSale = new Map<number, number>();
/** Strangers who bought lately (entity -> until): one ped buys once, not every cooldown. */
const servedBuyers = new Map<number, number>();
const BUYER_MS = 10 * 60_000;

/** Drops expired entries of a deadline map. */
function prune(map: Map<number, number>, now: number): void {
  for (const [key, until] of map) if (until <= now) map.delete(key);
}

/** The stranger the client brought: a live ambient ped (not a player) within 3 m. */
function buyerNear(source: number, netId: number): number {
  const ped = NetworkGetEntityFromNetworkId(netId);
  if (
    !ped ||
    !DoesEntityExist(ped) ||
    GetEntityType(ped) !== 1 ||
    IsPedAPlayer(ped) ||
    GetEntityHealth(ped) <= 0
  )
    return 0;
  return isNear(source, entityCoords(ped), 3) ? ped : 0;
}

/**
 * A sale to the stranger the client brought over (checked: a real ped beside the player that has not bought
 * lately): the server picks the first drug of the panel list the player carries, the count and the price;
 * strangers may refuse and sales may alert the police.
 */
onClientCallback(
  EVENTS.sell,
  { args: oneArg(readId), lock: true },
  (source, buyerNetId) => {
    const s = settings.value;
    const now = Date.now();
    const charId = online.character(source)?.id;
    if (charId === undefined) return fail("DRUGS_ERR_NOTHING");
    if ((nextSale.get(charId) ?? 0) > now) return fail("DRUGS_ERR_WAIT");
    const buyer = buyerNear(source, buyerNetId);
    if (!buyer || (servedBuyers.get(buyer) ?? 0) > now)
      return fail("DRUGS_ERR_NO_BUYER");
    if (policeOnDuty() < s.sellMinPolice) return fail("DRUGS_ERR_POLICE");
    const drug = s.drugs.find(
      (d) => inventory.getItemCount(source, d.name) > 0,
    );
    if (!drug) return fail("DRUGS_ERR_NOTHING");
    prune(nextSale, now);
    prune(servedBuyers, now);
    nextSale.set(charId, now + s.saleCooldown * 1000);
    servedBuyers.set(buyer, now + BUYER_MS);
    if (Math.random() * 100 < s.refuseChance) return fail("DRUGS_ERR_REFUSED");
    const count = Math.min(
      inventory.getItemCount(source, drug.name),
      1 + Math.floor(Math.random() * 3),
    );
    const price =
      (drug.min + Math.floor(Math.random() * (drug.max - drug.min + 1))) *
      count;
    if (!inventory.removeItem(source, drug.name, count))
      return fail("DRUGS_ERR_NOTHING");
    core.AddMoney(source, s.account, price, "drugs:sale");
    if (Math.random() * 100 < s.alertChance)
      dispatch.alert({
        code: "10-31",
        title: Locale("DRUGS_ALERT"),
        coords: coordsOf(source),
        source,
        icon: "cannabis",
        blip: { sprite: 51, color: 1 },
      });
    aiLog("drugs", `sold ${count} ${drug.name}`, {
      source,
      metadata: { price },
    });
    return { ok: true, count, price };
  },
);
