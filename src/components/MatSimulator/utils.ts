import type { MatConfig, PreviewSettings } from "./types";

export function computeMmToPxScale(config: MatConfig, preview: PreviewSettings) {
  const usableW = preview.canvasW - preview.paddingPx * 2;
  const usableH = preview.canvasH - preview.paddingPx * 2;
  const sx = usableW / config.widthMm;
  const sy = usableH / config.heightMm;
  return Math.min(sx, sy);
}

export function adjustColorForUse(hex: string, use: "binnen" | "buiten") {
  if (use === "binnen") return hex;
  const c = hex.replace("#", "");
  const r = Math.max(0, parseInt(c.slice(0, 2), 16) - 18);
  const g = Math.max(0, parseInt(c.slice(2, 4), 16) - 18);
  const b = Math.max(0, parseInt(c.slice(4, 6), 16) - 18);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
    .toString(16)
    .padStart(2, "0")}`;
}

export function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
