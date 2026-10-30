import { AdminPanel, online, resourceExport } from "@aicore-fivem/lib/server";
import { readSettings } from "common/drugs";
import { drugsSchema } from "./schema";

export const core = resourceExport("ai-core");
export const panel = new AdminPanel(drugsSchema);
/** Panel settings, parsed again after every change. */
export const settings = panel.view("settings", readSettings);

export const isPolice = (source: number) => {
  const duty = online.dutyJob(source);
  return duty !== null && settings.value.policeJobs.includes(duty);
};
export const policeOnDuty = () =>
  settings.value.policeJobs.reduce(
    (sum, job) => sum + online.onDutyFor(job).size,
    0,
  );
