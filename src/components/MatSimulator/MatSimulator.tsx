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

const SNAP_PX = 10;

export default function MatSimulator() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [config, setConfig] = useState<MatConfig>(DEFAULT_CONFIG);
  const [logo, setLogo] = useState<LogoState>(DEFAULT_LOGO);

  // selection: handles only when selected
  const [logoSelected, setLogoSelected] = useState(false);

  // drag state
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  // resize state
  const [resizeHandle, setResizeHandle] = useState<null | "nw" | "ne" | "sw" | "se">(null);
  const resizeStartRef = useRef<{ startScale: number; startDist: number } | null>(null);

  // bbox from last draw (axis-aligned; rotation ignored for hit tests)
  const logoBoxRef = useRef<{ cx: number; cy: number; w: number; h: number; rotationDeg: number } | null>(null);

  // delete button hitbox on canvas
  const deleteBtnRef = useRef<{ x: number; y: number; r: number } | null>(null);

  // cache loaded logo image
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  // mat rect for snapping
  const matRectRef = useRef<{ x: number; y: number; w: number; h: number; cx: number; cy: number } | null>(null);

  // snap guide flags
  const snapGuidesRef = useRef<{ showV: boolean; showH: boolean }>({ showV: false, showH: false });

  // force redraw when guides clear
  const [guideTick, setGuideTick] = useState(0);

  // status + modal preview
  const [status, setStatus] = useState<string>("");
  const [renderPreviewUrl, setRenderPreviewUrl] = useState<string | null>(null);

  const selectedPreset = useMemo(() => {
    return SIZE_PRESETS.find((p) => p.id === config.presetId);
  }, [config.presetId]);

  // preset -> size
  useEffect(() => {
    if (config.presetId !== "custom" && selectedPreset) {
      setConfig((c) => ({
        ...c,
        widthMm: selectedPreset.widthMm,
        heightMm: selectedPreset.heightMm
      }));
    }
  }, [config.presetId, selectedPreset]);

  // vloerkader => rubber rand off
  useEffect(() => {
    if (config.placement === "vloerkader" && config.rubberRand) {
      setConfig((c) => ({ ...c, rubberRand: false }));
    }
  }, [config.placement, config.rubberRand]);

  // orientation -> swap if needed
  useEffect(() => {
    setConfig((c) => {
      const w = c.widthMm;
      const h = c.heightMm;
      if (c.orientation === "staand" && w > h) return { ...c, widthMm: h, heightMm: w };
      if (c.orientation === "liggend" && h > w) return { ...c, widthMm: h, heightMm: w };
      return c;
    });
  }, [config.orientation]);

  // load logo image when dataUrl changes
  useEffect(() => {
    let cancelled = false;

    async function loadLogoImg() {
      if (!logo.dataUrl) {
        logoImgRef.current = null;
        return;
      }
      try {
        const img = await loadImage(logo.dataUrl);
        if (!cancelled) logoImgRef.current = img;
      } catch {
        if (!cancelled) logoImgRef.current = null;
      }
    }

    void loadLogoImg();
    return () => {
      cancelled = true;
    };
  }, [logo.dataUrl]);

  // keyboard delete/backspace when selected
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!logoSelected) return;
      if (!logo.dataUrl) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteLogo();
        return;
      }

      if (e.key === "Escape") {
        setLogoSelected(false);
        clearSnapGuides();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoSelected, logo.dataUrl]);

  // render canvas when state changes
  useEffect(() => {
    void renderPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, logo, logoSelected, guideTick]);

  function clearSnapGuides() {
    snapGuidesRef.current = { showV: false, showH: false };
    setGuideTick((t) => t + 1);
  }

  async function renderPreview() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, PREVIEW.canvasW, PREVIEW.canvasH);

    // white background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PREVIEW.canvasW, PREVIEW.canvasH);

    const mmToPx = computeMmToPxScale(config, PREVIEW);
    const matWpx = config.widthMm * mmToPx;
    const matHpx = config.heightMm * mmToPx;

    const matX = (PREVIEW.canvasW - matWpx) / 2;
    const matY = (PREVIEW.canvasH - matHpx) / 2;

    matRectRef.current = {
      x: matX,
      y: matY,
      w: matWpx,
      h: matHpx,
      cx: matX + matWpx / 2,
      cy: matY + matHpx / 2
    };

    const r = config.placement === "vloer" || config.placement === "vloerkader" ? 0 : 18;

    drawScene(ctx, matX, matY, matWpx, matHpx);

    const baseColor = adjustColorForUse(config.matColor, config.use);
    drawMat(ctx, matX, matY, matWpx, matHpx, baseColor, r);

    if (config.rubberRand && config.placement !== "vloerkader") {
      drawRubberBorder(ctx, matX, matY, matWpx, matHpx, r);
    }

    // snap guides
    if (logoSelected) drawSnapGuides(ctx);

    // logo
    const img = logoImgRef.current;
    if (logo.dataUrl && img) {
      const target = Math.min(matWpx, matHpx) * 0.55;
      const fitScale = Math.min(target / img.width, target / img.height);
      const finalScale = fitScale * logo.scale;

      const drawW = img.width * finalScale;
      const drawH = img.height * finalScale;

      logoBoxRef.current = {
        cx: logo.x,
        cy: logo.y,
        w: drawW,
        h: drawH,
        rotationDeg: logo.rotationDeg
      };

      ctx.save();
      ctx.globalAlpha = clamp(logo.opacity, 0, 1);
      ctx.translate(logo.x, logo.y);
      ctx.rotate((logo.rotationDeg * Math.PI) / 180);
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      if (logoSelected) {
        drawLogoGuides(ctx, logo.x, logo.y);
        drawResizeHandles(ctx);
        drawDeleteButton(ctx);
      } else {
        deleteBtnRef.current = null;
      }
    } else {
      logoBoxRef.current = null;
      deleteBtnRef.current = null;
    }

    // overlay border NOT for vloerkader
    if (config.placement !== "vloerkader") {
      drawOverlay(ctx, matX, matY, matWpx, matHpx, r);
    }
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

  function drawOverlay(ctx: CanvasRenderingContext2D, matX: number, matY: number, matW: number, matH: number, r: number) {
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

  function drawResizeHandles(ctx: CanvasRenderingContext2D) {
    const b = logoBoxRef.current;
    if (!b) return;

    const halfW = b.w / 2;
    const halfH = b.h / 2;

    const corners = [
      { id: "nw" as const, x: b.cx - halfW, y: b.cy - halfH },
      { id: "ne" as const, x: b.cx + halfW, y: b.cy - halfH },
      { id: "sw" as const, x: b.cx - halfW, y: b.cy + halfH },
      { id: "se" as const, x: b.cx + halfW, y: b.cy + halfH }
    ];

    ctx.save();
    for (const c of corners) {
      ctx.fillStyle = "#2563eb";
      ctx.beginPath();
      ctx.arc(c.x, c.y, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDeleteButton(ctx: CanvasRenderingContext2D) {
    const b = logoBoxRef.current;
    if (!b) {
      deleteBtnRef.current = null;
      return;
    }

    const halfW = b.w / 2;
    const halfH = b.h / 2;

    // outside top-right corner
    const x = b.cx + halfW + 18;
    const y = b.cy - halfH - 18;
    const r = 12;

    deleteBtnRef.current = { x, y, r };

    ctx.save();
    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 5);
    ctx.lineTo(x + 5, y + 5);
    ctx.moveTo(x + 5, y - 5);
    ctx.lineTo(x - 5, y + 5);
    ctx.stroke();
    ctx.restore();
  }

  function drawSnapGuides(ctx: CanvasRenderingContext2D) {
    const mat = matRectRef.current;
    if (!mat) return;

    const { showV, showH } = snapGuidesRef.current;
    if (!showV && !showH) return;

    ctx.save();
    ctx.strokeStyle = "rgba(59,130,246,0.85)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);

    if (showV) {
      ctx.beginPath();
      ctx.moveTo(mat.cx, mat.y);
      ctx.lineTo(mat.cx, mat.y + mat.h);
      ctx.stroke();
    }

    if (showH) {
      ctx.beginPath();
      ctx.moveTo(mat.x, mat.cy);
      ctx.lineTo(mat.x + mat.w, mat.cy);
      ctx.stroke();
    }

    ctx.restore();
  }

  function getHandleAtPoint(x: number, y: number): null | "nw" | "ne" | "sw" | "se" {
    const b = logoBoxRef.current;
    if (!b) return null;

    const halfW = b.w / 2;
    const halfH = b.h / 2;

    const corners = [
      { id: "nw" as const, x: b.cx - halfW, y: b.cy - halfH },
      { id: "ne" as const, x: b.cx + halfW, y: b.cy - halfH },
      { id: "sw" as const, x: b.cx - halfW, y: b.cy + halfH },
      { id: "se" as const, x: b.cx + halfW, y: b.cy + halfH }
    ];

    const R = 12;
    for (const c of corners) {
      const dx = x - c.x;
      const dy = y - c.y;
      if (dx * dx + dy * dy <= R * R) return c.id;
    }
    return null;
  }

  function isPointInDeleteButton(x: number, y: number) {
    const btn = deleteBtnRef.current;
    if (!btn) return false;
    const dx = x - btn.x;
    const dy = y - btn.y;
    return dx * dx + dy * dy <= btn.r * btn.r;
  }

  function isPointInLogoBox(x: number, y: number) {
    const b = logoBoxRef.current;
    if (!b) return false;

    const halfW = b.w / 2;
    const halfH = b.h / 2;

    return x >= b.cx - halfW && x <= b.cx + halfW && y >= b.cy - halfH && y <= b.cy + halfH;
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
    const rr = clamp(parseInt(c.slice(0, 2), 16) + amount, 0, 255);
    const gg = clamp(parseInt(c.slice(2, 4), 16) + amount, 0, 255);
    const bb = clamp(parseInt(c.slice(4, 6), 16) + amount, 0, 255);
    return `#${rr.toString(16).padStart(2, "0")}${gg.toString(16).padStart(2, "0")}${bb
      .toString(16)
      .padStart(2, "0")}`;
  }

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * PREVIEW.canvasW;
    const y = ((e.clientY - rect.top) / rect.height) * PREVIEW.canvasH;
    return { x, y };
  }

  async function onLogoFile(file: File | null) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);

      setLogo({
        ...DEFAULT_LOGO,
        dataUrl,
        x: PREVIEW.canvasW / 2,
        y: PREVIEW.canvasH / 2,
        scale: 1,
        rotationDeg: 0,
        opacity: 1
      });

      setLogoSelected(true);
      clearSnapGuides();
    };

    reader.readAsDataURL(file);
  }

  function deleteLogo() {
    setLogo(DEFAULT_LOGO);
    setLogoSelected(false);
    setDragging(false);
    setResizeHandle(null);
    resizeStartRef.current = null;
    logoImgRef.current = null;
    logoBoxRef.current = null;
    deleteBtnRef.current = null;
    clearSnapGuides();
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!logo.dataUrl) {
      setLogoSelected(false);
      clearSnapGuides();
      return;
    }

    const { x, y } = canvasPoint(e);

    // delete button first
    if (logoSelected && isPointInDeleteButton(x, y)) {
      deleteLogo();
      return;
    }

    // resize handle (only if selected)
    if (logoSelected) {
      const handle = getHandleAtPoint(x, y);
      if (handle) {
        setResizeHandle(handle);

        const b = logoBoxRef.current;
        if (b) {
          const dist = Math.hypot(x - b.cx, y - b.cy);
          resizeStartRef.current = {
            startScale: logo.scale,
            startDist: Math.max(dist, 1)
          };
        }

        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }

    // click inside logo => select + drag
    if (isPointInLogoBox(x, y)) {
      setLogoSelected(true);
      setDragging(true);
      dragOffset.current = { dx: logo.x - x, dy: logo.y - y };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // click background => deselect
    setLogoSelected(false);
    setDragging(false);
    setResizeHandle(null);
    resizeStartRef.current = null;
    clearSnapGuides();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const { x, y } = canvasPoint(e);

    // resize mode
    if (resizeHandle) {
      const b = logoBoxRef.current;
      const s = resizeStartRef.current;
      if (!b || !s) return;

      const dist = Math.hypot(x - b.cx, y - b.cy);
      const factor = dist / s.startDist;
      const nextScale = clamp(s.startScale * factor, 0.2, 3);

      setLogo((l) => ({ ...l, scale: nextScale }));
      return;
    }

    // drag mode
    if (!dragging) return;

    let nextX = x + dragOffset.current.dx;
    let nextY = y + dragOffset.current.dy;

    const mat = matRectRef.current;
    let showV = false;
    let showH = false;

    if (mat) {
      if (Math.abs(nextX - mat.cx) <= SNAP_PX) {
        nextX = mat.cx;
        showV = true;
      }
      if (Math.abs(nextY - mat.cy) <= SNAP_PX) {
        nextY = mat.cy;
        showH = true;
      }
    }

    snapGuidesRef.current = { showV, showH };

    setLogo((l) => ({
      ...l,
      x: nextX,
      y: nextY
    }));
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    setDragging(false);
    setResizeHandle(null);
    resizeStartRef.current = null;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    clearSnapGuides();
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

  function showRenderPreview() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const url = canvas.toDataURL("image/png");
    setRenderPreviewUrl(url);

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
                onClick={() => setConfig((c) => ({ ...c, placement: "vloerkader", rubberRand: false }))}
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

          {config.placement !== "vloerkader" ? (
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
          ) : null}

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
                    onChange={(e) => setConfig((c) => ({ ...c, presetId: "custom", widthMm: Number(e.target.value) }))}
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
                    onChange={(e) => setConfig((c) => ({ ...c, presetId: "custom", heightMm: Number(e.target.value) }))}
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
              {/* GEEN extra "verwijder logo" knop hier */}
            </div>

            <div className="mt-3 flex gap-2">
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
                Render preview
              </button>
            </div>

            {status ? (
              <p className="mt-3 text-sm text-neutral-700 bg-neutral-100 border border-neutral-200 rounded-xl p-3">{status}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="lg:col-span-7 bg-white rounded-2xl border border-neutral-200 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Preview</h2>
            <p className="text-sm text-neutral-600 mt-1">
              Klik op het logo om te selecteren. Sleep om te verplaatsen (snapt naar midden). Delete/Backspace verwijdert het logo.
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

        <p className="mt-3 text-xs text-neutral-500">Tip: upload liefst een PNG met transparante achtergrond.</p>
      </section>

      {/* Render preview modal */}
      {renderPreviewUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onClick={() => setRenderPreviewUrl(null)}
        >
          <div className="w-full max-w-4xl rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
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
        active ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-800 border-neutral-300 hover:bg-neutral-50"
      ].join(" ")}
    >
      {children}
    </button>
  );
}
