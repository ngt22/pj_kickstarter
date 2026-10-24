// デザイントークン。色・余白・角丸・影・文字サイズはここで決めた値だけを使う。
// 画面やコンポーネントで px や色コードを直接書かず、Mantine の props（c="dimmed", radius="md" など）か
// CSS 変数（var(--mantine-spacing-md), var(--ks-canvas) など）で参照する。
import {
  alpha,
  Alert,
  Anchor,
  AppShell,
  Badge,
  Button,
  Card,
  createTheme,
  type CSSVariablesResolver,
  Modal,
  NavLink,
  Paper,
  SegmentedControl,
  Table,
  Tooltip,
} from "@mantine/core";
import { neutral, ramp } from "./lib/palette";

const SANS = '"Noto Sans JP", "Hiragino Sans", system-ui, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

// ブランドカラー：落ち着いた藍色。主要ボタン・選択状態・リンクに使う
const BRAND_HUE = 268;

export const theme = createTheme({
  colors: {
    brand: ramp(BRAND_HUE, 0.15),
    // 既定の色もすべて同じ明るさ・鮮やかさの規則で作り直す（図のドメイン色やバッジもこれを使う）
    red: ramp(25, 0.16),
    pink: ramp(355, 0.13),
    grape: ramp(320, 0.12),
    violet: ramp(295, 0.13),
    indigo: ramp(278, 0.13),
    blue: ramp(250, 0.13),
    cyan: ramp(215, 0.1),
    teal: ramp(180, 0.1),
    green: ramp(150, 0.12),
    lime: ramp(125, 0.12),
    yellow: ramp(88, 0.13, [0.98, 0.955, 0.915, 0.865, 0.81, 0.75, 0.66, 0.56, 0.47, 0.38]),
    orange: ramp(55, 0.14),
    // 灰色：ライトモードの文字・罫線・背景
    gray: neutral(260, 0.008, [0.984, 0.965, 0.93, 0.88, 0.8, 0.68, 0.56, 0.45, 0.35, 0.25]),
    // dark：ダークモードの文字（0〜2）・罫線（3〜4）・背景（5〜9）
    dark: neutral(265, 0.012, [0.93, 0.84, 0.72, 0.58, 0.43, 0.345, 0.3, 0.245, 0.21, 0.18]),
  },
  primaryColor: "brand",
  primaryShade: { light: 7, dark: 4 },
  black: "#1c212b",
  white: "#ffffff",

  fontFamily: SANS,
  fontFamilyMonospace: MONO,
  headings: {
    fontFamily: SANS,
    fontWeight: "700",
    sizes: {
      h1: { fontSize: "2rem", lineHeight: "1.35" },
      h2: { fontSize: "1.5rem", lineHeight: "1.45" },
      h3: { fontSize: "1.25rem", lineHeight: "1.5" },
      h4: { fontSize: "1.0625rem", lineHeight: "1.55" },
      h5: { fontSize: "0.9375rem", lineHeight: "1.6" },
      h6: { fontSize: "0.875rem", lineHeight: "1.6" },
    },
  },
  fontSizes: { xs: "0.75rem", sm: "0.875rem", md: "1rem", lg: "1.125rem", xl: "1.25rem" },
  lineHeights: { xs: "1.5", sm: "1.6", md: "1.7", lg: "1.75", xl: "1.8" },

  // 4px グリッド
  spacing: { xs: "0.5rem", sm: "0.75rem", md: "1rem", lg: "1.5rem", xl: "2.5rem" },
  radius: { xs: "4px", sm: "6px", md: "8px", lg: "12px", xl: "16px" },
  defaultRadius: "md",
  // 影は輪郭を出す程度に薄く。重なりの深さだけを表す
  shadows: {
    xs: "0 1px 2px rgb(20 24 40 / 0.05)",
    sm: "0 1px 3px rgb(20 24 40 / 0.07), 0 1px 2px rgb(20 24 40 / 0.04)",
    md: "0 4px 12px -2px rgb(20 24 40 / 0.08), 0 2px 4px -2px rgb(20 24 40 / 0.05)",
    lg: "0 12px 28px -6px rgb(20 24 40 / 0.12), 0 4px 8px -4px rgb(20 24 40 / 0.05)",
    xl: "0 24px 48px -12px rgb(20 24 40 / 0.2)",
  },

  other: {
    // 図（ガントのセクション、ER のドメインなど）で順に割り当てる色。隣どうしが見分けやすい順
    chartColors: ["brand", "teal", "orange", "grape", "cyan", "pink", "lime", "yellow", "indigo", "red"],
  },

  components: {
    AppShell: AppShell.extend({
      styles: {
        header: { background: "var(--ks-surface)" },
        navbar: { background: "var(--ks-surface)" },
        main: { background: "var(--ks-canvas)" },
      },
    }),
    Card: Card.extend({ defaultProps: { withBorder: true, radius: "lg", padding: "lg", shadow: "xs" } }),
    Paper: Paper.extend({ defaultProps: { radius: "lg" } }),
    Button: Button.extend({ styles: { label: { fontWeight: 600 } } }),
    Badge: Badge.extend({
      defaultProps: { variant: "light", radius: "sm" },
      styles: { root: { textTransform: "none", letterSpacing: 0, fontWeight: 600 } },
    }),
    Alert: Alert.extend({ defaultProps: { variant: "light", radius: "md" } }),
    NavLink: NavLink.extend({
      styles: { root: { borderRadius: "var(--mantine-radius-md)" }, label: { fontSize: "var(--mantine-font-size-sm)" } },
    }),
    // 見出し行の見た目は styles.css（.mantine-Table-thead）で Markdown の表とそろえる
    Table: Table.extend({ defaultProps: { verticalSpacing: "sm", horizontalSpacing: "md" } }),
    Tooltip: Tooltip.extend({ defaultProps: { radius: "sm", withArrow: true } }),
    Modal: Modal.extend({ defaultProps: { radius: "lg" } }),
    SegmentedControl: SegmentedControl.extend({ defaultProps: { radius: "md" } }),
    Anchor: Anchor.extend({ defaultProps: { underline: "hover" } }),
  },
});

// 面の色。canvas（画面の地）の上に surface（紙・カード）を置き、subtle は表の見出しなどの薄い面
// Mantine 既定のダークモードの light 系（淡い背景のボタン・バッジ）は暗く沈みすぎるので、
// 中間の濃さの色を半透明で重ねて、ライトモードと同じ「淡い色面」に見せる
function darkLightVariants(t: Parameters<CSSVariablesResolver>[0]): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, shades] of Object.entries(t.colors)) {
    if (name === "dark") continue;
    vars[`--mantine-color-${name}-light`] = alpha(shades[5], 0.18);
    vars[`--mantine-color-${name}-light-hover`] = alpha(shades[5], 0.26);
    vars[`--mantine-color-${name}-light-color`] = shades[2];
  }
  return vars;
}

export const cssVariablesResolver: CSSVariablesResolver = (t) => ({
  variables: {},
  light: {
    "--ks-canvas": t.colors.gray[1],
    "--ks-surface": t.white,
    "--ks-subtle": t.colors.gray[0],
    "--mantine-color-default-border": t.colors.gray[2],
  },
  dark: {
    "--ks-canvas": t.colors.dark[8],
    "--ks-surface": t.colors.dark[7],
    "--ks-subtle": t.colors.dark[6],
    "--mantine-color-default-border": t.colors.dark[5],
    ...darkLightVariants(t),
  },
});
