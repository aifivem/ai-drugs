import {
  int,
  num,
  readFinite,
  readId,
  record,
  str,
} from "@aicore-fivem/lib/shared";

/** ai-drugs' contracts and panel content. No natives. */

export const EVENTS = {
  /** Callback: (buyerNetId) -> { ok, count, price } sells to the stranger next to the player. */
  sell: "ai-drugs:sell",
  /** Client -> server: (cellX, cellY) the player's plant cell changed (lib `AreaFollower`). */
  area: "ai-drugs:area",
  /** Server -> player: (reset, puts: Plant[], removes: id[], serverNow, growMinutes) the plants around the player (lib `AreaStream`: the 3x3 cells around it, then changes). */
  plants: "ai-drugs:client:plants",
  /** Callback: (plantId) -> { ok } harvests a ready plant, or destroys it (police). */
  harvest: "ai-drugs:harvest",
} as const;

/** Plants are grouped in square cells of this many metres; a player watches the 3x3 cells around their own. */
export const CELL = 128;

export interface Plant {
  id: number;
  x: number;
  y: number;
  z: number;
  /** Server epoch milliseconds. */
  plantedAt: number;
}

export function toPlant(v: unknown): Plant | null {
  const p = record(v);
  const id = readId(p.id);
  const x = readFinite(p.x);
  const y = readFinite(p.y);
  const z = readFinite(p.z);
  const plantedAt = readFinite(p.plantedAt);
  return id === null ||
    x === null ||
    y === null ||
    z === null ||
    plantedAt === null
    ? null
    : { id, x, y, z, plantedAt };
}

export interface Settings {
  policeJobs: string[];
  account: string;
  sellMinPolice: number;
  /** Percent chance a sale alerts the police. */
  alertChance: number;
  /** Percent chance a stranger says no. */
  refuseChance: number;
  /** Seconds between two sales of one player. */
  saleCooldown: number;
  /** Item -> price range per piece. */
  drugs: Array<{ name: string; min: number; max: number }>;
  growMinutes: number;
  /** Minutes a ready plant waits before it rots away. */
  rotMinutes: number;
  maxPlants: number;
  budsMin: number;
  budsMax: number;
  /** The usable item that plants, and the item a harvest gives. */
  seedItem: string;
  budItem: string;
}

export function readSettings(raw: unknown): Settings {
  const v = record(raw);
  const jobs = Array.isArray(v.policeJobs)
    ? v.policeJobs.filter((j): j is string => typeof j === "string")
    : [];
  const drugs = (Array.isArray(v.drugs) ? v.drugs.map(record) : []).flatMap(
    (d) => {
      if (typeof d.name !== "string") return [];
      const min = int(d.min, 0, 0);
      return [{ name: d.name, min, max: Math.max(min, int(d.max, min, 0)) }];
    },
  );
  const budsMin = int(v.budsMin, 3, 1, 100);
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
    seedItem: str(v.seedItem, "weed_seed", 48),
    budItem: str(v.budItem, "weed_bud", 48),
  };
}

/** What every client needs to draw plants (panel file `plants`, synced to everyone). */
export interface PlantLook {
  /** Prop per growth stage: small, medium, ready. */
  models: [string, string, string];
  /** Props exist only within this many metres. */
  drawDistance: number;
}

export const DEFAULT_LOOK: PlantLook = {
  models: [
    "bkr_prop_weed_01_small_01c",
    "bkr_prop_weed_med_01a",
    "bkr_prop_weed_lrg_01a",
  ],
  drawDistance: 100,
};

export function readLook(raw: unknown): PlantLook {
  const v = record(raw);
  const m = record(v.models);
  const [small, medium, large] = DEFAULT_LOOK.models;
  return {
    models: [
      str(m.small, small, 64),
      str(m.medium, medium, 64),
      str(m.large, large, 64),
    ],
    drawDistance: num(v.drawDistance, DEFAULT_LOOK.drawDistance, 20, 300),
  };
}

/** Growth 0..1 at a server time. */
export const growthOf = (
  plant: Plant,
  serverNow: number,
  growMinutes: number,
) =>
  Math.min(
    1,
    Math.max(0, (serverNow - plant.plantedAt) / (growMinutes * 60_000)),
  );
