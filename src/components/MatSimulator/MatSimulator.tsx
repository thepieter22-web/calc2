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

// snap settings
const SNAP_DISTANCE_PX = 10; // magnet threshold

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

  // logo bbox from last draw (axis-aligned; rotation ignored for hit test)
  const logoBoxRef = useRef<{ cx: number; cy: number; w: number; h: number; rotationDeg: number } | null>(null);

  // delete button hitbox on canvas
  const deleteBtnRef = useRef<{ x: number; y: number; r: number } | null>(null);

  // cache loaded logo image (performance)
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  // keep mat rect for snap calculations (updated every render)
  const matRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // snap guide state stored in ref (no extra React renders needed)
  const snapRef = useRef<{ showX: boolean; showY: boolean; x: number; y: number }>({
    showX: false,
    showY: false,
    x: 0,
    y: 0
  });

  const [status, setStatus] = useState<string>("");
  const [renderPreviewUrl, setRenderPreviewUrl] = useState<string | null>(null);

  const selectedPreset = useMemo(() => {
    return SIZE_PRESETS.find((p) => p.id === config.presetId);
  }, [config.presetId]);

  // preset -> set size
  useEffect(() => {
    if (config.presetId !== "custom" && selectedPreset) {
      setConfig((c) => ({
        ...c,
        widthMm: selectedPreset.widthMm,
        heightMm: selectedPreset.heightMm
      }));
    }
  }, [config.presetId, selectedPreset]);

  // vloerkader -> rubber rand off (safety)
  useEffect(() => {
    if (config.placement === "vloerkader" && config.rubberRand) {
      setConfig((c) => ({ ...c, rubberRand: false }));
    }
  }, [config.placement, config.rubberRand]);

  // orientation swap if needed
  useEffect(() => {
    setConfig((c) => {
      const w = c.widthMm;
      const h = c.heightMm;
      if (c.orientation === "staand" && w > h) return { ...c, widthMm: h, heightMm: w };
      if (c.orientation === "liggend" && h > w) return { ...c, widthMm: h, heightMm: w };
      return c;
    });
  }, [config.orientation]);

  // load logo image once per dataUrl change
  useEffect(() => {
    let cancelled = false;

    async function loadLogo() {
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

    void loadLogo();
    return () => {
      cancelled = true;
    };
  }, [logo.dataUrl]);

  // keyboard delete/backspace when selected
  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      if (!logoSelected) return;
      if (!logo.dataUrl) return;

      if (ev.key === "Delete" || ev.key === "Backspace") {
        ev.preventDefault();
        deleteLogo();
      }

      // optional: Esc deselect
      if (ev.key === "Escape") {
        setLogoSelected(false);
        snapRef.current = { showX: false, showY: false, x: 0, y: 0 };
        void renderPreview();
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
  }, [config, logo, logoSelected]);

  async function renderPreview() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, PREVIEW.canvasW, PREVIEW.canvasH);

    // background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PREVIEW.canvasW, PREVIEW.canvasH);

    const mmToPx = computeMmToPxScale(config, PREVIEW);
    const matWpx = config.widthMm * mmToPx;
    const matHpx = config.heightMm * mmToPx;

    const matX = (PREVIEW.canvasW - matWpx) / 2;
    const matY = (PREVIEW.canvasH - matHpx) / 2;

    // store mat rect for snapping
    matRectRef.current = { x: matX, y: matY, w: matWpx, h: matHpx };

    const r = config.placement === "vloer" || config.placement === "vloerkader" ? 0 : 18;

    drawScene(ctx, matX, matY, matWpx, matHpx);

    const baseColor = adjustColorForUse(config.matColor, config.use);
    drawMat(ctx, matX, matY, matWpx, matHpx, baseColor, r);

    // rubber border only when not in floorframe
    if (config.rubberRand && config.placement !== "vloerkader") {
      drawRubberBorder(ctx, matX, matY, matWpx, matHpx, r);
    }

    // snap guides (draw before logo so logo stays on top)
    drawSnapGuidYes 👍 Let’s add **(1) snap‑to‑center guides (magnetic center lines)** and **(2) delete via keyboard (Delete/Backspace)**.

Below is a **copy/paste patch** you can apply to your current `MatSimulator.tsx` (the “clean” version we fixed). I’ll keep it straightforward and safe.

---

# 1) Snap‑to‑center guides (magnetic center lines)

## ✅ A. Add 3 refs + 1 small state (near your other refs/states)
Find your refs section (where you have `logoBoxRef`, `deleteBtnRef`, etc.) and add this:

```ts
// ✅ mat rect (for snapping)
const matRectRef = useRef<{ x: number; y: number; w: number; h: number; cx: number; cy: number } | null>(null);

// ✅ snap guides flags (draw center lines when near)
const snapGuidesRef = useRef<{ showV: boolean; showH: boolean }>({ showV: false, showH: false });

// ✅ force redraw when guides change without logo change (e.g. pointer up)
const [guideTick, setGuideTick] = useState(0);
