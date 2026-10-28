import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { space, radius, useTheme } from "@/src/theme";
import { Card, Chip, ChipRow, Empty, ErrorView, Header, Loader, Row, Txt } from "@/src/ui";

const PERIODS = [["7d", "7 days"], ["30d", "30 days"], ["month", "This month"], ["prev_month", "Last month"], ["quarter", "Quarter"], ["fy", "FY"], ["all", "All time"]];
const ROLE: Record<string, string> = { owner: "Owner", super_admin: "Super Admin", ops: "Operations", verification: "Verification", support: "Support", finance: "Finance" };
const mins = (m: number | null) => (m == null ? "—" : m < 60 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} hrs`);

function Metric({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ flexBasis: "30%", flexGrow: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: space.sm }}>
      <Txt v="caption" numberOfLines={2} style={{ fontSize: 10 }}>{label}</Txt>
      <Txt v="num">{value}</Txt>
    </View>
  );
}

export default function Performance() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState("30d");
  const q = useQuery({ queryKey: ["staff-perf", period], queryFn: () => api<any>(`/admin/staff/performance?period=${period}`), retry: false });
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title="Staff performance" subtitle="From audit logs, tickets & dispatch records" />
      <View style={{ backgroundColor: colors.surface }}>
        <ChipRow>
          {PERIODS.map(([k, l]) => <Chip key={k} label={l} selected={period === k} onPress={() => setPeriod(k)} testID={`perf-period-${k}`} />)}
        </ChipRow>
      </View>
      {q.isLoading ? <Loader /> : q.error ? <ErrorView message={(q.error as any).message} onRetry={() => q.refetch()} /> : (
        <FlatList
          data={q.data.staff}
          keyExtractor={(s) => s.id}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xl }}
          ListEmptyComponent={<Empty icon="people-outline" title="No staff yet" />}
          ListFooterComponent={<Txt v="caption" style={{ marginTop: space.sm }}>Score = {q.data.score_formula}. Dispatch time = booking confirmed → driver offered. Response time = ticket created → first staff reply.</Txt>}
          renderItem={({ item: s, index }) => (
            <Card testID={`perf-staff-${s.phone}`} style={{ gap: space.sm, borderColor: index === 0 && s.score ? colors.warning : colors.border, borderWidth: index === 0 && s.score ? 1.5 : 1 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Row style={{ flex: 1 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: index < 3 && s.score ? colors.surfaceInverse : colors.surfaceSecondary }}>
                    {index === 0 && s.score ? <Ionicons name="trophy" size={16} color={colors.warning} /> : <Txt v="bodyBold" color={index < 3 && s.score ? colors.onSurfaceInverse : colors.onSurface}>{index + 1}</Txt>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt v="bodyBold" numberOfLines={1}>{s.name}</Txt>
                    <Txt v="caption">{ROLE[s.role] ?? s.role}</Txt>
                  </View>
                </Row>
                <View style={{ alignItems: "flex-end" }}>
                  <Txt v="label">Score</Txt>
                  <Txt v="num" color={colors.brandPrimary} testID={`perf-score-${s.phone}`}>{s.score}</Txt>
                </View>
              </Row>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                <Metric label="Tickets handled" value={String(s.tickets_handled)} testID={`perf-tickets-${s.phone}`} />
                <Metric label="Resolved" value={String(s.tickets_resolved)} />
                <Metric label="1st response" value={mins(s.avg_first_response_mins)} />
                <Metric label="Approvals" value={String(s.approvals)} testID={`perf-approvals-${s.phone}`} />
                <Metric label="Docs verified" value={String(s.docs_verified)} />
                <Metric label="Rejected/susp." value={String(s.rejections)} />
                <Metric label="Dispatches" value={String(s.assignments)} testID={`perf-dispatch-${s.phone}`} />
                <Metric label="Avg dispatch" value={mins(s.avg_dispatch_mins)} />
                <Metric label="Quotes · finance" value={`${s.quotes} · ${s.finance_actions}`} />
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}
