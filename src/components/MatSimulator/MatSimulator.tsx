"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { LogoState, MatConfig, PreviewSettings } from "./types";
import { SIZE_PRESETS } from "./presets";
import { adjustColorForUse, clamp, computeMmToPxScale, loadImage } from "./utils";

const PREVIEW: PreviewSettings = {
  canvasW: 900,
  canvasH: 560,
  paddingPx: 36
};

const DEFAULT_CONFIG: MatConfig = {
  use: "binnen",
  placement: "vloer",
  orientation: "liggend",
  rubberRand: true,

  presetId: "60x85",
  widthMm: 600,
  heightMm: 850,

  matColor: "#1f2937"
};

const DEFAULT_LOGO: LogoState = {
  dataUrl: undefined,
  x: PREVIEW.canvasW / 2,
  y: PREVIEW.canvasH / 2,
  scale: 1,
  rotationDeg: 0,
  opacity: 1
};

export default function MatSimulator() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [config, setConfig] = useState<MatConfig>(DEFAULT_CONFIG);
  const [logo, setLogo] = useState<LogoState>(DEFAULT_LOGO);

  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  // Status tekst onder de knoppen (optioneel)
  const [status, setStatus] = useState<string>("");

  // ✅ NIEUW: URL van de gerenderde preview (PNG)
  const [renderPreviewUrl, setRenderPreviewUrl] = useState<string | null>(null);

  const selectedPreset = useMemo(() => {
    return SIZE_PRESETS.find((p) => p.id === config.presetId);
  }, [config.presetId]);

  useEffect(() => {
    if (config.presetId !== "custom" && selectedPreset) {
      setConfig((c) => ({
        ...c,
        widthMm: selectedPreset.widthMm,
        heightMm: selectedPreset.heightMm
      }));
    }
  }, [config.presetId, selectedPreset]);

  useEffect(() => {
    setConfig((c) => {
      const w = c.widthMm;
      const h = c.heightMm;
      if (c.orientation === "staand" && w > h) return { ...c, widthMm: h, heightMm: w };
      if (c.orientation === "liggend" && h > w) return { ...c, widthMm: h, heightMm: w };
      return c;
    });
  }, [config.orientation]);

  useEffect(() => {
    void renderPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, logo]);

  async function renderPreview() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, PREVIEW.canvasW, PREVIEW.canvasH);

    // achtergrond
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PREVIEW.canvasW, PREVIEW.canvasH);

    const mmToPx = computeMmToPxScale(config, PREVIEW);
    const matWpx = config.widthMm * mmToPx;
    const matHpx = config.heightMm * mmToPx;

    const matX = (PREVIEW.canvasW - matWpx) / 2;
    const matY = (PREVIEW.canvasH - matHpx) / 2;
const r = config.placement === "vloer" || config.placement === "vloerkader" ? 0 : 18;

    drawScene(ctx, matX, matY, matWpx, matHpx);

    const baseColor = adjustColorForUse(config.matColor, config.use);
    drawMat(ctx, matX, matY, matWpx, matHpx, baseColor, r);

    if (config.rubberRand) {
      drawRubberBorder(ctx, matX, matY, matWpx, matHpx, r);
    }

    if (logo.dataUrl) {
      try {
        const img = await loadImage(logo.dataUrl);
        const target = Math.min(matWpx, matHpx) * 0.55;
        const fitScale = Math.min(target / img.width, target / img.height);
        const finalScale = fitScale * logo.scale;
        const drawW = img.width * finalScale;
        const drawH = img.height * finalScale;

        ctx.save();
        ctx.globalAlpha = clamp(logo.opacity, 0, 1);
        ctx.translate(logo.x, logo.y);
        ctx.rotate((logo.rotationDeg * Math.PI) / 180);
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();

        drawLogoGuides(ctx, logo.x, logo.y);
      } catch {
        // ignore
      }
    }

    drawOverlay(ctx, matX, matY, matWpx, matHpx, r);
  }

  function drawScene(ctx: CanvasRenderingContext2D, matX: number, matY: number, matW: number, matH: number) {
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(0, 0, PREVIEW.canvasW, PREVIEW.canvasH);

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.filter = "blur(10px)";
    ctx.fillRect(matX + 8, matY + 10, matW, matH);
    ctx.restore();

    if (config.placement === "vloerkader") {
      const framePad = 16;
      ctx.fillStyle = "#d4d4d4";
      ctx.fillRect(matX - framePad, matY - framePad, matW + framePad * 2, matH + framePad * 2);
      ctx.strokeStyle = "#a3a3a3";
      ctx.lineWidth = 3;
      ctx.strokeRect(matX - framePad, matY - framePad, matW + framePad * 2, matH + framePad * 2);
    }
  }

  function drawMat(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, r: number) {
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, color);
    grad.addColorStop(1, shade(color, -10));

    ctx.fillStyle = grad;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();

    
  }

  function drawRubberBorder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { 
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 10;
    roundRect(ctx, x + 4, y + 4, w - 8, h - 8, r);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 3;
    roundRect(ctx, x + 10, y + 10, w - 20, h - 20, r);
    ctx.stroke();
    ctx.restore();
  }

  function drawOverlay(
  ctx: CanvasRenderingContext2D,
  matX: number,
  matY: number,
  matW: number,
  matH: number,
  r : number
) {
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 1;
  roundRect(ctx, matX, matY, matW, matH, r);
  ctx.stroke();
  ctx.restore();
}

  function drawLogoGuides(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx, cy + 10);
    ctx.stroke();

    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = "#000000";
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function shade(hex: string, amount: number) {
    const c = hex.replace("#", "");
    const r = clamp(parseInt(c.slice(0, 2), 16) + amount, 0, 255);
    const g = clamp(parseInt(c.slice(2, 4), 16) + amount, 0, 255);
    const b = clamp(parseInt(c.slice(4, 6), 16) + amount, 0, 255);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
      .toString(16)
      .padStart(2, "0")}`;
  }

  async function onLogoFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setLogo((l) => ({
        ...l,
        dataUrl,
        x: PREVIEW.canvasW / 2,
        y: PREVIEW.canvasH / 2,
        scale: 1,
        rotationDeg: 0,
        opacity: 1
      }));
    };
    reader.readAsDataURL(file);
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!logo.dataUrl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * PREVIEW.canvasW;
    const y = ((e.clientY - rect.top) / rect.height) * PREVIEW.canvasH;

    setDragging(true);
    dragOffset.current = { dx: logo.x - x, dy: logo.y - y };
    (e.currentTarget as any).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * PREVIEW.canvasW;
    const y = ((e.clientY - rect.top) / rect.height) * PREVIEW.canvasH;

    setLogo((l) => ({
      ...l,
      x: x + dragOffset.current.dx,
      y: y + dragOffset.current.dy
    }));
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    setDragging(false);
    (e.currentTarget as any).releasePointerCapture?.(e.pointerId);
  }

  function exportPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `carpetz-preview-${config.widthMm}x${config.heightMm}mm.png`;
    a.click();
  }

  // ✅ NIEUW: "AI preview (beta)" toont gewoon de huidige canvas render als foto
  function showRenderPreview() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const url = canvas.toDataURL("image/png");
    setRenderPreviewUrl(url);

    // optioneel klein statusbericht
    setStatus("Render preview gegenereerd.");
    setTimeout(() => setStatus(""), 2500);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <section className="lg:col-span-5 bg-white rounded-2xl border border-neutral-200 p-5">
        <h2 className="text-xl font-semibold">Instellingen</h2>
        <p className="text-sm text-neutral-600 mt-1">Alles in millimeters (mm).</p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="text-sm font-medium">Type mat</label>
            <div className="mt-2 flex gap-2">
              <ToggleButton active={config.use === "binnen"} onClick={() => setConfig((c) => ({ ...c, use: "binnen" }))}>
                Binnen
              </ToggleButton>
              <ToggleButton active={config.use === "buiten"} onClick={() => setConfig((c) => ({ ...c, use: "buiten" }))}>
                Buiten
              </ToggleButton>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Plaatsing</label>
            <div className="mt-2 flex gap-2">
              <ToggleButton active={config.placement === "vloer"} onClick={() => setConfig((c) => ({ ...c, placement: "vloer" }))}>
                Op de vloer
              </ToggleButton>
              <ToggleButton
                active={config.placement === "vloerkader"}
                onClick={() => setConfig((c) => ({ ...c, placement: "vloerkader" }))}
              >
                In vloerkader
              </ToggleButton>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Oriëntatie</label>
            <div className="mt-2 flex gap-2">
              <ToggleButton
                active={config.orientation === "liggend"}
                onClick={() => setConfig((c) => ({ ...c, orientation: "liggend" }))}
              >
                Liggend
              </ToggleButton>
              <ToggleButton
                active={config.orientation === "staand"}
                onClick={() => setConfig((c) => ({ ...c, orientation: "staand" }))}
              >
                Staand
              </ToggleButton>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <label className="text-sm font-medium">Rubberen rand</label>
              <p className="text-xs text-neutral-500">Dikke beschermrand rond de mat</p>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={config.rubberRand}
              onChange={(e) => setConfig((c) => ({ ...c, rubberRand: e.target.checked }))}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Maat</label>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                className="w-full border border-neutral-300 rounded-xl px-3 py-2"
                value={config.presetId}
                onChange={(e) => setConfig((c) => ({ ...c, presetId: e.target.value as any }))}
              >
                {SIZE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                <option value="custom">Maat op keuze</option>
              </select>

              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    type="number"
                    min={200}
                    max={4000}
                    step={10}
                    className="w-full border border-neutral-300 rounded-xl px-3 py-2"
                    value={config.widthMm}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, presetId: "custom", widthMm: Number(e.target.value) }))
                    }
                    placeholder="Breedte (mm)"
                  />
                  <p className="text-xs text-neutral-500 mt-1">Breedte (mm)</p>
                </div>
                <div className="flex-1">
                  <input
                    type="number"
                    min={200}
                    max={4000}
                    step={10}
                    className="w-full border border-neutral-300 rounded-xl px-3 py-2"
                    value={config.heightMm}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, presetId: "custom", heightMm: Number(e.target.value) }))
                    }
                    placeholder="Hoogte (mm)"
                  />
                  <p className="text-xs text-neutral-500 mt-1">Hoogte (mm)</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <label className="text-sm font-medium">Kleur mat</label>
              <p className="text-xs text-neutral-500">Kies de basiskleur</p>
            </div>
            <input
              type="color"
              value={config.matColor}
              onChange={(e) => setConfig((c) => ({ ...c, matColor: e.target.value }))}
              className="h-10 w-12 p-1 rounded-xl border border-neutral-300 bg-white"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Logo upload</label>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => void onLogoFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm"
              />
              <button
                type="button"
                className="px-3 py-2 rounded-xl border border-neutral-300 hover:bg-neutral-50"
                onClick={() => setLogo(DEFAULT_LOGO)}
              >
                Reset
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Range
                label="Logo grootte"
                value={logo.scale}
                min={0.2}
                max={3}
                step={0.05}
                onChange={(v) => setLogo((l) => ({ ...l, scale: v }))}
                suffix="×"
              />
              <Range
                label="Logo rotatie"
                value={logo.rotationDeg}
                min={-180}
                max={180}
                step={1}
                onChange={(v) => setLogo((l) => ({ ...l, rotationDeg: v }))}
                suffix="°"
              />
              <Range
                label="Logo opacity"
                value={logo.opacity}
                min={0.2}
                max={1}
                step={0.05}
                onChange={(v) => setLogo((l) => ({ ...l, opacity: v }))}
              />
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  className="w-full px-3 py-2 rounded-xl bg-neutral-900 text-white hover:bg-neutral-800"
                  onClick={exportPng}
                >
                  Export PNG
                </button>

                <button
                  type="button"
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 hover:bg-neutral-50"
                  onClick={showRenderPreview}
                >
                  AI preview (beta)
                </button>
              </div>
            </div>

            {status ? (
              <p className="mt-3 text-sm text-neutral-700 bg-neutral-100 border border-neutral-200 rounded-xl p-3">
                {status}
              </p>
            ) : null}
          </div>

          <details>
            <summary className="cursor-pointer text-sm text-neutral-700">Toon configuratie (JSON)</summary>
            <pre className="mt-2 text-xs bg-neutral-50 border border-neutral-200 rounded-xl p-3 overflow-auto">
              {JSON.stringify({ config, logo: { ...logo, dataUrl: logo.dataUrl ? "[dataUrl]" : undefined } }, null, 2)}
            </pre>
          </details>
        </div>
      </section>

      <section className="lg:col-span-7 bg-white rounded-2xl border border-neutral-200 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Preview</h2>
            <p className="text-sm text-neutral-600 mt-1">
              Sleep het logo op de mat. Gebruik sliders om te schalen/roteren.
            </p>
          </div>
          <span className="text-xs text-neutral-500">
            Canvas: {PREVIEW.canvasW}×{PREVIEW.canvasH}px
          </span>
        </div>

        <div className="mt-4 rounded-2xl border border-neutral-200 overflow-hidden bg-neutral-50">
          <canvas
            ref={canvasRef}
            width={PREVIEW.canvasW}
            height={PREVIEW.canvasH}
            className="w-full h-auto touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>

        <p className="mt-3 text-xs text-neutral-500">Tip: upload een PNG met transparante achtergrond.</p>
      </section>

      {/* ✅ NIEUW: Modal met gerenderde PNG */}
      {renderPreviewUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onClick={() => setRenderPreviewUrl(null)}
        >
          <div
            className="w-full max-w-4xl rounded-2xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="font-semibold">Render preview</div>
              <button
                className="rounded-xl border border-neutral-300 px-3 py-2 hover:bg-neutral-50"
                onClick={() => setRenderPreviewUrl(null)}
              >
                Sluiten
              </button>
            </div>

            <img
              src={renderPreviewUrl}
              alt="Gerenderde logomat preview"
              className="w-full h-auto rounded-xl border border-neutral-200"
            />

            <div className="mt-3 flex gap-2">
              <a
                href={renderPreviewUrl}
                download={`carpetz-render-preview-${config.widthMm}x${config.heightMm}mm.png`}
                className="rounded-xl bg-neutral-900 text-white px-4 py-2 hover:bg-neutral-800"
              >
                Download PNG
              </a>
              <button
                className="rounded-xl border border-neutral-300 px-4 py-2 hover:bg-neutral-50"
                onClick={() => setRenderPreviewUrl(null)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-3 py-2 rounded-xl border text-sm transition",
        active
          ? "bg-neutral-900 text-white border-neutral-900"
          : "bg-white text-neutral-800 border-neutral-300 hover:bg-neutral-50"
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  const decimals = label.includes("rotatie") ? 0 : 2;
  return (
    <div className="border border-neutral-200 rounded-xl p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-neutral-600">
          {value.toFixed(decimals)}
          {suffix ?? ""}
        </span>
      </div>
      <input
        type="range"
        className="w-full mt-2"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
