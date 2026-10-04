import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const SLATE_SECONDS = 2.2;

export const FONT = loadInter("normal", { weights: ["400", "500", "600", "700", "800", "900"], subsets: ["latin"] }).fontFamily;
export const MONO = loadMono("normal", { weights: ["500", "700"], subsets: ["latin"] }).fontFamily;

// The dashboard's palette (dashboard/style.css)
export const C = {
  bg: "#05080f",
  bg2: "#0a101c",
  card: "#0d1422",
  card2: "#111a2c",
  line: "#1c2840",
  line2: "#263553",
  text: "#eef3fb",
  soft: "#c4cfe2",
  muted: "#7d8ba5",
  dim: "#4a5874",
  accent: "#5cc8ff",
  green: "#3ee08f",
  red: "#ff4d5e",
  orange: "#ff9a3d",
  yellow: "#ffd23f",
  purple: "#b08cff",
  navBlue: "#1a73e8",
  imessage: "#0b84fe",
};

export const FRAMES = {
  stairs: "frames/xQmQysnZDx8sOIMLjPdHoQ.jpg",
  steep: "frames/PWx35RSMyO_sE6Oyp2ti6g.jpg",
  cracked: "frames/6nwbFUCBXIrFnEt9fx5yIg.jpg",
  lot: "frames/8qefMN7kLbtU5c2GZJHbZg.jpg",
  crossing: "frames/BuzHEdofVl5NUni3KTDNHA.jpg",
  fork: "frames/MP7WJdco_yE8zgdWU97o-g.jpg",
  path: "frames/5qt4qZn4dU7hZ839sXSW6g.jpg",
  quad: "frames/yxn86_0-MWDelub6h0wMqg.jpg",
};
