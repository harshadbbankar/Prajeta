import { useQuery } from "@tanstack/react-query";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { fmtDate } from "@/src/hooks";
import { usesNativeTabs } from "@/src/navigation";
import { space, useTheme } from "@/src/theme";
import { Card, Empty, KV, Loader, Row, Stat, StatusBadge, Txt, money } from "@/src/ui";

export default function Earnings() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ["driver-earnings"], queryFn: () => api<any>("/driver/earnings") });
  const e = q.data;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Txt v="title">Earnings</Txt>
        <Txt v="caption">Calculated from verified completed trips</Txt>
      </View>
      {q.isLoading || !e ? (
        <Loader />
      ) : (
        <ScrollView refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />} contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: (usesNativeTabs ? insets.bottom : 0) + space.xl }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
            <Stat tone="dark" label="Total earned" value={money(e.total_earned)} testID="earnings-total" />
            <Stat tone="brand" label="Pending payout" value={money(e.pending)} testID="earnings-pending" />
            <Stat label="Paid out" value={money(e.total_paid)} testID="earnings-paid" />
            <Stat label="Trips" value={String(e.items.length)} />
          </View>
          <Card style={{ gap: 2 }}>
            <Txt v="h3" style={{ marginBottom: space.sm }}>Payout history</Txt>
            {e.payouts.length ? e.payouts.map((p: any) => (
              <Row key={p.id} style={{ justifyContent: "space-between", paddingVertical: 6 }}>
                <View>
                  <Txt v="bodyBold">{money(p.amount)}</Txt>
                  <Txt v="caption">{fmtDate(p.created_at)} · {p.reference}</Txt>
                </View>
                <StatusBadge status={p.status} />
              </Row>
            )) : <Txt v="caption">No payouts yet.</Txt>}
          </Card>
          <Card style={{ gap: 2 }}>
            <Txt v="h3" style={{ marginBottom: space.sm }}>Booking-wise earnings</Txt>
            {e.items.length ? e.items.map((i: any) => <KV key={i.booking_id} k={`${i.service_name} · ${fmtDate(i.date)}`} v={money(i.amount)} />) : <Empty icon="wallet-outline" title="No completed trips yet" />}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}
