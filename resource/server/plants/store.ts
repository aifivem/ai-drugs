import { AreaStream } from "@aicore-fivem/lib/server";
import { mysql } from "@aicore-fivem/mysql";
import { createLogger, flatDistance } from "@aicore-fivem/lib/shared";
import { ResourceName } from "common";
import { CELL, EVENTS, type Plant } from "common/drugs";
import { settings } from "../content";
import { addTo, removeFrom } from "./setMap";

const log = createLogger(ResourceName);
type Stored = Plant & { owner: number };
export type Spot = { owner: number; x: number; y: number };

/** Rows per DELETE statement of the rot sweep. */
const DELETE_CHUNK = 500;
export const MINUTE = 60_000;

const viewOf = (p: Stored): Plant => ({
  id: p.id,
  x: p.x,
  y: p.y,
  z: p.z,
  plantedAt: p.plantedAt,
});

/**
 * Every weed plant in memory, streamed by 128 m cell (lib `AreaStream`: the 3x3 cells around the player, then puts
 * and removes, with the server clock for the growth countdown) and indexed by planted minute (the rot sweep reads only
 * the minutes that just passed the limit). A planting in flight holds its spot and its owner's count (`pending`) until
 * the INSERT answers, so quick seeds cannot pass the limit or stack.
 */
class Plants {
  private readonly stream = new AreaStream<Stored, Plant>({
    event: EVENTS.plants,
    view: viewOf,
    cellSize: CELL,
    extra: () => [Date.now(), settings.value.growMinutes],
  });
  private readonly byMinute = new Map<number, Set<number>>();
  private readonly owners = new Map<number, number>();
  private readonly pending = new Set<Spot>();
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
    const loaded = rows.map((r): Stored => ({
      id: Number(r.id),
      owner: Number(r.owner),
      x: r.x,
      y: r.y,
      z: r.z,
      plantedAt: Number(r.planted_at),
    }));
    for (const plant of loaded) this.count(plant);
    // Players who arrived before the load get their area again.
    this.stream.load(loaded);
    log.info(`${this.stream.size} plants loaded`);
  }

  private count(plant: Stored): void {
    addTo(this.byMinute, Math.floor(plant.plantedAt / MINUTE), plant.id);
    this.owners.set(plant.owner, (this.owners.get(plant.owner) ?? 0) + 1);
  }

  get(id: number): Stored | undefined {
    return this.stream.get(id);
  }

  /** Plants of the owner, plantings in flight included. */
  ownedBy(owner: number): number {
    let count = this.owners.get(owner) ?? 0;
    for (const spot of this.pending) if (spot.owner === owner) count++;
    return count;
  }

  /** A plant (or a planting in flight) within `metres` of the point (its cell and the neighbours). */
  near(x: number, y: number, metres: number): boolean {
    const at = { x, y };
    for (const spot of this.pending)
      if (flatDistance(spot, at) < metres) return true;
    for (const p of this.stream.around(x, y))
      if (flatDistance(p, at) < metres) return true;
    return false;
  }

  /** The player's cell as its client reported it (checked against the server's position). */
  follow(source: number, cx: number, cy: number): void {
    this.stream.followReported(source, cx, cy);
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
      this.count(plant);
      this.stream.set(plant);
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
      const plant = this.stream.get(id);
      if (!plant) continue;
      this.stream.delete(id);
      removeFrom(this.byMinute, Math.floor(plant.plantedAt / MINUTE), id);
      const owned = (this.owners.get(plant.owner) ?? 1) - 1;
      if (owned > 0) this.owners.set(plant.owner, owned);
      else this.owners.delete(plant.owner);
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
