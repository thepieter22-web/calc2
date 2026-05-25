import type { SizePreset } from "./types";

export const SIZE_PRESETS: SizePreset[] = [
  { id: "40x60", label: "40 × 60 cm (400 × 600 mm)", widthMm: 400, heightMm: 600 },
  { id: "60x85", label: "60 × 85 cm (600 × 850 mm)", widthMm: 600, heightMm: 850 },
  { id: "85x115", label: "85 × 115 cm (850 × 1150 mm)", widthMm: 850, heightMm: 1150 },
  { id: "115x175", label: "115 × 175 cm (1150 × 1750 mm)", widthMm: 1150, heightMm: 1750 }
];
