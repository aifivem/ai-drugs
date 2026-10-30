import { int, num, record, str } from "@aicore-fivem/lib/shared"

/** ai-drugs' contracts and panel content. No natives. */

export const EVENTS = {
  /** Callback: () -> { ok, item, count, price } sells to the stranger next to the player. */
  sell: "ai-drugs:sell",
  /** Client -> server: (cellX, cellY) the player's plant cell changed (snapshot of the 3x3 cells around it follows). */
  area: "ai-drugs:area",
  /** Server -> player: (plants: Plant[], serverNow, growMinutes) every plant around the player's cell. */
  snapshot: "ai-drugs:client:snapshot",
  /** Server -> players watching the cell: (plant: Plant) a plant was planted. */
  put: "ai-drugs:client:put",
  /** Server -> players watching the cell: (id) a plant was harvested, destroyed or rotted. */
  remove: "ai-drugs:client:remove",
  /** Callback: (plantId) -> { ok } harvests a ready plant, or destroys it (police). */
  harvest: "ai-drugs:harvest",
} as const

/** Plants are grouped in square cells of this many metres; a player watches the 3x3 cells around their own. */
export const CELL = 128
export const cellOf = (x: number, y: number) => ({
  cx: Math.floor(x / CELL),
  cy: Math.floor(y / CELL),
})
export const cellKey = (cx: number, cy: number) => `${cx}:${cy}`

export interface Plant {
  id: number
  x: number
  y: number
  z: number
  /** Server epoch milliseconds. */
  plantedAt: number
}

export function toPlant(v: unknown): Plant | null {
  const p = record(v)
  return typeof p.id === "number" &&
    typeof p.x === "number" &&
    typeof p.y === "number" &&
    typeof p.z === "number" &&
    typeof p.plantedAt === "number"
    ? { id: p.id, x: p.x, y: p.y, z: p.z, plantedAt: p.plantedAt }
    : null
}

export interface Settings {
  policeJobs: string[]
  account: string
  sellMinPolice: number
  /** Percent chance a sale alerts the police. */
  alertChance: number
  /** Percent chance a stranger says no. */
  refuseChance: number
  /** Seconds between two sales of one player. */
  saleCooldown: number
  /** Item -> price range per piece. */
  drugs: Array<{ name: string; min: number; max: number }>
  growMinutes: number
  /** Minutes a ready plant waits before it rots away. */
  rotMinutes: number
  maxPlants: number
  budsMin: number
  budsMax: number
}

export function readSettings(raw: unknown): Settings {
  const v = record(raw)
  const jobs = Array.isArray(v.policeJobs)
    ? v.policeJobs.filter((j): j is string => typeof j === "string")
    : []
  const drugs = (Array.isArray(v.drugs) ? v.drugs.map(record) : []).flatMap(
    (d) => {
      if (typeof d.name !== "string") return []
      const min = int(d.min, 0, 0)
      return [{ name: d.name, min, max: Math.max(min, int(d.max, min, 0)) }]
    }
  )
  const budsMin = int(v.budsMin, 3, 1, 100)
  return {
    policeJobs: jobs.length > 0 ? jobs : ["police"],
    account: str(v.account, "cash", 32),
    sellMinPolice: int(v.sellMinPolice, 0, 0, 32),
    alertChance: num(v.alertChance, 20, 0, 100),
    refuseChance: num(v.refuseChance, 20, 0, 100),
    saleCooldown: int(v.saleCooldown, 10, 1, 600),
    drugs,
    growMinutes: int(v.growMinutes, 60, 1, 10_080),
    rotMinutes: int(v.rotMinutes, 120, 1, 10_080),
    maxPlants: int(v.maxPlants, 5, 0, 100),
    budsMin,
    budsMax: Math.max(budsMin, int(v.budsMax, 8, 1, 100)),
  }
}

/** Growth 0..1 at a server time. */
export const growthOf = (
  plant: Plant,
  serverNow: number,
  growMinutes: number
) =>
  Math.min(
    1,
    Math.max(0, (serverNow - plant.plantedAt) / (growMinutes * 60_000))
  )
