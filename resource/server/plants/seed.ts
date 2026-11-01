import {
  aiLog,
  coordsOf,
  inventory,
  notify,
  online,
  vehicleOf,
} from "@aicore-fivem/lib/server";
import { createLogger } from "@aicore-fivem/lib/shared";
import { Locale, ResourceName } from "common";
import { settings } from "../content";
import { plants, type Spot } from "./store";

const log = createLogger(ResourceName);

/** The weed seed: planted on foot, away from other plants, within the character's plant limit. */
async function plantSeed(source: number): Promise<void> {
  const s = settings.value;
  const charId = online.charId(source);
  if (charId === undefined || vehicleOf(source)) return;
  const p = coordsOf(source);
  if (plants.near(p.x, p.y, 2))
    return notify(source, Locale("DRUGS_ERR_TOO_CLOSE"), "error");
  if (plants.ownedBy(charId) >= s.maxPlants)
    return notify(source, Locale("DRUGS_ERR_MAX_PLANTS", s.maxPlants), "error");
  const spot: Spot = { owner: charId, x: p.x, y: p.y };
  // Held before the first await: a second seed used meanwhile sees this one.
  plants.reserve(spot);
  if (!inventory.removeItem(source, s.seedItem, 1)) {
    plants.release(spot);
    return;
  }
  try {
    await plants.add(spot, p.z - 1);
  } catch (error) {
    log.error("planting failed", error);
    inventory.addItem(source, s.seedItem, 1);
    return;
  }
  notify(source, Locale("DRUGS_PLANTED", s.growMinutes), "success");
  aiLog("drugs", "planted weed", { source });
}

// The seed is taken inside plantSeed, once every check passed. Each seed item name the panel ever sets is registered
// once (an item cannot be unregistered); only the current one plants.
const seedItems = new Set<string>();
export function registerSeed(): void {
  const name = settings.value.seedItem;
  if (seedItems.has(name)) return;
  seedItems.add(name);
  inventory.registerUsableItem(name, (source: number) => {
    if (name === settings.value.seedItem) void plantSeed(source);
    return false;
  });
}
