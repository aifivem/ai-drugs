import {
  aiLog,
  coordsOf,
  inventory,
  isNear,
  notify,
  onClientCallback,
  onClientEvent,
  online,
  PlayerMap,
} from "@aicore-fivem/lib/server";
import { mysql } from "@aicore-fivem/mysql";
import {
  createLogger,
  fail,
  oneArg,
  readId,
  readInt,
} from "@aicore-fivem/lib/shared";
import { Locale, ResourceName } from "common";
import { cellKey, cellOf, EVENTS, type Plant } from "common/drugs";
import { isPolice, panel, settings } from "./content";

const log = createLogger(ResourceName);
type Stored = Plant & { owner: number };
type Spot = { owner: number; x: number; y: number };

/** Rows per DELETE statement of the rot sweep. */
const DELETE_CHUNK = 500;
/** A snapshot with more plants than this goes as a latent event (about 60 bytes per plant). */
const LATENT_ABOVE = 50;
const MINUTE = 60_000;

/** Adds `value` to the set at `key`, creating it. */
function addTo<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  const set = map.get(key);
  if (set) set.add(value);
  else map.set(key, new Set([value]));
}
/** Removes `value` from the set at `key`, dropping an empty set. */
function removeFrom<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  const set = map.get(key);
  if (!set) return;
  set.delete(value);
  if (set.size === 0) map.delete(key);
}

/**
 * Every weed plant in memory, indexed by cell and by planted minute (the rot sweep reads only the minutes that just
 * passed the limit); players watch the 3x3 cells around them (`watchers` per cell) and get a snapshot when they move
 * to another cell, then only puts and removes of the cells they watch. A planting in flight holds its spot and its
 * owner's count (`pending`) until the INSERT answers, so quick seeds cannot pass the limit or stack.
 */
class Plants {
  private readonly byId = new Map<number, Stored>();
  private readonly cells = new Map<string, Set<number>>();
  private readonly byMinute = new Map<number, Set<number>>();
  private readonly owners = new Map<number, number>();
  private readonly pending = new Set<Spot>();
  /** Cell key -> players watching it; source -> the cells it watches. */
  private readonly watchers = new Map<string, Set<number>>();
  private readonly watching = new PlayerMap<{
    cx: number;
    cy: number;
    keys: string[];
  }>({ onDrop: (source, w) => this.forget(source, w.keys) });
  /** The last planted minute the rot sweep handled (-Infinity: none yet). */
  private swept = -Infinity;

  async load(): Promise<void> {
    const rows = await mysql.query<
      Array<{
        id: number;
        owner: number;
        x: number;
        y: number;
        z: number;
        planted_at: number;
      }>
    >("SELECT id, owner, x, y, z, planted_at FROM ai_drugs_plants");
    for (const r of rows)
      this.index({
        id: Number(r.id),
        owner: Number(r.owner),
        x: r.x,
        y: r.y,
        z: r.z,
        plantedAt: Number(r.planted_at),
      });
    log.info(`${this.byId.size} plants loaded`);
    // Players who arrived before the load got an empty snapshot.
    for (const [source, w] of this.watching) this.watch(source, w.cx, w.cy);
  }

  private index(plant: Stored): void {
    this.byId.set(plant.id, plant);
    const { cx, cy } = cellOf(plant.x, plant.y);
    addTo(this.cells, cellKey(cx, cy), plant.id);
    addTo(this.byMinute, Math.floor(plant.plantedAt / MINUTE), plant.id);
    this.owners.set(plant.owner, (this.owners.get(plant.owner) ?? 0) + 1);
  }

  get(id: number): Stored | undefined {
    return this.byId.get(id);
  }

  /** Plants of the owner, plantings in flight included. */
  ownedBy(owner: number): number {
    let count = this.owners.get(owner) ?? 0;
    for (const spot of this.pending) if (spot.owner === owner) count++;
    return count;
  }

  /** A plant (or a planting in flight) within `metres` of the point (its cell and the neighbours). */
  near(x: number, y: number, metres: number): boolean {
    for (const spot of this.pending)
      if (Math.hypot(spot.x - x, spot.y - y) < metres) return true;
    const { cx, cy } = cellOf(x, y);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const id of this.cells.get(cellKey(cx + dx, cy + dy)) ?? []) {
          const p = this.byId.get(id);
          if (p && Math.hypot(p.x - x, p.y - y) < metres) return true;
        }
    return false;
  }

  watch(source: number, cx: number, cy: number): void {
    const before = this.watching.get(source);
    if (before) this.forget(source, before.keys);
    const keys: string[] = [];
    const list: Plant[] = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const key = cellKey(cx + dx, cy + dy);
        keys.push(key);
        addTo(this.watchers, key, source);
        for (const id of this.cells.get(key) ?? []) {
          const p = this.byId.get(id);
          if (p)
            list.push({
              id: p.id,
              x: p.x,
              y: p.y,
              z: p.z,
              plantedAt: p.plantedAt,
            });
        }
      }
    this.watching.set(source, { cx, cy, keys });
    const args = [list, Date.now(), settings.value.growMinutes];
    if (list.length > LATENT_ABOVE)
      TriggerLatentClientEvent(EVENTS.snapshot, source, 25_000, ...args);
    else emitNet(EVENTS.snapshot, source, ...args);
  }

  private forget(source: number, keys: string[]): void {
    for (const key of keys) removeFrom(this.watchers, key, source);
  }

  private watchersOf(plant: Plant): ReadonlySet<number> {
    const { cx, cy } = cellOf(plant.x, plant.y);
    return this.watchers.get(cellKey(cx, cy)) ?? new Set();
  }

  /** Plants at a spot held by `reserve`; the spot is released whatever the INSERT does. */
  async add(spot: Spot, z: number): Promise<void> {
    const plantedAt = Date.now();
    try {
      const id = await mysql.insert(
        "INSERT INTO ai_drugs_plants (owner, x, y, z, planted_at) VALUES (?, ?, ?, ?, FROM_UNIXTIME(? / 1000))",
        [spot.owner, spot.x, spot.y, z, plantedAt],
      );
      if (id === null) throw new Error("plant insert returned no id");
      const plant: Stored = {
        id,
        owner: spot.owner,
        x: spot.x,
        y: spot.y,
        z,
        plantedAt,
      };
      this.index(plant);
      const view: Plant = { id, x: spot.x, y: spot.y, z, plantedAt };
      for (const source of this.watchersOf(plant))
        emitNet(EVENTS.put, source, view);
    } finally {
      this.pending.delete(spot);
    }
  }

  /** Holds a spot for a planting in flight. */
  reserve(spot: Spot): void {
    this.pending.add(spot);
  }

  release(spot: Spot): void {
    this.pending.delete(spot);
  }

  /** Takes plants out of memory, tells the watchers, and deletes the rows in chunks (one statement per chunk). */
  remove(ids: number[]): void {
    const gone: number[] = [];
    for (const id of ids) {
      const plant = this.byId.get(id);
      if (!plant) continue;
      this.byId.delete(id);
      const { cx, cy } = cellOf(plant.x, plant.y);
      removeFrom(this.cells, cellKey(cx, cy), id);
      removeFrom(this.byMinute, Math.floor(plant.plantedAt / MINUTE), id);
      const owned = (this.owners.get(plant.owner) ?? 1) - 1;
      if (owned > 0) this.owners.set(plant.owner, owned);
      else this.owners.delete(plant.owner);
      for (const source of this.watchersOf(plant))
        emitNet(EVENTS.remove, source, id);
      gone.push(id);
    }
    for (let i = 0; i < gone.length; i += DELETE_CHUNK) {
      const chunk = gone.slice(i, i + DELETE_CHUNK);
      mysql
        .query("DELETE FROM ai_drugs_plants WHERE id IN (?)", [chunk])
        .catch((error: unknown) =>
          log.error(`delete of ${chunk.length} plants failed`, error),
        );
    }
  }

  /**
   * Plants left ready past the rot time: every plant of each planted minute that is wholly past the limit (a plant
   * rots up to a minute late). Only minutes not swept yet are read.
   */
  rotten(now: number): number[] {
    const s = settings.value;
    const cutoff =
      Math.floor((now - (s.growMinutes + s.rotMinutes) * MINUTE) / MINUTE) - 1;
    const out: number[] = [];
    if (this.swept === -Infinity) {
      for (const [minute, ids] of this.byMinute)
        if (minute <= cutoff) out.push(...ids);
    } else
      for (let minute = this.swept + 1; minute <= cutoff; minute++)
        out.push(...(this.byMinute.get(minute) ?? []));
    this.swept = Math.max(this.swept, cutoff);
    return out;
  }
}

export const plants = new Plants();
/** Loads the plants once the tables exist; the rot sweep starts after the load. */
export const startPlants = () =>
  plants
    .load()
    .then(() =>
      setInterval(() => plants.remove(plants.rotten(Date.now())), MINUTE),
    )
    .catch((error: unknown) => log.error("plants could not be loaded", error));

onClientEvent(
  EVENTS.area,
  {
    args: ([cx, cy]): [number, number] | null => {
      const x = readInt(cx, -1000, 1000);
      const y = readInt(cy, -1000, 1000);
      return x === null || y === null ? null : [x, y];
    },
    rate: { count: 2, windowMs: 1000 },
  },
  (source, cx, cy) => {
    const p = coordsOf(source);
    const real = cellOf(p.x, p.y);
    // The client's cell may lag one cell behind the server's view of the ped.
    if (Math.abs(real.cx - cx) > 1 || Math.abs(real.cy - cy) > 1) return;
    plants.watch(source, cx, cy);
  },
);

/** The weed seed: planted on foot, away from other plants, within the character's plant limit. */
async function plantSeed(source: number): Promise<void> {
  const s = settings.value;
  const ped = GetPlayerPed(String(source));
  const charId = online.character(source)?.id;
  if (charId === undefined || GetVehiclePedIsIn(ped, false)) return;
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

onClientCallback(
  EVENTS.harvest,
  { args: oneArg(readId), lock: true },
  (source, id) => {
    const plant = plants.get(id);
    if (!plant) return fail("DRUGS_ERR_GONE");
    if (!isNear(source, plant, 3)) return fail("DRUGS_ERR_FAR");
    const s = settings.value;
    const ready = Date.now() - plant.plantedAt >= s.growMinutes * MINUTE;
    if (!ready) {
      if (!isPolice(source)) return fail("DRUGS_ERR_GROWING");
      plants.remove([id]);
      aiLog("drugs", "destroyed a plant", { source });
      return { ok: true, destroyed: true };
    }
    const count =
      s.budsMin + Math.floor(Math.random() * (s.budsMax - s.budsMin + 1));
    if (!inventory.addItem(source, s.budItem, count))
      return fail("DRUGS_ERR_SPACE");
    plants.remove([id]);
    aiLog("drugs", `harvested ${count} buds`, { source });
    return { ok: true, count };
  },
);

// The seed is taken inside plantSeed, once every check passed. Each seed item name the panel ever sets is registered
// once (an item cannot be unregistered); only the current one plants.
const seedItems = new Set<string>();
function registerSeed(): void {
  const name = settings.value.seedItem;
  if (seedItems.has(name)) return;
  seedItems.add(name);
  inventory.registerUsableItem(name, (source: number) => {
    if (name === settings.value.seedItem) void plantSeed(source);
    return false;
  });
}
registerSeed();
panel.onChange("settings", registerSeed);
