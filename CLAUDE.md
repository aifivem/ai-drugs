# ai-drugs

Street sales to strangers (switched on from the radial menu) and weed plants that grow outside, persist in the DB and are streamed to nearby players. Depends on ai-core (money, characters, duty, prompts, progress, radial layer); uses the active inventory through ai-core's inventory layer (lib `inventory`), police alerts through lib `dispatch`, the sell switch through lib `radial` (any radial menu).

## Decisions

- The server decides every sale (drug, count, price, refusal, alert); the client only brings a networked stranger over and sends its net id. The server checks that ped: alive, not a player, within 3 m, and not a buyer of the last 10 minutes. The sale cooldown is a lib `KeyedCooldowns` by character id (survives a reconnect), the served buyers one by entity.
- Police on duty and the police check come from lib `online` (`onDutyFor`, `dutyJob`).
- Plants: server memory is the truth (loaded once after `createDatabaseTables`), indexed by 128 m cell and by planted minute. A player sends `area` when their cell changes and gets the 3x3 cells as a snapshot (with the server time and growing time; a latent event above 50 plants); after that only `put` / `remove` for the cells they watch (watcher sets per cell, so a change costs the watchers of one cell).
- A planting in flight holds its spot and its owner's count until the INSERT answers (`reserve`), so quick seeds cannot pass `maxPlants` or stack within 2 m.
- The rot sweep (every minute, after the load) reads only the planted minutes that just passed grow + rot time and deletes rows with one `DELETE ... WHERE id IN (?)` per 500. Bench: `packages/lib/bench/scripts-b.bench.ts`.
- Growth is time only; the stage is computed on the client clock with the snapshot's offset. Props are local objects.
- Settings stay server-only (`sync: "admin"`, seed and harvest item names included); the client learns the growing time from the snapshot. The plant props per stage and the draw distance are the `plants` file (`sync: "all"`); a change there rebuilds every prop. A seed item set in the panel is registered as usable at once (every name ever set stays registered, only the current one plants).

## Contracts

- Events and callbacks: `resource/common/drugs.ts`. Table `ai_drugs_plants` (`sql/main.sql`).
- Items (defaults, panel): `weed_seed` (usable), `weed_bud`, `coke_baggy`, `meth_baggy`.

## Pitfalls

- The plant store loads after the tables exist (`startPlants` in the `createDatabaseTables` chain); players who sent `area` earlier get their snapshot again after the load.

## Entry points

- Sales `resource/server/index.ts`, plant store and streaming `resource/server/plants.ts`; client selling `resource/client/selling.ts`, plant view and harvest points (lib `Points`, the growth text is a label function) `resource/client/plants.ts`.
