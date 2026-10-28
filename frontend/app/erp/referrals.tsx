import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { fmtDate } from "@/src/hooks";
import { radius, space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, ChipRow, Empty, ErrorView, Field, Header, Loader, Row, Sheet, Stat, Txt, money, useToast } from "@/src/ui";
import { openWhatsApp } from "@/src/whatsapp";

const PERIODS = [["30d", "30 days"], ["month", "This month"], ["quarter", "Quarter"], ["all", "All time"]];

export default function Referrals() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const canReward = !!user && ["owner", "super_admin", "finance"].includes(user.role);
  const [period, setPeriod] = useState("all");
  const [target, setTarget] = useState<any>(null);
  const [amount, setAmount] = useState("200");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["referrals", period], queryFn: () => api<any>(`/admin/referrals?period=${period}`), retry: false });
  const d = q.data;

  const reward = async () => {
    setBusy(true);
    try {
      await api(`/admin/referrals/${target.user_id}/reward`, { body: { amount: Math.round(Number(amount) * 100), note } });
      toast(`₹${amount} credit sent to ${target.name.split(" ")[0]}`);
      setTarget(null);
      setNote("");
      q.refetch();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <Header title="Referral leaderboard" subtitle="Customers who bring friends to Prajeta" />
      <View style={{ backgroundColor: colors.surface }}>
        <ChipRow>{PERIODS.map(([k, l]) => <Chip key={k} label={l} selected={period === k} onPress={() => setPeriod(k)} testID={`referrals-period-${k}`} />)}</ChipRow>
      </View>
      {q.isLoading ? <Loader /> : q.error ? <ErrorView message={(q.error as any).message} onRetry={() => q.refetch()} /> : (
        <FlatList
          data={d.referrers}
          keyExtractor={(r: any) => r.user_id}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xl }}
          ListHeaderComponent={
            <View style={{ gap: space.md }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
                <Stat label="Referrers" value={String(d.totals.referrers)} testID="referrals-total-referrers" />
                <Stat label="Friends booked" value={String(d.totals.friends_joined)} testID="referrals-total-friends" />
                <Stat tone="brand" label="Completed trips" value={String(d.totals.friends_completed)} testID="referrals-total-completed" />
                <Stat tone="dark" label="Referred revenue" value={money(d.totals.referred_revenue)} testID="referrals-total-revenue" />
              </View>
              <Txt v="label">Top referrers</Txt>
            </View>
          }
          ListEmptyComponent={<Empty icon="gift-outline" title="No referrals yet" body="When customers share their code and friends book, they show up here." />}
          ListFooterComponent={
            d.recent.length ? (
              <Card style={{ gap: space.sm, marginTop: space.md }} testID="referrals-recent">
                <Txt v="h3">Recent referred bookings</Txt>
                {d.recent.map((x: any) => (
                  <Row key={x.booking_id} style={{ justifyContent: "space-between" }}>
                    <Txt v="caption" style={{ flex: 1 }}>{x.friend_name || "Friend"} via {x.referrer_name} · {x.ref} · {fmtDate(x.created_at)}</Txt>
                    <Txt v="label" color={x.rewarded ? colors.success : colors.muted}>{x.rewarded ? "Rewarded" : x.status.replace(/_/g, " ").toLowerCase()}</Txt>
                  </Row>
                ))}
              </Card>
            ) : null
          }
          renderItem={({ item: r, index }) => (
            <Card testID={`referrer-${index}`} style={{ gap: space.sm, borderColor: index === 0 ? colors.warning : colors.border, borderWidth: index === 0 ? 1.5 : 1 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Row style={{ flex: 1 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: index < 3 ? colors.surfaceInverse : colors.surfaceSecondary }}>
                    {index === 0 ? <Ionicons name="trophy" size={16} color={colors.warning} /> : <Txt v="bodyBold" color={index < 3 ? colors.onSurfaceInverse : colors.onSurface}>{index + 1}</Txt>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt v="bodyBold" numberOfLines={1}>{r.name}</Txt>
                    <Txt v="caption">{r.code} · last referral {fmtDate(r.last_referral_at)}</Txt>
                  </View>
                </Row>
                <View style={{ alignItems: "flex-end" }}>
                  <Txt v="num" color={colors.brandPrimary} testID={`referrer-completed-${index}`}>{r.friends_completed}</Txt>
                  <Txt v="caption">completed</Txt>
                </View>
              </Row>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {[["Friends booked", String(r.friends_joined)], ["Revenue", money(r.referred_revenue)], ["Earned", money(r.credit_earned + r.bonus_given)], ["Unused credit", money(r.credit_available)]].map(([k, v]) => (
                  <View key={k} style={{ flexGrow: 1, flexBasis: "45%", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: space.sm }}>
                    <Txt v="caption" style={{ fontSize: 10 }}>{k}</Txt>
                    <Txt v="bodyBold">{v}</Txt>
                  </View>
                ))}
              </View>
              <Row>
                {r.phone ? (
                  <Btn small style={{ flex: 1 }} variant="outline" icon="logo-whatsapp" title="Say thanks"
                    onPress={() => openWhatsApp(`Hi ${r.name.split(" ")[0]}, thank you for introducing ${r.friends_joined} friend(s) to Prajeta! 🙏 — Team Prajeta`, r.phone)}
                    testID={`referrer-thank-${index}`} />
                ) : null}
                {canReward ? <Btn small style={{ flex: 1 }} variant="success" icon="gift" title="Give credit" onPress={() => setTarget(r)} testID={`referrer-reward-${index}`} /> : null}
              </Row>
            </Card>
          )}
        />
      )}
      <Sheet visible={!!target} onClose={() => setTarget(null)} title={target ? `Thank-you credit for ${target.name.split(" ")[0]}` : ""} testID="referral-reward-sheet">
        <View style={{ gap: space.md }}>
          <Txt v="caption">Added to their booking credit and used automatically on their next booking. They get a notification.</Txt>
          <Row style={{ flexWrap: "wrap" }}>
            {["100", "200", "500"].map((a) => <Chip key={a} label={`₹${a}`} selected={amount === a} onPress={() => setAmount(a)} testID={`reward-amount-${a}`} />)}
          </Row>
          <Field label="Amount (₹)" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} testID="reward-amount-input" />
          <Field label="Message (optional)" value={note} onChangeText={setNote} testID="reward-note-input" />
          <Btn title="Send credit" icon="gift" variant="success" disabled={!(Number(amount) >= 1)} loading={busy} onPress={reward} testID="reward-submit" />
        </View>
      </Sheet>
    </View>
  );
}
