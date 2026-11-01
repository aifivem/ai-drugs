import {
  aiLog,
  inventory,
  isNear,
  notify,
  progressFor,
} from "@aicore-fivem/lib/server";
import { fail, randomInt } from "@aicore-fivem/lib/shared";
import type { ActionResult } from "@aicore-fivem/shared";
import { Locale } from "common";
import { isPolice, settings } from "../content";
import { MINUTE, plants } from "./store";

/** The plant is gone or the player is not next to it. */
function harvestRefusal(source: number, id: number): ActionResult | null {
  const plant = plants.get(id);
  if (!plant) return fail("DRUGS_ERR_GONE");
  if (!isNear(source, plant, 3)) return fail("DRUGS_ERR_FAR");
  return null;
}

/** Harvests a ready plant (a growing one only the police destroy) after the progress bar. */
export async function harvest(
  source: number,
  id: number,
): Promise<ActionResult> {
  const refusal = harvestRefusal(source, id);
  if (refusal) return refusal;
  const done = await progressFor(source, {
    label: Locale("DRUGS_HARVESTING"),
    duration: 5000,
    anim: { dict: "amb@world_human_gardener_plant@male@base", clip: "base" },
    face: plants.get(id),
  });
  // A cancelled bar ends quietly.
  if (!done) return { ok: true };
  const again = harvestRefusal(source, id);
  if (again) return again;
  const plant = plants.get(id);
  if (!plant) return fail("DRUGS_ERR_GONE");
  const s = settings.value;
  const ready = Date.now() - plant.plantedAt >= s.growMinutes * MINUTE;
  if (!ready) {
    if (!isPolice(source)) return fail("DRUGS_ERR_GROWING");
    plants.remove([id]);
    aiLog("drugs", "destroyed a plant", { source });
    notify(source, Locale("DRUGS_DESTROYED"), "success");
    return { ok: true };
  }
  const count = randomInt(s.budsMin, s.budsMax);
  if (!inventory.addItem(source, s.budItem, count))
    return fail("DRUGS_ERR_SPACE");
  plants.remove([id]);
  aiLog("drugs", `harvested ${count} buds`, { source });
  notify(source, Locale("DRUGS_HARVESTED", count), "success");
  return { ok: true };
}
