import {
  AdminWorld,
  cache,
  callAction,
  every,
  notify,
  onServerEvent,
  Points,
  progress,
  requestModel,
} from "@aicore-fivem/lib/client";
import { asArgs, readFinite, readId } from "@aicore-fivem/lib/shared";
import { Locale } from "common";
import {
  cellOf,
  EVENTS,
  growthOf,
  readLook,
  toPlant,
  type Plant,
} from "common/drugs";

const world = new AdminWorld(["plants"]);
const look = world.view("plants", readLook);

/**
 * The plants around the player: the server sends the 3x3 cells when the player's cell changes, then puts and
 * removes. Props are local; their stage follows the server clock (offset taken at the snapshot).
 */
class PlantView {
  private readonly plants = new Map<
    number,
    { plant: Plant; object: number; stage: number }
  >();
  private readonly points = new Points();
  private offset = 0;
  private growMinutes = 60;
  private cell = "";

  constructor() {
    every(2000, () => this.watchCell(), { name: "plantCell" });
    every(5000, () => this.render(), { name: "plantRender" });
  }

  private now(): number {
    return Date.now() + this.offset;
  }

  private watchCell(): void {
    const [x = 0, y = 0] = GetEntityCoords(cache.ped, false);
    const { cx, cy } = cellOf(x, y);
    const key = `${cx}:${cy}`;
    if (key === this.cell) return;
    this.cell = key;
    emitNet(EVENTS.area, cx, cy);
  }

  snapshot(list: Plant[], serverNow: number, growMinutes: number): void {
    for (const id of this.plants.keys()) this.remove(id);
    this.offset = serverNow - Date.now();
    this.growMinutes = growMinutes;
    // One render for the whole list (a render per plant would walk every plant each time).
    for (const plant of list) this.add(plant);
    void this.render();
  }

  put(plant: Plant): void {
    this.add(plant);
    void this.render();
  }

  /** Every prop goes again (the panel changed the models or the draw distance); the next render makes them. */
  restyle(): void {
    for (const entry of this.plants.values()) {
      if (entry.object) DeleteObject(entry.object);
      entry.object = 0;
    }
    void this.render();
  }

  private add(plant: Plant): void {
    this.remove(plant.id);
    this.plants.set(plant.id, { plant, object: 0, stage: -1 });
    this.points.add(String(plant.id), {
      coords: plant,
      radius: 1.5,
      icon: "seedling",
      label: () => {
        const growth = growthOf(plant, this.now(), this.growMinutes);
        return growth >= 1
          ? Locale("DRUGS_PROMPT_HARVEST")
          : Locale("DRUGS_PROMPT_GROWING", Math.floor(growth * 100));
      },
      onPressed: () => this.harvest(plant.id),
    });
  }

  remove(id: number): void {
    const entry = this.plants.get(id);
    if (!entry) return;
    if (entry.object) DeleteObject(entry.object);
    this.plants.delete(id);
    this.points.remove(String(id));
  }

  /** Props only within draw distance, swapped when a plant reaches its next stage. */
  private async render(): Promise<void> {
    // The growth text of the plant the player stands at follows the clock.
    this.points.refresh();
    const [x = 0, y = 0, z = 0] = GetEntityCoords(cache.ped, false);
    const { models, drawDistance } = look.value;
    for (const entry of this.plants.values()) {
      const { plant } = entry;
      const near =
        Math.hypot(plant.x - x, plant.y - y, plant.z - z) <= drawDistance;
      const growth = growthOf(plant, this.now(), this.growMinutes);
      const stage = growth >= 1 ? 2 : growth >= 0.4 ? 1 : 0;
      if (entry.object && (!near || stage !== entry.stage)) {
        DeleteObject(entry.object);
        entry.object = 0;
      }
      if (!near || entry.object) continue;
      const model = await requestModel(models[stage] ?? "").catch(() => 0);
      if (!model || !this.plants.has(plant.id) || entry.object) continue;
      entry.object = CreateObjectNoOffset(
        model,
        plant.x,
        plant.y,
        plant.z,
        false,
        false,
        false,
      );
      entry.stage = stage;
      FreezeEntityPosition(entry.object, true);
      SetModelAsNoLongerNeeded(model);
    }
  }

  async harvest(id: number): Promise<void> {
    if (!this.plants.has(id)) return;
    const done = await progress({
      label: Locale("DRUGS_HARVESTING"),
      duration: 5000,
      anim: { dict: "amb@world_human_gardener_plant@male@base", clip: "base" },
    });
    if (!done) return;
    const result = await callAction(EVENTS.harvest, [id], {
      fallback: "DRUGS_ERR_FAR",
    });
    if (!result) return;
    notify(
      result.destroyed === true
        ? Locale("DRUGS_DESTROYED")
        : Locale("DRUGS_HARVESTED", readFinite(result.count) ?? 0),
      "success",
    );
  }
}

const view = new PlantView();
world.onChange("plants", () => view.restyle());
onServerEvent(
  EVENTS.snapshot,
  {
    args: ([list, now, grow]): [Plant[], number, number] | null => {
      const serverNow = readFinite(now);
      const minutes = readFinite(grow);
      return Array.isArray(list) && serverNow !== null && minutes !== null
        ? [list.flatMap((p) => toPlant(p) ?? []), serverNow, minutes]
        : null;
    },
  },
  (list, now, grow) => view.snapshot(list, now, grow),
);
onServerEvent(EVENTS.put, { args: ([p]) => asArgs(toPlant(p)) }, (plant) =>
  view.put(plant),
);
onServerEvent(EVENTS.remove, { args: ([id]) => asArgs(readId(id)) }, (id) =>
  view.remove(id),
);
