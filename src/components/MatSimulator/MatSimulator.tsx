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

  // ✅ Nieuw: render preview afbeelding (PNG) om te tonen in modal
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

    drawScene(ctx, matX, matY, matWpx, matHpx);

    const baseColor = adjustColorForUse(config.matColor, config.use);
    drawMat(ctx, matX, matY, matWpx, matHpx, baseColor);

    if (config.rubberRand) {
      drawRubberBorder(ctx, matX, matY, matWpx, matHpx);
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

    drawOverlay(ctx, matX, matY, matWpx, matHpx, mmToPx);
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

  function drawMat(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, color);
    grad.addColorStop(1, shade(color, -10));

    ctx.fillStyle = grad;
    roundRect(ctx, x, y, w, h, 18);
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    for (let i = 0; i < 24; i++) {
      const yy = y + (h / 24) * i;
      ctx.beginPath();
      ctx.moveTo(x + 10, yy);
      ctx.lineTo(x + w - 10, yy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRubberBorder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 10;
    roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 16);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 3;
    roundRect(ctx, x + 10, y + 10, w - 20, h - 20, 14);
    ctx.stroke();
    ctx.restore();
  }

  function drawOverlay(
    ctx: CanvasRenderingContext2D,
    matX: number,
    matY: number,
    matW: number,
    matH: number,
    mmToPx: number
  ) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;

    const boxW = 300;
    const boxH = 92;
    const boxX = 16;
    const boxY = 16;

    roundRect(ctx, boxX, boxY, boxW, boxH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#111827";
    ctx.font = "600 14px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("Preview info", boxX + 14, boxY + 26);

    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillStyle = "#374151";
    ctx.fillText(`Type: ${config.use} • Plaatsing: ${config.placement}`, boxX + 14, boxY + 46);
    ctx.fillText(
      `Maat: ${config.widthMm} × ${config.heightMm} mm • Schaal: ${mmToPx.toFixed(2)} px/mm`,
      boxX + 14,
      boxY + 64
    );
    ctx.fillText(`Rubberen rand: ${config.rubberRand ? "ja" : "nee"}`, boxX + 14, boxY + 82);

    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 1;
    roundRect(ctx, matX, matY, matW, matH, 18);
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

