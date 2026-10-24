import {
  IconAlertTriangle,
  IconApi,
  IconBook2,
  IconCalculator,
  IconChecklist,
  IconCpu,
  IconDatabase,
  IconFileText,
  IconHistory,
  IconLayoutDashboard,
  IconPresentation,
  IconRoute,
  IconTestPipe,
  IconTimeline,
  IconUsers,
  type IconProps,
} from "@tabler/icons-react";

// ドキュメント種別ごとのアイコン。線の太さは全体で 1.6 にそろえる
const DOC_ICONS: Record<string, React.ComponentType<IconProps>> = {
  "executive-summary": IconPresentation,
  personas: IconUsers,
  requirements: IconChecklist,
  "tech-spec": IconCpu,
  screens: IconLayoutDashboard,
  "page-flow": IconRoute,
  "er-diagram": IconDatabase,
  api: IconApi,
  roadmap: IconTimeline,
  estimate: IconCalculator,
  risks: IconAlertTriangle,
  "test-plan": IconTestPipe,
  glossary: IconBook2,
  adr: IconHistory,
};

export const ICON_STROKE = 1.6;

export function DocIcon({ type, size = 18 }: { type: string; size?: number }) {
  const Icon = DOC_ICONS[type] ?? IconFileText;
  return <Icon size={size} stroke={ICON_STROKE} />;
}
