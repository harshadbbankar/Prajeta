import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { PayoutRequest, Statements } from "@/src/components/DriverWalletTools";
import { fmtDate } from "@/src/hooks";
import { usesNativeTabs } from "@/src/navigation";
import { radius, space, useTheme } from "@/src/theme";
import { Bars, Card, Chip, ChipRow, Empty, ErrorView, Loader, Row, Stat, StatusBadge, Txt, money } from "@/src/ui";

const TABS = [["trips", "Trip earnings"], ["payouts", "Payouts"]];

export default function Earnings() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState("trips");
  const q = useQuery({ queryKey: ["driver-earnings"], queryFn: () => api<any>("/driver/earnings") });
  const e = q.data;
  const weekday = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "narrow" });
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Txt v="title">Wallet</Txt>
        <Txt v="caption">Earnings from verified completed trips</Txt>
      </View>
      {q.isLoading ? (
        <Loader />
      ) : q.error || !e ? (
        <ErrorView message={(q.error as any)?.message ?? "Could not load wallet"} onRetry={() => q.refetch()} />
      ) : (
        <ScrollView refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />} contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: (usesNativeTabs ? insets.bottom : 0) + space.xl }}>
          <Card tone="dark" testID="wallet-balance-card" style={{ gap: 4, backgroundColor: colors.surfaceInverse }}>
            <Txt v="caption" color={colors.surfaceTertiary}>Pending payout</Txt>
            <Txt v="display" color={colors.onSurfaceInverse} testID="earnings-pending">{money(e.pending)}</Txt>
            <Txt v="caption" color={colors.surfaceTertiary}>
              {e.payout_method ? `Paid to ${e.payout_method}` : "Add UPI or bank details in onboarding to receive payouts"}
            </Txt>
          </Card>
          <PayoutRequest onDone={() => q.refetch()} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
            <Stat label="Today" value={money(e.periods.today)} testID="earnings-today" />
            <Stat label="This week" value={money(e.periods.week)} testID="earnings-week" />
            <Stat label="This month" value={money(e.periods.month)} testID="earnings-month" />
            <Stat tone="dark" label="Total earned" value={money(e.total_earned)} sub={`${e.items.length} trips`} testID="earnings-total" />
            <Stat label="Paid out" value={money(e.total_paid)} testID="earnings-paid" />
            <Stat tone="brand" label="Badge bonuses" value={money(e.bonus_total)} testID="earnings-bonus-total" />
          </View>
          <Card style={{ gap: space.sm }} testID="earnings-daily-chart">
            <Row style={{ justifyContent: "space-between" }}>
              <Txt v="h3">Last 14 days</Txt>
              <Txt v="caption">{e.daily.reduce((a: number, d: any) => a + d.trips, 0)} trips</Txt>
            </Row>
            <Bars data={e.daily.map((d: any) => ({ label: weekday(d.date), value: d.amount / 100 }))} />
          </Card>
          <Card testID="badge-bonus-card" style={{ gap: 4, borderColor: colors.warning, borderWidth: e.badge ? 1.5 : 1 }}>
            <Row>
              <Ionicons name={e.badge === "gold" ? "trophy" : "ribbon"} size={18} color={colors.warning} />
              <Txt v="bodyBold" style={{ flex: 1 }}>
                {e.badge ? `You earn ${money(e.bonus_rates[e.badge])} bonus per trip` : "Earn a bonus on every trip"}
              </Txt>
            </Row>
            <Txt v="caption">
              Top Rated: {money(e.bonus_rates.top)}/trip · Gold Star: {money(e.bonus_rates.gold)}/trip. Bonus is added when you complete a trip while holding the badge.
            </Txt>
          </Card>
          <Statements />
          <ChipRow>{TABS.map(([k, l]) => <Chip key={k} label={l} selected={tab === k} onPress={() => setTab(k)} testID={`wallet-tab-${k}`} />)}</ChipRow>
          {tab === "trips" ? (
            e.items.length ? (
              <View style={{ gap: space.sm }}>
                {e.items.map((i: any) => (
                  <View key={i.booking_id} testID={`earning-${i.ref}`} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md, gap: 2 }}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <Txt v="bodyBold" style={{ flex: 1 }} numberOfLines={1}>{i.service_name}</Txt>
                      <Txt v="num">{money(i.amount)}</Txt>
                    </Row>
                    <Txt v="caption">{i.ref} · {fmtDate(i.date)}</Txt>
                    <Txt v="caption">
                      Fare share {money(i.base)}
                      {i.adjustment ? ` · Adjustment ${i.adjustment > 0 ? "+" : ""}${money(i.adjustment)}` : ""}
                      {i.bonus ? ` · ${i.badge === "gold" ? "Gold Star" : "Top Rated"} bonus +${money(i.bonus)}` : ""}
                    </Txt>
                  </View>
                ))}
              </View>
            ) : (
              <Empty icon="wallet-outline" title="No completed trips yet" />
            )
          ) : e.payouts.length ? (
            <Card style={{ gap: 2 }}>
              {e.payouts.map((p: any) => (
                <Row key={p.id} style={{ justifyContent: "space-between", paddingVertical: 6 }}>
                  <View>
                    <Txt v="bodyBold">{money(p.amount)}</Txt>
                    <Txt v="caption">{fmtDate(p.created_at)} · {p.reference}</Txt>
                  </View>
                  <StatusBadge status={p.status} />
                </Row>
              ))}
            </Card>
          ) : (
            <Empty icon="cash-outline" title="No payouts yet" body="Payouts made by Prajeta finance appear here." />
          )}
        </ScrollView>
      )}
    </View>
  );
}
