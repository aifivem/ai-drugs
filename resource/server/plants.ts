import {
  aiLog,
  inventory,
  notify,
  onClientCallback,
  onClientEvent,
} from "@aicore-fivem/lib/server"
import { mysql } from "@aicore-fivem/mysql"
import { asArgs, createLogger } from "@aicore-fivem/lib/shared"
import { Locale, ResourceName } from "common"
import { cellKey, cellOf, EVENTS, type Plant } from "common/drugs"
import { content, core, fail, isPolice, pos } from "./content"

const log = createLogger(ResourceName)
type Stored = Plant & { owner: number }

/**
 * Every weed plant in memory, indexed by cell; players watch the 3x3 cells around them and get a snapshot when they
 * move to another cell, then only puts and removes of the cells they watch.
 */
class Plants {
  private readonly byId = new Map<number, Stored>()
  private readonly cells = new Map<string, Set<number>>()
  private readonly owners = new Map<number, number>()
  private readonly watching = new Map<
    number,
    { cx: number; cy: number; keys: Set<string> }
  >()

  async load(): Promise<void> {
    const rows = await mysql.query<
      Array<{
        id: number
        owner: number
        x: number
        y: number
        z: number
        planted_at: number
      }>
    >("SELECT id, owner, x, y, z, planted_at FROM ai_drugs_plants")
    for (const r of rows)
      this.index({
        id: Number(r.id),
        owner: Number(r.owner),
        x: r.x,
        y: r.y,
        z: r.z,
        plantedAt: Number(r.planted_at),
      })
    log.info(`${this.byId.size} plants loaded`)
    // Players who arrived before the load got an empty snapshot.
    for (const [source, w] of this.watching) this.watch(source, w.cx, w.cy)
  }

  private index(plant: Stored): void {
    this.byId.set(plant.id, plant)
    const { cx, cy } = cellOf(plant.x, plant.y)
    const key = cellKey(cx, cy)
    const cell = this.cells.get(key) ?? new Set<number>()
    cell.add(plant.id)
    this.cells.set(key, cell)
    this.owners.set(plant.owner, (this.owners.get(plant.owner) ?? 0) + 1)
  }

  get(id: number): Stored | undefined {
    return this.byId.get(id)
  }

  ownedBy(owner: number): number {
    return this.owners.get(owner) ?? 0
  }

  /** A plant within `metres` of the point (its cell and the neighbours). */
  near(x: number, y: number, metres: number): boolean {
    const { cx, cy } = cellOf(x, y)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const id of this.cells.get(cellKey(cx + dx, cy + dy)) ?? []) {
          const p = this.byId.get(id)
          if (p && Math.hypot(p.x - x, p.y - y) < metres) return true
        }
    return false
  }

  watch(source: number, cx: number, cy: number): void {
    const keys = new Set<string>()
    const list: Plant[] = []
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const key = cellKey(cx + dx, cy + dy)
        keys.add(key)
        for (const id of this.cells.get(key) ?? []) {
          const p = this.byId.get(id)
          if (p)
            list.push({
              id: p.id,
              x: p.x,
              y: p.y,
              z: p.z,
              plantedAt: p.plantedAt,
            })
        }
      }
    this.watching.set(source, { cx, cy, keys })
    emitNet(
      EVENTS.snapshot,
      source,
      list,
      Date.now(),
      content.settings.growMinutes
    )
  }

  unwatch(source: number): void {
    this.watching.delete(source)
  }

  private watchers(plant: Plant): number[] {
    const { cx, cy } = cellOf(plant.x, plant.y)
    const key = cellKey(cx, cy)
    return [...this.watching]
      .filter(([, w]) => w.keys.has(key))
      .map(([source]) => source)
  }

  async add(owner: number, x: number, y: number, z: number): Promise<void> {
    const plantedAt = Date.now()
    const id = await mysql.insert(
      "INSERT INTO ai_drugs_plants (owner, x, y, z, planted_at) VALUES (?, ?, ?, ?, FROM_UNIXTIME(? / 1000))",
      [owner, x, y, z, plantedAt]
    )
    if (id === null) throw new Error("plant insert returned no id")
    const plant: Stored = { id, owner, x, y, z, plantedAt }
    this.index(plant)
    const view: Plant = { id: plant.id, x, y, z, plantedAt }
    for (const source of this.watchers(plant)) emitNet(EVENTS.put, source, view)
  }

  remove(id: number): void {
    const plant = this.byId.get(id)
    if (!plant) return
    this.byId.delete(id)
    const { cx, cy } = cellOf(plant.x, plant.y)
    this.cells.get(cellKey(cx, cy))?.delete(id)
    const owned = (this.owners.get(plant.owner) ?? 1) - 1
    if (owned > 0) this.owners.set(plant.owner, owned)
    else this.owners.delete(plant.owner)
    for (const source of this.watchers(plant))
      emitNet(EVENTS.remove, source, id)
    mysql
      .query("DELETE FROM ai_drugs_plants WHERE id = ?", [id])
      .catch((error: unknown) => log.error(`plant ${id} delete failed`, error))
  }

  /** Plants left ready past the rot time. */
  rotten(now: number): number[] {
    const limit =
      (content.settings.growMinutes + content.settings.rotMinutes) * 60_000
    return [...this.byId.values()]
      .filter((p) => now - p.plantedAt > limit)
      .map((p) => p.id)
  }
}

export const plants = new Plants()
/** Loads the plants once the tables exist. */
export const startPlants = () =>
  plants
    .load()
    .catch((error: unknown) => log.error("plants could not be loaded", error))
setInterval(() => {
  for (const id of plants.rotten(Date.now())) plants.remove(id)
}, 60_000)

onClientEvent(
  EVENTS.area,
  {
    args: ([cx, cy]): [number, number] | null =>
      Number.isInteger(cx) && Number.isInteger(cy)
        ? [Number(cx), Number(cy)]
        : null,
    rate: { count: 2, windowMs: 1000 },
  },
  (source, cx, cy) => {
    const p = pos(source)
    const real = cellOf(p.x, p.y)
    // The client's cell may lag one cell behind the server's view of the ped.
    if (Math.abs(real.cx - cx) > 1 || Math.abs(real.cy - cy) > 1) return
    plants.watch(source, cx, cy)
  }
)

/** The weed seed: planted on foot, away from other plants, within the character's plant limit. */
async function plantSeed(source: number): Promise<void> {
  const ped = GetPlayerPed(String(source))
  const charId = core.GetCharacter(source)?.id
  if (charId === undefined || GetVehiclePedIsIn(ped, false)) return
  const p = pos(source)
  if (plants.near(p.x, p.y, 2))
    return notify(source, Locale("DRUGS_ERR_TOO_CLOSE"), "error")
  if (plants.ownedBy(charId) >= content.settings.maxPlants)
    return notify(
      source,
      Locale("DRUGS_ERR_MAX_PLANTS", content.settings.maxPlants),
      "error"
    )
  if (!inventory.removeItem(source, "weed_seed", 1)) return
  try {
    await plants.add(charId, p.x, p.y, p.z - 1)
  } catch (error) {
    log.error("planting failed", error)
    inventory.addItem(source, "weed_seed", 1)
    return
  }
  notify(
    source,
    Locale("DRUGS_PLANTED", content.settings.growMinutes),
    "success"
  )
  aiLog("drugs", "planted weed", { source })
}

onClientCallback(
  EVENTS.harvest,
  { args: ([id]) => asArgs(typeof id === "number" ? id : null), lock: true },
  (source, id) => {
    const plant = plants.get(id)
    if (!plant) return fail("DRUGS_ERR_GONE")
    const p = pos(source)
    if (Math.hypot(p.x - plant.x, p.y - plant.y, p.z - plant.z) > 3)
      return fail("DRUGS_ERR_FAR")
    const ready =
      Date.now() - plant.plantedAt >= content.settings.growMinutes * 60_000
    if (!ready) {
      if (!isPolice(source)) return fail("DRUGS_ERR_GROWING")
      plants.remove(id)
      aiLog("drugs", "destroyed a plant", { source })
      return { ok: true, destroyed: true }
    }
    const s = content.settings
    const count =
      s.budsMin + Math.floor(Math.random() * (s.budsMax - s.budsMin + 1))
    if (!inventory.addItem(source, "weed_bud", count))
      return fail("DRUGS_ERR_SPACE")
    plants.remove(id)
    aiLog("drugs", `harvested ${count} buds`, { source })
    return { ok: true, count }
  }
)

// The seed is taken inside plantSeed, once every check passed.
inventory.registerUsableItem("weed_seed", (source: number) => {
  void plantSeed(source)
  return false
})
on("playerDropped", () => plants.unwatch(Number(globalThis.source)))
