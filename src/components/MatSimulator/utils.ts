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
// Verwijder (bijna) witte achtergrond door die pixels transparant te maken.
// threshold: hoe hoger, hoe "witter" een pixel moet zijn om verwijderd te worden (0-255).
export async function removeWhiteBackground(dataUrl: string, threshold = 245) {
  const img = await loadImage(dataUrl);

  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;

  const ctx = c.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, c.width, c.height);
  const d = imageData.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];

    // Als pixel (bijna) wit is → maak transparant
    if (r >= threshold && g >= threshold && b >= threshold) {
      d[i + 3] = 0; // alpha = 0
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // output is altijd png zodat transparantie behouden blijft
  return c.toDataURL("image/png");
}
