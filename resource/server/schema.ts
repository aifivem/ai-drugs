import type { PanelSchema } from "@aicore-fivem/shared";

const int = (min: number, max: number) => ({ type: "number", min, max, integer: true }) as const;

/** ai-drugs' panel: street sales and weed plants (server only). */
export const drugsSchema: PanelSchema = {
  title: "ADMIN_TITLE",
  icon: "flask",
  files: {
    settings: {
      kind: "settings",
      sync: "admin",
      sections: {
        policeJobs: { type: "names", lookup: "job", max: 10, itemMax: 32, pattern: "^[a-z0-9_]{2,32}$" },
        account: { type: "text", lookup: "account", min: 2, max: 32 },
        sellMinPolice: int(0, 32),
        alertChance: int(0, 100),
        refuseChance: int(0, 100),
        saleCooldown: int(1, 600),
        drugs: {
          type: "list",
          max: 30,
          of: { type: "object", fields: { name: { type: "text", lookup: "item", min: 2, max: 48, pattern: "^[a-z0-9_]{2,48}$" }, min: int(0, 1_000_000), max: int(0, 1_000_000) } },
        },
        growMinutes: int(1, 10_080),
        rotMinutes: int(1, 10_080),
        maxPlants: int(0, 100),
        budsMin: int(1, 100),
        budsMax: int(1, 100),
      },
    },
  },
  tabs: [
    {
      id: "selling",
      file: "settings",
      icon: "money-bill-wave",
      label: "ADMIN_TAB_SELLING",
      desc: "ADMIN_TAB_SELLING_DESC",
      cards: [
        {
          icon: "money-bill-wave",
          title: "ADMIN_C_SELLING",
          desc: "ADMIN_C_SELLING_DESC",
          fields: [
            {
              widget: "list",
              path: "drugs",
              label: "ADMIN_F_DRUGS",
              addLabel: "ADMIN_ADD_DRUG",
              max: 30,
              newRow: { name: "weed_bud", min: 40, max: 80 },
              rows: [
                { widget: "text", lookup: "item", path: "name", label: "ADMIN_F_ITEM", placeholder: "ADMIN_P_ITEM" },
                { widget: "number", path: "min", label: "ADMIN_F_MIN", min: 0, max: 1_000_000, unit: "$" },
                { widget: "number", path: "max", label: "ADMIN_F_MAX", min: 0, max: 1_000_000, unit: "$" },
              ],
            },
            { widget: "number", path: "saleCooldown", label: "ADMIN_F_COOLDOWN", hint: "ADMIN_H_COOLDOWN", min: 1, max: 600, unit: "s" },
            { widget: "number", path: "refuseChance", label: "ADMIN_F_REFUSE", min: 0, max: 100, unit: "%" },
            { widget: "number", path: "alertChance", label: "ADMIN_F_ALERT", hint: "ADMIN_H_ALERT", min: 0, max: 100, unit: "%" },
            { widget: "number", path: "sellMinPolice", label: "ADMIN_F_MIN_POLICE", min: 0, max: 32 },
            { widget: "tags", lookup: "job", path: "policeJobs", label: "ADMIN_F_POLICE_JOBS", hint: "ADMIN_H_POLICE_JOBS", placeholder: "ADMIN_P_POLICE_JOBS" },
            { widget: "text", lookup: "account", path: "account", label: "ADMIN_F_ACCOUNT", hint: "ADMIN_H_ACCOUNT", placeholder: "ADMIN_P_ACCOUNT" },
          ],
        },
      ],
    },
    {
      id: "plants",
      file: "settings",
      icon: "flask",
      label: "ADMIN_TAB_PLANTS",
      desc: "ADMIN_TAB_PLANTS_DESC",
      cards: [
        {
          icon: "flask",
          title: "ADMIN_C_PLANTS",
          desc: "ADMIN_C_PLANTS_DESC",
          fields: [
            { widget: "number", path: "growMinutes", label: "ADMIN_F_GROW", min: 1, max: 10_080, unit: "min" },
            { widget: "number", path: "rotMinutes", label: "ADMIN_F_ROT", hint: "ADMIN_H_ROT", min: 1, max: 10_080, unit: "min" },
            { widget: "number", path: "maxPlants", label: "ADMIN_F_MAX_PLANTS", hint: "ADMIN_H_MAX_PLANTS", min: 0, max: 100 },
            { widget: "number", path: "budsMin", label: "ADMIN_F_BUDS_MIN", min: 1, max: 100 },
            { widget: "number", path: "budsMax", label: "ADMIN_F_BUDS_MAX", min: 1, max: 100 },
          ],
        },
      ],
    },
  ],
};
