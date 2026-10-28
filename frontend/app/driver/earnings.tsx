import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { PayoutRequest, Statements } from "@/src/components/DriverWalletTools";
import { SosQuick } from "@/src/components/SosQuick";
import { fmtDate } from "@/src/hooks";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { Bars, Card, CardTitle, Chip, ChipRow, Empty, ErrorView, IconTile, Loader, Row, SectionHead, Stat, StatusBadge, Tag, TopBar, Txt, money } from "@/src/ui";

const TABS = [["trips", "Trip earnings"], ["payouts", "Payouts"]];

export default function Earnings() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState("trips");
  const q = useQuery({ queryKey: ["driver-earnings"], queryFn: () => api<any>("/driver/earnings") });
  const e = q.data;
  const weekday = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "narrow" });
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <TopBar eyebrow="Driver wallet" title="Earnings & Payouts" leading={<Ionicons name="wallet-outline" size={22} color={colors.onSurface} />} right={<SosQuick role="driver" />} />
      {q.isLoading ? (
        <Loader />
      ) : q.error || !e ? (
        <ErrorView message={(q.error as any)?.message ?? "Could not load wallet"} onRetry={() => q.refetch()} />
      ) : (
        <ScrollView refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />} contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: (usesNativeTabs ? insets.bottom : 0) + space.xl }}>
          <Card testID="wallet-balance-card" style={{ gap: space.md }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Txt v="label" style={{ fontSize: 12, color: colors.onSurface }}>Net available balance</Txt>
              <Tag tone="success" icon="shield-checkmark-outline" label="Verified trips" />
            </Row>
            <Txt v="display" style={{ fontSize: 36, lineHeight: 42 }} testID="earnings-pending">{money(e.pending)}</Txt>
            <Row gap={space.sm} style={{ backgroundColor: colors.tint, borderRadius: radius.md, padding: space.md }}>
              <Ionicons name="business-outline" size={16} color={colors.onSurface} />
              <Txt v="caption" style={{ flex: 1, color: colors.onSurface }}>
                {e.payout_method ? `Paid to ${e.payout_method}` : "Add UPI or bank details in onboarding to receive payouts"}
              </Txt>
            </Row>
            <PayoutRequest onDone={() => q.refetch()} />
          </Card>
          {e.badge ? (
            <Card tone="tint" testID="badge-bonus-card" style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
              <IconTile icon={e.badge === "gold" ? "trophy" : "ribbon"} tone="dark" />
              <View style={{ flex: 1 }}>
                <Txt v="h3" style={{ fontFamily: fonts.bold }}>{e.badge === "gold" ? "Gold Star Chauffeur" : "Top Rated Chauffeur"}</Txt>
                <Txt v="caption">You earn {money(e.bonus_rates[e.badge])} bonus on every completed trip.</Txt>
              </View>
              <Tag tone="dark" label={`+${money(e.bonus_rates[e.badge])}`} />
            </Card>
          ) : (
            <Card tone="tint" testID="badge-bonus-card" style={{ gap: 4 }}>
              <Txt v="h3" style={{ fontFamily: fonts.bold }}>Earn a bonus on every trip</Txt>
              <Txt v="caption">
                Top Rated: {money(e.bonus_rates.top)}/trip · Gold Star: {money(e.bonus_rates.gold)}/trip. Bonus is added when you complete a trip while holding the badge.
              </Txt>
            </Card>
          )}
          <SectionHead title="Performance Summary" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
            <Stat label="Today" value={money(e.periods.today)} testID="earnings-today" />
            <Stat label="This week" value={money(e.periods.week)} testID="earnings-week" />
            <Stat label="This month" value={money(e.periods.month)} testID="earnings-month" />
            <Stat label="Trips driven" value={`${e.items.length} trips`} sub={`Total ${money(e.total_earned)}`} testID="earnings-total" />
            <Stat label="Paid out" value={money(e.total_paid)} testID="earnings-paid" />
            <Stat label="Tips & bonuses" value={money(e.bonus_total)} testID="earnings-bonus-total" />
          </View>
          <Card style={{ gap: space.sm }} testID="earnings-daily-chart">
            <CardTitle title="Last 14 days" sub="Verified breakdown for this payout cycle" right={<Txt v="caption">{e.daily.reduce((a: number, d: any) => a + d.trips, 0)} trips</Txt>} />
            <Bars color={colors.surfaceInverse} data={e.daily.map((d: any) => ({ label: weekday(d.date), value: d.amount / 100 }))} />
          </Card>
          <Statements />
          <SectionHead title="Recent Settlements" />
          <ChipRow>{TABS.map(([k, l]) => <Chip key={k} label={l} selected={tab === k} onPress={() => setTab(k)} testID={`wallet-tab-${k}`} />)}</ChipRow>
          {tab === "trips" ? (
            e.items.length ? (
              <View style={{ gap: space.sm }}>
                {e.items.map((i: any) => (
                  <Card key={i.booking_id} testID={`earning-${i.ref}`} style={{ gap: space.sm }}>
                    <Row gap={space.md} style={{ alignItems: "flex-start" }}>
                      <IconTile icon="cash-outline" tone="success" size={40} />
                      <View style={{ flex: 1 }}>
                        <Txt v="h3" style={{ fontFamily: fonts.bold }} numberOfLines={1}>{i.service_name}</Txt>
                        <Txt v="caption">{fmtDate(i.date)} · #{i.ref}</Txt>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Txt v="num" color={colors.successText}>+{money(i.amount)}</Txt>
                        <Tag tone="success" label="Settled" />
                      </View>
                    </Row>
                    <View style={{ backgroundColor: colors.tint, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm }}>
                      <Txt v="caption" style={{ color: colors.onSurface }}>
                        Fare share {money(i.base)}
                        {i.adjustment ? ` · Adjustment ${i.adjustment > 0 ? "+" : ""}${money(i.adjustment)}` : ""}
                        {i.bonus ? ` · ${i.badge === "gold" ? "Gold Star" : "Top Rated"} bonus +${money(i.bonus)}` : ""}
                      </Txt>
                    </View>
                  </Card>
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
