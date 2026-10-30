import { AdminPanel, resourceExport } from "@aicore-fivem/lib/server";
import { readSettings } from "common/drugs";
import { drugsSchema } from "./schema";

export const core = resourceExport("ai-core");
export const panel = new AdminPanel(drugsSchema);
/** Panel settings, parsed again after every change. */
export const content = { settings: readSettings(panel.get("settings")) };
panel.onChange(
  "settings",
  () => (content.settings = readSettings(panel.get("settings"))),
);

export const fail = (error: string) => ({ ok: false as const, error });

export function pos(source: number): { x: number; y: number; z: number } {
  const [x = 0, y = 0, z = 0] = GetEntityCoords(GetPlayerPed(String(source)));
  return { x, y, z };
}

export const isPolice = (source: number) => {
  const duty = core.GetDutyJob(source);
  return duty !== null && content.settings.policeJobs.includes(duty);
};
export const policeOnDuty = () =>
  content.settings.policeJobs.reduce(
    (sum, job) => sum + core.GetOnDutyCount(job),
    0,
  );
