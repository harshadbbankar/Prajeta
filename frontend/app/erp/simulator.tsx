import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { space, useTheme } from "@/src/theme";
import { Card, Field, Header, KV, Loader, Row, Stat, Txt, money } from "@/src/ui";

type S = { price: string; payout: string; discount: string; volume: string; cancel: string; fixed: string; marketing: string; drivers: string; tripsPerDriver: string };

function run(s: S) {
  const n = (k: keyof S) => Number(s[k]) || 0;
  const completed = n("volume") * (1 - n("cancel") / 100);
  const price = n("price") * (1 - n("discount") / 100);
  const revenue = completed * price;
  const payouts = revenue * (n("payout") / 100);
  const fees = revenue * 0.02;
  const contribution = revenue - payouts - fees;
  const fixed = n("fixed") + n("marketing");
  const profit = contribution - fixed;
  const cpb = completed ? contribution / completed : 0;
  const breakeven = cpb > 0 ? Math.ceil(fixed / cpb) : Infinity;
  const capacity = n("drivers") * n("tripsPerDriver");
  return { completed, revenue, payouts, contribution, margin: revenue ? (contribution * 100) / revenue : 0, profit, breakeven, capacity, cpb, cash: Math.max(0, -profit) };
}

export default function Simulator() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const ov = useQuery({ queryKey: ["owner-ov", "month"], queryFn: () => api<any>("/admin/owner/overview?period=month") });
  const [base, setBase] = useState<S | null>(null);
  const [sc, setSc] = useState<S | null>(null);
  useEffect(() => {
    if (ov.data && !base) {
      const c = ov.data.current;
      const b: S = {
        price: String(Math.round((c.revenue_per_booking || 120000) / 100)),
        payout: String(c.revenue ? Math.round((c.payouts * 100) / c.revenue) : 70),
        discount: "0",
        volume: String(Math.max(c.bookings, 1)),
        cancel: String(c.cancellation_rate),
        fixed: String(Math.round(c.opex / 100) || 100000),
        marketing: "0",
        drivers: String(c.drivers_approved || 1),
        tripsPerDriver: "26",
      };
      setBase(b);
      setSc(b);
    }
  }, [ov.data, base]);
  if (!base || !sc) return <Loader />;
  const a = run(base);
  const b = run(sc);
  const set = (k: keyof S) => (v: string) => setSc({ ...sc, [k]: v.replace(/[^0-9.]/g, "") });
  const fields: [keyof S, string][] = [["price", "Avg price / booking (₹, pre-tax)"], ["payout", "Driver payout %"], ["discount", "Discount %"], ["volume", "Bookings / month"], ["cancel", "Cancellation %"], ["fixed", "Fixed costs / month (₹)"], ["marketing", "Extra marketing (₹)"], ["drivers", "Active drivers"], ["tripsPerDriver", "Trips per driver / month"]];
  const r = (x: number) => money(Math.round(x * 100));
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title="Pricing simulator" subtitle="Scenarios never change live tariffs" />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xl }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
          <Stat tone="dark" label="Scenario profit / month" value={r(b.profit)} sub={`Baseline ${r(a.profit)}`} testID="sim-profit" />
          <Stat tone="brand" label="Contribution margin" value={`${b.margin.toFixed(1)}%`} sub={`Baseline ${a.margin.toFixed(1)}%`} testID="sim-margin" />
          <Stat label="Break-even bookings" value={Number.isFinite(b.breakeven) ? String(b.breakeven) : "Never"} sub={`Baseline ${Number.isFinite(a.breakeven) ? a.breakeven : "Never"}`} testID="sim-breakeven" />
          <Stat label="Driver capacity" value={`${Math.round(b.completed)} / ${b.capacity}`} sub={b.completed > b.capacity ? "Over capacity!" : "Within capacity"} />
        </View>
        <Card style={{ gap: 2 }}>
          <Row style={{ justifyContent: "space-between" }}><Txt v="label">Metric</Txt><Txt v="label">Baseline → Scenario</Txt></Row>
          <KV k="Completed bookings" v={`${Math.round(a.completed)} → ${Math.round(b.completed)}`} />
          <KV k="Revenue" v={`${r(a.revenue)} → ${r(b.revenue)}`} />
          <KV k="Driver payouts" v={`${r(a.payouts)} → ${r(b.payouts)}`} />
          <KV k="Contribution" v={`${r(a.contribution)} → ${r(b.contribution)}`} />
          <KV k="Contribution / booking" v={`${r(a.cpb)} → ${r(b.cpb)}`} />
          <KV k="Cash required (if loss)" v={`${r(a.cash)} → ${r(b.cash)}`} />
        </Card>
        <Txt v="h3">Adjust scenario</Txt>
        {fields.map(([k, l]) => <Field key={k} label={l} keyboardType="decimal-pad" value={sc[k]} onChangeText={set(k)} testID={`sim-${k}-input`} />)}
        <Txt v="caption">Baseline pre-filled from this month actuals. Gateway fee assumed 2% of revenue. Estimates, not forecasts of actual results.</Txt>
      </KeyboardAwareScrollView>
    </View>
  );
}
