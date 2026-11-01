import {
  createDatabaseTables,
  every,
  onClientCallback,
  onClientEvent,
} from "@aicore-fivem/lib/server";
import {
  createLogger,
  oneArg,
  readId,
  readInt,
} from "@aicore-fivem/lib/shared";
import { ResourceName } from "common";
import { EVENTS } from "common/drugs";
import { panel } from "../content";
import { harvest } from "./harvest";
import { registerSeed } from "./seed";
import { MINUTE, plants } from "./store";

const log = createLogger(ResourceName);

/** Loads the plants once the tables exist; the rot sweep starts after the load. */
const startPlants = () =>
  plants
    .load()
    .then(() =>
      every(MINUTE, () => plants.remove(plants.rotten(Date.now())), {
        name: "plantRot",
      }),
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
  (source, cx, cy) => plants.follow(source, cx, cy),
);

onClientCallback(EVENTS.harvest, { args: oneArg(readId), lock: true }, harvest);

registerSeed();
panel.onChange("settings", registerSeed);

// Tables first; the plants load after them.
createDatabaseTables(ResourceName, "sql/main.sql")
  .then(startPlants)
  .catch((error: unknown) => log.error("database setup failed", error));
