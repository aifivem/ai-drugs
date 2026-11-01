import type { PanelSchema } from "@aicore-fivem/shared";
import { plantLookTab, plantsFile } from "./plantLook";
import { plantsTab } from "./plants";
import { sellingTab, settingsFile } from "./selling";

/** ai-drugs' panel: street sales and weed plants (server only), and the plant props every client draws. */
export const drugsSchema: PanelSchema = {
  title: "ADMIN_TITLE",
  icon: "flask",
  files: {
    settings: settingsFile,
    plants: plantsFile,
  },
  tabs: [sellingTab, plantsTab, plantLookTab],
};
