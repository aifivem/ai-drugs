import type { TabSpec } from "@aicore-fivem/shared";

export const plantsTab: TabSpec = {
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
        {
          widget: "number",
          path: "growMinutes",
          label: "ADMIN_F_GROW",
          min: 1,
          max: 10_080,
          unit: "min",
        },
        {
          widget: "number",
          path: "rotMinutes",
          label: "ADMIN_F_ROT",
          hint: "ADMIN_H_ROT",
          min: 1,
          max: 10_080,
          unit: "min",
        },
        {
          widget: "number",
          path: "maxPlants",
          label: "ADMIN_F_MAX_PLANTS",
          hint: "ADMIN_H_MAX_PLANTS",
          min: 0,
          max: 100,
        },
        {
          widget: "number",
          path: "budsMin",
          label: "ADMIN_F_BUDS_MIN",
          min: 1,
          max: 100,
        },
        {
          widget: "number",
          path: "budsMax",
          label: "ADMIN_F_BUDS_MAX",
          min: 1,
          max: 100,
        },
        {
          widget: "text",
          lookup: "item",
          path: "seedItem",
          label: "ADMIN_F_SEED_ITEM",
          hint: "ADMIN_H_SEED_ITEM",
          placeholder: "ADMIN_P_SEED_ITEM",
        },
        {
          widget: "text",
          lookup: "item",
          path: "budItem",
          label: "ADMIN_F_BUD_ITEM",
          hint: "ADMIN_H_BUD_ITEM",
          placeholder: "ADMIN_P_ITEM",
        },
      ],
    },
  ],
};
