// 色のトークンを OKLCH（人の目に均等な色空間）から作る。
// すべての色相で「明るさの段階」と「鮮やかさの上限」をそろえるので、
// どの色を並べても強さが揃い、図やバッジが混ざっても統一感が出る。
import type { MantineColorsTuple } from "@mantine/core";

// 0〜9 の段階ごとの明るさ（Mantine の shade 0〜9 に対応）
const LIGHTNESS = [0.975, 0.945, 0.89, 0.815, 0.73, 0.645, 0.56, 0.48, 0.405, 0.33];
// 段階ごとの鮮やかさの係数。淡い色と濃い色は控えめにして上品に見せる
const CHROMA = [0.12, 0.26, 0.48, 0.7, 0.88, 1, 1, 0.94, 0.84, 0.72];

function toSrgb(x: number): number {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

// OKLCH → sRGB。表示できない色は鮮やかさを下げて範囲に収める
export function oklch(l: number, c: number, h: number): string {
  for (let chroma = c; chroma >= 0; chroma -= 0.002) {
    const a = chroma * Math.cos((h * Math.PI) / 180);
    const b = chroma * Math.sin((h * Math.PI) / 180);
    const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const rgb = [
      4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
      -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
      -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
    ].map(toSrgb);
    if (rgb.every((v) => v >= -0.0005 && v <= 1.0005)) {
      return "#" + rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
    }
  }
  return "#808080";
}

// 色相 h・最大の鮮やかさ c から 10 段階の色を作る
export function ramp(h: number, c: number, lightness = LIGHTNESS): MantineColorsTuple {
  return lightness.map((l, i) => oklch(l, c * CHROMA[i], h)) as unknown as MantineColorsTuple;
}

// 無彩色（わずかに青みを入れて冷たすぎない灰色にする）
export function neutral(h: number, c: number, lightness: number[]): MantineColorsTuple {
  return lightness.map((l) => oklch(l, c, h)) as unknown as MantineColorsTuple;
}
