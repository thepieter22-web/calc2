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

function mmToCm(mm: number) {
  return mm / 10;
}

function cmToMm(cm: number) {
  return Math.round(cm * 10);
}

function formatCm(valueMm: number) {
  return `${mmToCm(valueMm)} cm`;
}

function getPresetLabelCm(widthMm: number, heightMm: number) {
  return `${mmToCm(widthMm)} × ${mmToCm(heightMm)} cm`;
}

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
