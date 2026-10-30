import {
  cache,
  loadLocaleTexts,
  notify,
  onServerEvent,
  Points,
  progress,
  requestModel,
  triggerServerCallback,
} from "@aicore-fivem/lib/client"
import { asArgs, record } from "@aicore-fivem/lib/shared"
import { Locale } from "common"
import { cellOf, EVENTS, growthOf, toPlant, type Plant } from "common/drugs"

const texts = loadLocaleTexts()
const MODELS = [
  "bkr_prop_weed_01_small_01c",
  "bkr_prop_weed_med_01a",
  "bkr_prop_weed_lrg_01a",
]
const DRAW_DISTANCE = 100

/**
 * The plants around the player: the server sends the 3x3 cells when the player's cell changes, then puts and
 * removes. Props are local; their stage follows the server clock (offset taken at the snapshot).
 */
class PlantView {
  private readonly plants = new Map<
    number,
    { plant: Plant; object: number; stage: number }
  >()
  private readonly points = new Points()
  private offset = 0
  private growMinutes = 60
  private cell = ""

  constructor() {
    setInterval(() => this.watchCell(), 2000)
    setInterval(() => void this.render(), 5000)
  }

  private now(): number {
    return Date.now() + this.offset
  }

  private watchCell(): void {
    const [x = 0, y = 0] = GetEntityCoords(cache.ped, false)
    const { cx, cy } = cellOf(x, y)
    const key = `${cx}:${cy}`
    if (key === this.cell) return
    this.cell = key
    emitNet(EVENTS.area, cx, cy)
  }

  snapshot(list: Plant[], serverNow: number, growMinutes: number): void {
    for (const id of this.plants.keys()) this.remove(id)
    this.offset = serverNow - Date.now()
    this.growMinutes = growMinutes
    for (const plant of list) this.put(plant)
    void this.render()
  }

  put(plant: Plant): void {
    this.remove(plant.id)
    this.plants.set(plant.id, { plant, object: 0, stage: -1 })
    this.points.add(String(plant.id), {
      coords: plant,
      radius: 1.5,
      icon: "seedling",
      label: () => {
        const growth = growthOf(plant, this.now(), this.growMinutes)
        return growth >= 1
          ? Locale("DRUGS_PROMPT_HARVEST")
          : Locale("DRUGS_PROMPT_GROWING", Math.floor(growth * 100))
      },
      onPressed: () => this.harvest(plant.id),
    })
    void this.render()
  }

  remove(id: number): void {
    const entry = this.plants.get(id)
    if (!entry) return
    if (entry.object) DeleteObject(entry.object)
    this.plants.delete(id)
    this.points.remove(String(id))
  }

  /** Props only within draw distance, swapped when a plant reaches its next stage. */
  private async render(): Promise<void> {
    // The growth text of the plant the player stands at follows the clock.
    this.points.refresh()
    const [x = 0, y = 0, z = 0] = GetEntityCoords(cache.ped, false)
    for (const entry of this.plants.values()) {
      const { plant } = entry
      const near =
        Math.hypot(plant.x - x, plant.y - y, plant.z - z) <= DRAW_DISTANCE
      const growth = growthOf(plant, this.now(), this.growMinutes)
      const stage = growth >= 1 ? 2 : growth >= 0.4 ? 1 : 0
      if (entry.object && (!near || stage !== entry.stage)) {
        DeleteObject(entry.object)
        entry.object = 0
      }
      if (!near || entry.object) continue
      const model = await requestModel(MODELS[stage] ?? "").catch(() => 0)
      if (!model || !this.plants.has(plant.id) || entry.object) continue
      entry.object = CreateObjectNoOffset(
        model,
        plant.x,
        plant.y,
        plant.z,
        false,
        false,
        false
      )
      entry.stage = stage
      FreezeEntityPosition(entry.object, true)
      SetModelAsNoLongerNeeded(model)
    }
  }

  async harvest(id: number): Promise<void> {
    if (!this.plants.has(id)) return
    const done = await progress({
      label: Locale("DRUGS_HARVESTING"),
      duration: 5000,
      anim: { dict: "amb@world_human_gardener_plant@male@base", clip: "base" },
    })
    if (!done) return
    const result = record(
      await triggerServerCallback(EVENTS.harvest, [id]).catch(() => null)
    )
    if (result.ok !== true) {
      const key =
        typeof result.error === "string" ? result.error : "DRUGS_ERR_FAR"
      return notify(texts[key] ?? key, "error")
    }
    notify(
      result.destroyed === true
        ? Locale("DRUGS_DESTROYED")
        : Locale("DRUGS_HARVESTED", Number(result.count)),
      "success"
    )
  }
}

const view = new PlantView()
onServerEvent(
  EVENTS.snapshot,
  {
    args: ([list, now, grow]): [Plant[], number, number] | null =>
      Array.isArray(list) && typeof now === "number" && typeof grow === "number"
        ? [list.flatMap((p) => toPlant(p) ?? []), now, grow]
        : null,
  },
  (list, now, grow) => view.snapshot(list, now, grow)
)
onServerEvent(EVENTS.put, { args: ([p]) => asArgs(toPlant(p)) }, (plant) =>
  view.put(plant)
)
onServerEvent(
  EVENTS.remove,
  { args: ([id]) => asArgs(typeof id === "number" ? id : null) },
  (id) => view.remove(id)
)
