"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type MatUse = "binnen" | "buiten";
type Placement = "vloer" | "verzonken";
type Orientation = "liggend" | "staand";

type MatConfig = {
  use: MatUse;
  placement: Placement;
  orientation: Orientation;
  rubberRand: boolean;
  widthMm: number;
  heightMm: number;
  matColor: string;
};

type LogoState = {
  dataUrl?: string;
  preparedDataUrl?: string;
  x: number; // center x on canvas
  y: number; // center y on canvas
  scale: number;
  rotationDeg: number;
  opacity: number;
};

type PreviewSettings = {
  canvasW: number;
  canvasH: number;
  paddingPx: number;
};

const PREVIEW: PreviewSettings = {
  canvasW: 900,
  canvasH: 560,
  paddingPx: 36,
};

const DEFAULT_CONFIG: MatConfig = {
  use: "binnen",
  placement: "vloer",
  orientation: "liggend",
  rubberRand: true,
  widthMm: 850,
  heightMm: 600,
  matColor: "#2d2d2d",
};

const DEFAULT_LOGO: LogoState = {
  dataUrl: undefined,
  preparedDataUrl: undefined,
  x: PREVIEW.canvasW / 2,
  y: PREVIEW.canvasH / 2,
  scale: 1,
  rotationDeg: 0,
  opacity: 1,
};

const SIZE_PRESETS = [
  { id: "60x85", widthMm: 850, heightMm: 600, label: "60 × 85 cm" },
  { id: "85x115", widthMm: 1150, heightMm: 850, label: "85 × 115 cm" },
  { id: "115x180", widthMm: 1800, heightMm: 1150, label: "115 × 180 cm" },
  { id: "150x250", widthMm: 2500, heightMm: 1500, label: "150 × 250 cm" },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function mmToCm(mm: number) {
  return mm / 10;
}

function cmToMm(cm: number) {
  return Math.round(cm * 10);
}

function getPresetLabelCm(widthMm: number, heightMm: number) {
  const smallest = Math.min(widthMm, heightMm);
  const largest = Math.max(widthMm, heightMm);
  return `${mmToCm(smallest)} × ${mmToCm(largest)} cm`;
}

/**
 * Zorgt dat elke maat visueel stabiel wordt getoond.
 */
function computeStableMmToPxScale(widthMm: number, heightMm: number, preview: PreviewSettings) {
  const maxPresetLongest = Math.max(
    ...SIZE_PRESETS.map((p) => Math.max(p.widthMm, p.heightMm))
  );
  const maxPresetShortest = Math.max(
    ...SIZE_PRESETS.map((p) => Math.min(p.widthMm, p.heightMm))
  );

  const currentLongest = Math.max(widthMm, heightMm);
  const currentShortest = Math.min(widthMm, heightMm);

  const drawableW = preview.canvasW - preview.paddingPx * 2;
  const drawableH = preview.canvasH - preview.paddingPx * 2;

  const scaleByLongest = drawableW / Math.max(maxPresetLongest, currentLongest);
  const scaleByShortest = drawableH / Math.max(maxPresetShortest, currentShortest);

  return Math.min(scaleByLongest, scaleByShortest);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Donkere of lichtere matkleur afhankelijk van gekozen use.
 */
function adjustColorForUse(hex: string, use: MatUse) {
  const safe = hex.replace("#", "");
  if (safe.length !== 6) return hex;

  const r = parseInt(safe.slice(0, 2), 16);
  const g = parseInt(safe.slice(2, 4), 16);
  const b = parseInt(safe.slice(4, 6), 16);

  const factor = use === "buiten" ? 0.88 : 1;

  const nr = clamp(Math.round(r * factor), 0, 255);
  const ng = clamp(Math.round(g * factor), 0, 255);
  const nb = clamp(Math.round(b * factor), 0, 255);

  return `rgb(${nr}, ${ng}, ${nb})`;
}

/**
 * Detecteert de niet-transparante bounding box van een logo.
 */
function findOpaqueBounds(
  imageData: ImageData,
  alphaThreshold = 8
): { left: number; top: number; right: number; bottom: number } | null {
  const { data, width, height } = imageData;

  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a > alphaThreshold) {
        if (x < left) left = x;
        if (y < top) top = y;
        if (x > right) right = x;
        if (y > bottom) bottom = y;
      }
    }
  }

  if (right === -1 || bottom === -1) return null;
  return { left, top, right, bottom };
}

/**
 * Verwijdert halo / waas aan transparante randen.
 *
 * 1. Pixels met zeer lage alpha => volledig transparant
 * 2. Pixels met gedeeltelijke alpha => RGB "un-premultiply" om witte fringe te verminderen
 * 3. Optioneel agressievere threshold aan buitenrand
 */
function cleanTransparentHalo(
  sourceCanvas: HTMLCanvasElement,
  options?: {
    alphaCutoff?: number;
    hardCutoff?: number;
  }
) {
  const alphaCutoff = options?.alphaCutoff ?? 18;
  const hardCutoff = options?.hardCutoff ?? 6;

  const ctx = sourceCanvas.getContext("2d");
  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];

    // Volledig weggooien van bijna-transparante pixels
    if (a <= hardCutoff) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
      continue;
    }

    // Zachte randpixels proper maken
    if (a < alphaCutoff) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
      continue;
    }

    // Un-premultiply om witte matte/fringe tegen te gaan
    if (a > 0 && a < 255) {
      const alpha = a / 255;
      data[i] = clamp(Math.round(data[i] / alpha), 0, 255);
      data[i + 1] = clamp(Math.round(data[i + 1] / alpha), 0, 255);
      data[i + 2] = clamp(Math.round(data[i + 2] / alpha), 0, 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Crop transparante rand weg + cleanup halo.
 */
async function prepareTransparentLogo(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);

  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = img.naturalWidth || img.width;
  baseCanvas.height = img.naturalHeight || img.height;

  const baseCtx = baseCanvas.getContext("2d");
  if (!baseCtx) return dataUrl;

  baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
  baseCtx.imageSmoothingEnabled = true;
  baseCtx.imageSmoothingQuality = "high";
  baseCtx.drawImage(img, 0, 0);

  // Cleanup tegen waas
  cleanTransparentHalo(baseCanvas, {
    alphaCutoff: 18,
    hardCutoff: 6,
  });

  const bounds = findOpaqueBounds(
    baseCtx.getImageData(0, 0, baseCanvas.width, baseCanvas.height),
    10
  );

  if (!bounds) {
    return dataUrl;
  }

  const pad = 2;
  const sx = Math.max(0, bounds.left - pad);
  const sy = Math.max(0, bounds.top - pad);
  const sw = Math.min(baseCanvas.width - sx, bounds.right - bounds.left + 1 + pad * 2);
  const sh = Math.min(baseCanvas.height - sy, bounds.bottom - bounds.top + 1 + pad * 2);

  const cropped = document.createElement("canvas");
  cropped.width = sw;
  cropped.height = sh;

  const croppedCtx = cropped.getContext("2d");
  if (!croppedCtx) return dataUrl;

  croppedCtx.clearRect(0, 0, sw, sh);
  croppedCtx.imageSmoothingEnabled = true;
  croppedCtx.imageSmoothingQuality = "high";
  croppedCtx.drawImage(baseCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  // Tweede pass cleanup na crop
  cleanTransparentHalo(cropped, {
    alphaCutoff: 20,
    hardCutoff: 8,
  });

  return cropped.toDataURL("image/png");
}

function createMatTexture(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  // basis vezelstructuur
  const imageData = ctx.createImageData(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)));
  const data = imageData.data;

  for (let yy = 0; yy < imageData.height; yy++) {
    for (let xx = 0; xx < imageData.width; xx++) {
      const i = (yy * imageData.width + xx) * 4;
      const noise = 18 + Math.floor(Math.random() * 28);
      data[i] = noise;
      data[i + 1] = noise;
      data[i + 2] = noise;
      data[i + 3] = 24;
    }
  }

  const temp = document.createElement("canvas");
  temp.width = imageData.width;
  temp.height = imageData.height;
  const tctx = temp.getContext("2d");
  if (!tctx) return;

  tctx.putImageData(imageData, 0, 0);
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.drawImage(temp, x, y, w, h);
  ctx.restore();
}

function getUnitPrice(config: MatConfig) {
  const areaM2 = (config.widthMm / 1000) * (config.heightMm / 1000);

  let basePerM2 = config.use === "buiten" ? 42 : 35;

  if (config.placement === "verzonken") basePerM2 += 3;
  if (config.rubberRand) basePerM2 *= 1.15;

  const subtotal = areaM2 * basePerM2;
  return Math.max(18, Number(subtotal.toFixed(2)));
}

export default function MatSimulator() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = useState<"mat" | "colors" | "logo">("logo");
  const [config, setConfig] = useState<MatConfig>(DEFAULT_CONFIG);
  const [logo, setLogo] = useState<LogoState>(DEFAULT_LOGO);
  const [dragging, setDragging] = useState(false);
  const [rendering, setRendering] = useState(false);

  const mmToPx = useMemo(() => {
    return computeStableMmToPxScale(config.widthMm, config.heightMm, PREVIEW);
  }, [config.widthMm, config.heightMm]);

  const matPixelSize = useMemo(() => {
    const w = config.widthMm * mmToPx;
    const h = config.heightMm * mmToPx;
    return { w, h };
  }, [config.widthMm, config.heightMm, mmToPx]);

  const matRect = useMemo(() => {
    const x = (PREVIEW.canvasW - matPixelSize.w) / 2;
    const y = (PREVIEW.canvasH - matPixelSize.h) / 2;
    return {
      x,
      y,
      w: matPixelSize.w,
      h: matPixelSize.h,
    };
  }, [matPixelSize]);

  const price = useMemo(() => {
    const unit = getUnitPrice(config);
    const vat = Number((unit * 0.21).toFixed(2));
    const total = Number((unit + vat).toFixed(2));
    return { unit, vat, total };
  }, [config]);

  const selectedSizeLabel = useMemo(() => {
    return getPresetLabelCm(config.widthMm, config.heightMm);
  }, [config.widthMm, config.heightMm]);

  const drawPreview = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setRendering(true);

    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // achtergrond UI canvas
      ctx.fillStyle = "#f4f4f3";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // schaduw mat
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.18)";
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = "#00000010";
      roundRect(ctx, matRect.x, matRect.y, matRect.w, matRect.h, 12);
      ctx.fill();
      ctx.restore();

      // mat body
      const matColor = adjustColorForUse(config.matColor, config.use);

      ctx.save();
      roundRect(ctx, matRect.x, matRect.y, matRect.w, matRect.h, 10);
      ctx.clip();

      const matGradient = ctx.createLinearGradient(
        matRect.x,
        matRect.y,
        matRect.x + matRect.w,
        matRect.y + matRect.h
      );
      matGradient.addColorStop(0, shadeColor(matColor, -12));
      matGradient.addColorStop(0.5, matColor);
      matGradient.addColorStop(1, shadeColor(matColor, -18));

      ctx.fillStyle = matGradient;
      ctx.fillRect(matRect.x, matRect.y, matRect.w, matRect.h);

      createMatTexture(ctx, matRect.x, matRect.y, matRect.w, matRect.h);

      ctx.restore();

      // rubber rand
      if (config.rubberRand) {
        ctx.save();
        ctx.lineWidth = Math.max(8, Math.min(matRect.w, matRect.h) * 0.03);
        ctx.strokeStyle = "rgba(10, 10, 10, 0.72)";
        roundRect(ctx, matRect.x + 4, matRect.y + 4, matRect.w - 8, matRect.h - 8, 10);
        ctx.stroke();
        ctx.restore();
      }

      // subtiele binnenvlek / pile verschil op mat
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.035)";
      const innerW = matRect.w * 0.42;
      const innerH = matRect.h * 0.34;
      const innerX = matRect.x + (matRect.w - innerW) / 2;
      const innerY = matRect.y + (matRect.h - innerH) / 2;
      ctx.fillRect(innerX, innerY, innerW, innerH);
      ctx.restore();

      // logo tekenen
      const drawSrc = logo.preparedDataUrl || logo.dataUrl;
      if (drawSrc) {
        const img = await loadImage(drawSrc);

        const baseMaxW = matRect.w * 0.42;
        const baseMaxH = matRect.h * 0.42;

        const imgRatio = img.width / img.height;
        let targetW = baseMaxW * logo.scale;
        let targetH = targetW / imgRatio;

        if (targetH > baseMaxH * logo.scale) {
          targetH = baseMaxH * logo.scale;
          targetW = targetH * imgRatio;
        }

        ctx.save();

        // Clip tot binnen de mat zodat niets erbuiten tekent
        roundRect(ctx, matRect.x, matRect.y, matRect.w, matRect.h, 10);
        ctx.clip();

        ctx.translate(logo.x, logo.y);
        ctx.rotate((logo.rotationDeg * Math.PI) / 180);
        ctx.globalAlpha = clamp(logo.opacity, 0, 1);

        // GEEN shadow, GEEN filter, GEEN backplate => geen kunstmatige waas
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        ctx.drawImage(
          img,
          -targetW / 2,
          -targetH / 2,
          targetW,
          targetH
        );

        ctx.restore();
      }
    } finally {
      setRendering(false);
    }
  }, [config, logo, matRect]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  const handleLogoUpload = async (file: File) => {
    const reader = new FileReader();

    reader.onload = async (event) => {
      const result = event.target?.result;
      if (typeof result !== "string") return;

      try {
        const prepared = await prepareTransparentLogo(result);

        setLogo((prev) => ({
          ...prev,
          dataUrl: result,
          preparedDataUrl: prepared,
          x: PREVIEW.canvasW / 2,
          y: PREVIEW.canvasH / 2,
          scale: 1,
          rotationDeg: 0,
          opacity: 1,
        }));
      } catch {
        setLogo((prev) => ({
          ...prev,
          dataUrl: result,
          preparedDataUrl: result,
          x: PREVIEW.canvasW / 2,
          y: PREVIEW.canvasH / 2,
          scale: 1,
          rotationDeg: 0,
          opacity: 1,
        }));
      }
    };

    reader.readAsDataURL(file);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!logo.dataUrl && !logo.preparedDataUrl) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = PREVIEW.canvasW / rect.width;
    const scaleY = PREVIEW.canvasH / rect.height;

    let x = (e.clientX - rect.left) * scaleX;
    let y = (e.clientY - rect.top) * scaleY;

    const centerX = PREVIEW.canvasW / 2;
    const centerY = PREVIEW.canvasH / 2;

    if (Math.abs(x - centerX) <= 10) x = centerX;
    if (Math.abs(y - centerY) <= 10) y = centerY;

    x = clamp(x, matRect.x + 30, matRect.x + matRect.w - 30);
    y = clamp(y, matRect.y + 30, matRect.y + matRect.h - 30);

    setLogo((prev) => ({ ...prev, x, y }));
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    } catch {
      // noop
    }
    setDragging(false);
  };

  const handleExportPng = async () => {
    await drawPreview();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "mat-preview.png";
    a.click();
  };

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG);
    setLogo(DEFAULT_LOGO);
  };

  const currentPresetId = useMemo(() => {
    const found = SIZE_PRESETS.find(
      (p) => p.widthMm === config.widthMm && p.heightMm === config.heightMm
    );
    return found?.id ?? "custom";
  }, [config.widthMm, config.heightMm]);

  return (
    <div className="min-h-screen bg-[#f4f4f3] text-[#1e1e1e]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-black/10 bg-white px-8 py-4">
        <div>
          <h1 className="text-3xl font-serif">Logo Mat Configurator</h1>
          <p className="text-sm text-black/60">Design your custom entrance mat</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm hover:bg-black/5"
          >
            Reset
          </button>
          <button className="rounded-xl bg-black px-5 py-2 text-sm font-medium text-white hover:bg-black/90">
            Add to Cart
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="grid grid-cols-12 gap-6 p-6">
        {/* Left panel */}
        <div className="col-span-3 rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <h2 className="mb-6 text-[32px] font-serif leading-none">Configure Your Mat</h2>

          <div className="mb-5 grid grid-cols-3 gap-2 rounded-2xl bg-[#f7f7f6] p-1">
            <button
              onClick={() => setActiveTab("mat")}
              className={`rounded-xl px-3 py-2 text-sm ${
                activeTab === "mat" ? "bg-white shadow-sm" : "text-black/60"
              }`}
            >
              Mat
            </button>
            <button
              onClick={() => setActiveTab("colors")}
              className={`rounded-xl px-3 py-2 text-sm ${
                activeTab === "colors" ? "bg-white shadow-sm" : "text-black/60"
              }`}
            >
              Colors
            </button>
            <button
              onClick={() => setActiveTab("logo")}
              className={`rounded-xl px-3 py-2 text-sm ${
                activeTab === "logo" ? "bg-white shadow-sm" : "text-black/60"
              }`}
            >
              Logo
            </button>
          </div>

          {activeTab === "mat" && (
            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium">Use</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setConfig((p) => ({ ...p, use: "binnen" }))}
                    className={`rounded-xl border px-4 py-2 text-sm ${
                      config.use === "binnen"
                        ? "border-black bg-black text-white"
                        : "border-black/10 bg-white"
                    }`}
                  >
                    Indoor
                  </button>
                  <button
                    onClick={() => setConfig((p) => ({ ...p, use: "buiten" }))}
                    className={`rounded-xl border px-4 py-2 text-sm ${
                      config.use === "buiten"
                        ? "border-black bg-black text-white"
                        : "border-black/10 bg-white"
                    }`}
                  >
                    Outdoor
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Placement</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setConfig((p) => ({ ...p, placement: "vloer" }))}
                    className={`rounded-xl border px-4 py-2 text-sm ${
                      config.placement === "vloer"
                        ? "border-black bg-black text-white"
                        : "border-black/10 bg-white"
                    }`}
                  >
                    Surface
                  </button>
                  <button
                    onClick={() => setConfig((p) => ({ ...p, placement: "verzonken" }))}
                    className={`rounded-xl border px-4 py-2 text-sm ${
                      config.placement === "verzonken"
                        ? "border-black bg-black text-white"
                        : "border-black/10 bg-white"
                    }`}
                  >
                    Recessed
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Orientation</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      const smallest = Math.min(config.widthMm, config.heightMm);
                      const largest = Math.max(config.widthMm, config.heightMm);
                      setConfig((p) => ({
                        ...p,
                        orientation: "liggend",
                        widthMm: largest,
                        heightMm: smallest,
                      }));
                    }}
                    className={`rounded-xl border px-4 py-2 text-sm ${
                      config.orientation === "liggend"
                        ? "border-black bg-black text-white"
                        : "border-black/10 bg-white"
                    }`}
                  >
                    Landscape
                  </button>
                  <button
                    onClick={() => {
                      const smallest = Math.min(config.widthMm, config.heightMm);
                      const largest = Math.max(config.widthMm, config.heightMm);
                      setConfig((p) => ({
                        ...p,
                        orientation: "staand",
                        widthMm: smallest,
                        heightMm: largest,
                      }));
                    }}
                    className={`rounded-xl border px-4 py-2 text-sm ${
                      config.orientation === "staand"
                        ? "border-black bg-black text-white"
                        : "border-black/10 bg-white"
                    }`}
                  >
                    Portrait
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Sizes</label>
                <div className="flex flex-wrap gap-2">
                  {SIZE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => {
                        const smallest = Math.min(preset.widthMm, preset.heightMm);
                        const largest = Math.max(preset.widthMm, preset.heightMm);

                        setConfig((p) => ({
                          ...p,
                          widthMm: p.orientation === "liggend" ? largest : smallest,
                          heightMm: p.orientation === "liggend" ? smallest : largest,
                        }));
                      }}
                      className={`rounded-xl border px-3 py-2 text-sm ${
                        currentPresetId === preset.id
                          ? "border-black bg-black text-white"
                          : "border-black/10 bg-white"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-sm font-medium">Width (cm)</label>
                  <input
                    type="number"
                    value={mmToCm(config.widthMm)}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        widthMm: cmToMm(Number(e.target.value || 0)),
                      }))
                    }
                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Height (cm)</label>
                  <input
                    type="number"
                    value={mmToCm(config.heightMm)}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        heightMm: cmToMm(Number(e.target.value || 0)),
                      }))
                    }
                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none"
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 pt-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.rubberRand}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, rubberRand: e.target.checked }))
                  }
                />
                Rubber border
              </label>
            </div>
          )}

          {activeTab === "colors" && (
            <div className="space-y-4">
              <label className="block text-sm font-medium">Mat color</label>
              <div className="flex gap-3">
                {["#2d2d2d", "#1f2937", "#3f3f46", "#0f172a", "#4b5563", "#374151"].map(
                  (color) => (
                    <button
                      key={color}
                      onClick={() => setConfig((p) => ({ ...p, matColor: color }))}
                      className={`h-10 w-10 rounded-full border-2 ${
                        config.matColor === color ? "border-black" : "border-transparent"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  )
                )}
              </div>
            </div>
          )}

          {activeTab === "logo" && (
            <div className="space-y-5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLogoUpload(file);
                }}
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-black/15 bg-[#fafaf9] px-5 py-10 text-center hover:bg-[#f7f7f6]"
              >
                <div className="mb-2 text-lg">⤴</div>
                <div className="font-medium">{logo.dataUrl ? "Replace logo" : "Upload logo"}</div>
                <div className="text-sm text-black/55">
                  PNG, JPG or WebP (transparent PNG recommended)
                </div>
              </button>

              {logo.dataUrl && (
                <div className="rounded-2xl border border-black/10 bg-[#f7f7f6] px-4 py-3 text-sm">
                  Logo loaded successfully
                </div>
              )}

              <div className="rounded-2xl border border-[#f4c46a] bg-[#fff8e8] px-4 py-3 text-sm text-[#9a5f00]">
                Upload a PNG with transparent background for best results. We’ll clean soft edge pixels automatically to avoid the grey/white haze.
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Scale</label>
                <input
                  type="range"
                  min={0.4}
                  max={2.5}
                  step={0.01}
                  value={logo.scale}
                  onChange={(e) =>
                    setLogo((p) => ({ ...p, scale: Number(e.target.value) }))
                  }
                  className="w-full"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Rotation</label>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={logo.rotationDeg}
                  onChange={(e) =>
                    setLogo((p) => ({ ...p, rotationDeg: Number(e.target.value) }))
                  }
                  className="w-full"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Opacity</label>
                <input
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.01}
                  value={logo.opacity}
                  onChange={(e) =>
                    setLogo((p) => ({ ...p, opacity: Number(e.target.value) }))
                  }
                  className="w-full"
                />
              </div>

              {logo.dataUrl && (
                <button
                  onClick={() =>
                    setLogo((prev) => ({
                      ...prev,
                      dataUrl: undefined,
                      preparedDataUrl: undefined,
                    }))
                  }
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 hover:bg-red-100"
                >
                  Remove logo
                </button>
              )}
            </div>
          )}
        </div>

        {/* Middle panel */}
        <div className="col-span-6 rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-[32px] font-serif leading-none">Live Preview</h2>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExportPng}
                className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm hover:bg-black/5"
              >
                Export PNG
              </button>
              <button
                onClick={drawPreview}
                className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-black/90"
              >
                {rendering ? "Rendering..." : "Render Preview"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-[#f3f2f0] p-4">
            <canvas
              ref={canvasRef}
              width={PREVIEW.canvasW}
              height={PREVIEW.canvasH}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerLeave={handleCanvasPointerUp}
              className="h-auto w-full cursor-move rounded-2xl"
            />
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-black/60">
            <div>Canvas: {PREVIEW.canvasW} × {PREVIEW.canvasH} px</div>
            <div>
              Mat size: {Math.min(mmToCm(config.widthMm), mmToCm(config.heightMm))} ×{" "}
              {Math.max(mmToCm(config.widthMm), mmToCm(config.heightMm))} cm
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="col-span-3 rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <h2 className="mb-6 text-[32px] font-serif leading-none">Price Calculator</h2>

          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-black/60">Mat type</span>
              <span>{config.use === "binnen" ? "Indoor" : "Outdoor"}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-black/60">Size</span>
              <span>{selectedSizeLabel}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-black/60">Rubber border</span>
              <span className={config.rubberRand ? "text-green-600" : ""}>
                {config.rubberRand ? "+15%" : "No"}
              </span>
            </div>

            <div className="my-4 border-t border-black/10" />

            <div className="flex items-center justify-between">
              <span className="text-black/60">Unit price</span>
              <span>€{price.unit.toFixed(2)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-black/60">Quantity</span>
              <span>×1</span>
            </div>

            <div className="my-4 border-t border-black/10" />

            <div className="flex items-center justify-between">
              <span className="text-black/60">Subtotal</span>
              <span>€{price.unit.toFixed(2)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-black/60">VAT (21%)</span>
              <span>€{price.vat.toFixed(2)}</span>
            </div>

            <div className="my-4 border-t border-black/10" />

            <div className="flex items-center justify-between text-[18px] font-semibold">
              <span>Total</span>
              <span>€{price.total.toFixed(2)}</span>
            </div>

            <div className="pt-4 text-xs text-black/50">
              <div className="mb-1 font-medium text-black/60">Volume discounts:</div>
              <ul className="list-disc pl-4">
                <li>5–9 units: 5% off</li>
                <li>10–24 units: 10% off</li>
                <li>25–49 units: 15% off</li>
                <li>50+ units: 20% off</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Helpers drawing ---------------------------- */

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function shadeColor(color: string, amount: number) {
  const match = color.match(/\d+/g);
  if (!match || match.length < 3) return color;

  const [r, g, b] = match.map(Number);

  return `rgb(${clamp(r + amount, 0, 255)}, ${clamp(g + amount, 0, 255)}, ${clamp(
    b + amount,
    0,
    255
  )})`;
}
