# ai-drugs

Street sales to strangers (switched on from the radial menu) and weed plants that grow outside, persist in the DB and are streamed to nearby players. Depends on ai-core (money, characters, duty, prompts, progress); uses the active inventory through ai-core's inventory layer (lib `inventory`), ai-police (`SendAlert`) and ai-radialmenu. Research: `docs/research/ai-drugs.md`.

## Decisions

- The server decides every sale (drug, count, price, refusal, alert); the client only brings a stranger over and shows the prompt.
- Plants: server memory is the truth (loaded once after `createDatabaseTables`), indexed by 128 m cell. A player sends `area` when their cell changes and gets the 3x3 cells as a snapshot (with the server time and growing time); after that only `put` / `remove` for the cells they watch.
- Growth is time only; the stage is computed on the client clock with the snapshot's offset. Props are local objects.
- Settings stay server-only (`sync: "admin"`); the client learns the growing time from the snapshot.

## Contracts

- Events and callbacks: `resource/common/drugs.ts`. Table `ai_drugs_plants` (`sql/main.sql`).
- Items: `weed_seed` (usable), `weed_bud`, `coke_baggy`, `meth_baggy`.

## Pitfalls

- The plant store loads after the tables exist (`startPlants` in the `createDatabaseTables` chain); players who sent `area` earlier get their snapshot again after the load.

## Entry points

- Sales `resource/server/index.ts`, plant store and streaming `resource/server/plants.ts`; client selling `resource/client/selling.ts`, plant view `resource/client/plants.ts`.
