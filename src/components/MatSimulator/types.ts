export type MatUse = "binnen" | "buiten";
export type Placement = "vloerkader" | "vloer";
export type Orientation = "liggend" | "staand";

export type SizePreset = {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
};

export type LogoState = {
  dataUrl?: string;
  x: number; // preview pixels
  y: number; // preview pixels
  scale: number; // 1 = basis
  rotationDeg: number;
  opacity: number;
};

export type MatConfig = {
  use: MatUse;
  placement: Placement;
  orientation: Orientation;
  rubberRand: boolean;

  presetId: string | "custom";
  widthMm: number;
  heightMm: number;

  matColor: string;
};

export type PreviewSettings = {
  canvasW: number;
  canvasH: number;
  paddingPx: number;
};
