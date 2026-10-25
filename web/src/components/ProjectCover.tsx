import { Badge, Box, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title, UnstyledButton } from "@mantine/core";
import { IconAlertTriangle, IconCalendarEvent, IconCoinYen, IconFlag } from "@tabler/icons-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { STATUS, type DocRecord, type ProjectRecord } from "../lib/docs";
import { fromDay, todayDay } from "../lib/gantt";
import { buildOverview } from "../lib/overview";
import type { SiteSettings } from "../lib/settings";
import { DocIcon, ICON_STROKE } from "./icons";

const longDate = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", timeZone: "UTC" });
const pad2 = (n: number) => String(n).padStart(2, "0");

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ size?: number; stroke?: number }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Paper withBorder shadow="xs" p="lg">
      <Group gap="xs" mb="sm">
        <ThemeIcon variant="light" size={32} radius="md">
          <Icon size={18} stroke={ICON_STROKE} />
        </ThemeIcon>
        <Text size="sm" c="dimmed" fw={500}>{label}</Text>
      </Group>
      <Text fz={26} fw={700} lh={1.3} className="ks-stat-value">{value}</Text>
      {sub && <Text size="xs" c="dimmed" mt={4}>{sub}</Text>}
    </Paper>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Text size="xs" className="ks-cover-meta-label">{label}</Text>
      <Text size="sm" fw={500} mt={2}>{children}</Text>
    </div>
  );
}

export default function ProjectCover({ project, docs, site }: { project: ProjectRecord; docs: DocRecord[]; site?: SiteSettings }) {
  const ov = useMemo(() => buildOverview(docs), [docs]);
  const color = project.color ?? "brand";
  const status = STATUS[project.status] ?? { label: project.status, color: "gray" };
  const today = todayDay();
  const next = ov.milestones.find((m) => m.day >= today);
  const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: ov.estimate?.currency ?? "JPY" });
  const base = `/projects/${project.id}`;

  return (
    <Stack gap="lg">
      {/* 表紙 */}
      <Box
        className="ks-cover"
        style={{
          "--ks-cover-from": `var(--mantine-color-${color}-6)`,
          "--ks-cover-to": `var(--mantine-color-${color}-9)`,
        } as React.CSSProperties}
      >
        <Group justify="space-between" align="flex-start">
          <Text className="ks-eyebrow ks-cover-eyebrow">PROPOSAL</Text>
          <Badge variant="white" color={status.color}>{status.label}</Badge>
        </Group>
        <Title order={1} className="ks-cover-title">{project.name}</Title>
        {project.summary && <Text className="ks-cover-summary">{project.summary}</Text>}
        <Group gap="xl" className="ks-cover-meta">
          {project.client && <Meta label="クライアント">{project.client}</Meta>}
          {site?.vendor_name && <Meta label="提案者">{site.vendor_name}</Meta>}
          {site?.contact && <Meta label="担当">{site.contact}</Meta>}
          {project.proposed_at && <Meta label="提案日">{longDate.format(new Date(project.proposed_at))}</Meta>}
          {project.version && <Meta label="版">第 {project.version} 版</Meta>}
          <Meta label="資料">{docs.length} 種類</Meta>
        </Group>
      </Box>

      {/* サマリー */}
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="md">
        <Stat
          icon={IconCalendarEvent}
          label="開発期間"
          value={ov.period ? `約 ${ov.period.weeks} 週間` : "—"}
          sub={
            ov.period
              ? `${longDate.format(fromDay(ov.period.start))} 〜 ${longDate.format(fromDay(ov.period.end - 1))}`
              : "ロードマップのガントから集計します"
          }
        />
        <Stat
          icon={IconCoinYen}
          label="初期費用"
          value={ov.estimate ? yen.format(ov.estimate.initial) : "—"}
          sub={
            !ov.estimate
              ? "見積もりから集計します"
              : ov.estimate.monthly != null
                ? `月額 ${yen.format(ov.estimate.monthly)}（${ov.estimate.tax}）`
                : `${ov.estimate.months} 人月（${ov.estimate.tax}）`
          }
        />
        <Stat
          icon={IconFlag}
          label="マイルストーン"
          value={ov.milestones.length ? `${ov.milestones.length} 件` : "—"}
          sub={next ? `次は「${next.name}」${shortDate.format(fromDay(next.day))}` : ov.milestones.length ? "すべて完了" : "ガントの milestone から集計します"}
        />
        <Stat
          icon={IconAlertTriangle}
          label="対応中のリスク"
          value={ov.risks ? `${ov.risks.open} 件` : "—"}
          sub={ov.risks ? `うち影響・確率が高いもの ${ov.risks.high} 件` : "リスク管理表から集計します"}
        />
      </SimpleGrid>

      {/* マイルストーン */}
      {ov.milestones.length > 0 && (
        <Paper withBorder shadow="xs" p={{ base: "lg", sm: "xl" }}>
          <Title order={3} mb="lg">主要マイルストーン</Title>
          <div className="ks-milestones">
            {ov.milestones.map((m) => (
              <div key={m.name + m.day} className="ks-milestone" data-done={m.day < today || undefined}>
                <span className="ks-milestone-dot" />
                <Text size="xs" c="dimmed" mt="sm">{longDate.format(fromDay(m.day))}</Text>
                <Text size="sm" fw={700}>{m.name}</Text>
              </div>
            ))}
          </div>
        </Paper>
      )}

      {/* 資料の目次 */}
      <div>
        <Title order={3} mb="md">提案資料</Title>
        <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="sm">
          {docs.map((d, i) => (
            <UnstyledButton key={d.type} component={Link} to={`${base}/${d.type}`} className="ks-doc-card">
              <ThemeIcon variant="light" size={36} radius="md">
                <DocIcon type={d.type} />
              </ThemeIcon>
              <div style={{ minWidth: 0 }}>
                <Text size="xs" c="dimmed" className="ks-nav-num">{pad2(i + 1)}</Text>
                <Text size="sm" fw={700} truncate>{d.title}</Text>
              </div>
            </UnstyledButton>
          ))}
        </SimpleGrid>
      </div>
    </Stack>
  );
}
