import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { radius, space, useTheme } from "@/src/theme";
import { Card, Chip, ChipRow, Empty, ErrorView, Header, Loader, Row, Stat, Txt } from "@/src/ui";

const PERIODS = [["7d", "7 days"], ["30d", "30 days"], ["month", "This month"], ["quarter", "Quarter"], ["all", "All time"]];

export default function Ratings() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState("30d");
  const q = useQuery({ queryKey: ["ratings", period], queryFn: () => api<any>(`/admin/ratings?period=${period}`), retry: false });
  const d = q.data;
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title="Driver ratings" subtitle="Ranked by review-weighted score" />
      <View style={{ backgroundColor: colors.surface }}>
        <ChipRow>
          {PERIODS.map(([k, l]) => <Chip key={k} label={l} selected={period === k} onPress={() => setPeriod(k)} testID={`ratings-period-${k}`} />)}
        </ChipRow>
      </View>
      {q.isLoading ? <Loader /> : q.error ? <ErrorView message={(q.error as any).message} onRetry={() => q.refetch()} /> : (
        <FlatList
          data={d.drivers}
          keyExtractor={(r: any) => r.driver_id}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xl }}
          ListHeaderComponent={
            <View style={{ gap: space.md }}>
              <Row>
                <View style={{ flex: 1 }}><Stat label="Reviews" value={String(d.total_reviews)} testID="ratings-total" /></View>
                <View style={{ flex: 1 }}><Stat label="Avg rating" value={d.average ? `★ ${d.average}` : "—"} tone="brand" testID="ratings-average" /></View>
                <View style={{ flex: 1 }}><Stat label="Low (≤2★)" value={String(d.low_ratings.length)} /></View>
              </Row>
              {d.low_ratings.length ? (
                <Card testID="low-ratings-card" style={{ gap: space.sm, borderColor: colors.error, borderWidth: 1.5 }}>
                  <Row><Ionicons name="alert-circle" size={18} color={colors.error} /><Txt v="h3">Needs attention</Txt></Row>
                  {d.low_ratings.slice(0, 5).map((r: any) => (
                    <View key={r.booking_id} style={{ gap: 2 }}>
                      <Txt v="bodyBold">{r.name} · {"★".repeat(r.rating)}</Txt>
                      <Txt v="caption">{r.comment || "No comment"} · {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</Txt>
                    </View>
                  ))}
                </Card>
              ) : null}
              <Txt v="label">Leaderboard</Txt>
            </View>
          }
          ListEmptyComponent={<Empty icon="star-outline" title="No reviews in this period" />}
          ListFooterComponent={<Txt v="caption" style={{ marginTop: space.sm }}>Score = {d.score_formula}, so drivers with many good reviews rank above a single 5★. Badges (based on all-time reviews): Top Rated = ★4.5+ with 5+ reviews, Gold Star = ★4.8+ with 10+ reviews. Badge holders see broadcast offers one wave (3 min) earlier.</Txt>}
          renderItem={({ item: r, index }) => (
            <Card testID={`rating-driver-${index}`} onPress={() => router.push(`/erp/driver/${r.driver_id}` as any)} style={{ gap: space.sm, borderColor: index === 0 ? colors.warning : colors.border, borderWidth: index === 0 ? 1.5 : 1 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Row style={{ flex: 1 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: index < 3 ? colors.surfaceInverse : colors.surfaceSecondary }}>
                    {index === 0 ? <Ionicons name="trophy" size={16} color={colors.warning} /> : <Txt v="bodyBold" color={index < 3 ? colors.onSurfaceInverse : colors.onSurface}>{index + 1}</Txt>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt v="bodyBold" numberOfLines={1}>{r.name}</Txt>
                    {r.badge_label ? <Txt v="label" color={colors.warning} testID={`rating-badge-${index}`}>{r.badge === "gold" ? "🏆" : "🎖️"} {r.badge_label}</Txt> : null}
                    <Txt v="caption">{r.city_id || "—"} · {r.completed_trips} trips completed</Txt>
                  </View>
                </Row>
                <View style={{ alignItems: "flex-end" }}>
                  <Txt v="num" color={colors.brandPrimary}>★ {r.average}</Txt>
                  <Txt v="caption">{r.count} reviews</Txt>
                </View>
              </Row>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {[["Score", String(r.score)], ["5★ share", `${r.five_star_pct}%`], ["Low ratings", String(r.low_count)]].map(([k, v]) => (
                  <View key={k} style={{ flexGrow: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: space.sm }}>
                    <Txt v="caption" style={{ fontSize: 10 }}>{k}</Txt>
                    <Txt v="bodyBold">{v}</Txt>
                  </View>
                ))}
              </View>
              {r.top_tags.length ? <Txt v="caption">Praised for: {r.top_tags.map(([t, n]: any) => `${t} (${n})`).join(", ")}</Txt> : null}
              {r.recent.find((x: any) => x.comment) ? <Txt v="caption" numberOfLines={2}>“{r.recent.find((x: any) => x.comment).comment}”</Txt> : null}
            </Card>
          )}
        />
      )}
    </View>
  );
}
