import type { FileSpec, TabSpec } from "@aicore-fivem/shared";
import { DEFAULT_LOOK } from "common/drugs";

export const plantsFile: FileSpec = {
  kind: "settings",
  sync: "all",
  sections: {
    models: {
      type: "object",
      fields: {
        small: { type: "text", min: 1, max: 64 },
        medium: { type: "text", min: 1, max: 64 },
        large: { type: "text", min: 1, max: 64 },
      },
    },
    drawDistance: { type: "number", min: 20, max: 300 },
  },
  defaults: {
    models: {
      small: DEFAULT_LOOK.models[0],
      medium: DEFAULT_LOOK.models[1],
      large: DEFAULT_LOOK.models[2],
    },
    drawDistance: DEFAULT_LOOK.drawDistance,
  },
};

export const plantLookTab: TabSpec = {
  id: "plantLook",
  file: "plants",
  icon: "flask",
  label: "ADMIN_TAB_LOOK",
  desc: "ADMIN_TAB_LOOK_DESC",
  cards: [
    {
      icon: "flask",
      title: "ADMIN_C_LOOK",
      desc: "ADMIN_C_LOOK_DESC",
      fields: [
        {
          widget: "model",
          kind: "object",
          path: "models.small",
          label: "ADMIN_F_MODEL_SMALL",
        },
        {
          widget: "model",
          kind: "object",
          path: "models.medium",
          label: "ADMIN_F_MODEL_MEDIUM",
        },
        {
          widget: "model",
          kind: "object",
          path: "models.large",
          label: "ADMIN_F_MODEL_LARGE",
        },
        {
          widget: "number",
          path: "drawDistance",
          label: "ADMIN_F_DRAW",
          hint: "ADMIN_H_DRAW",
          min: 20,
          max: 300,
          unit: "m",
        },
      ],
    },
  ],
};
