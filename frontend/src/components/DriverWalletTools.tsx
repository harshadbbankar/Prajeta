import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";

import { api } from "@/src/api";
import { fmtDate } from "@/src/hooks";
import { downloadHtml } from "@/src/invoice";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, Field, Row, StatusBadge, Txt, money, useToast } from "@/src/ui";

/** Driver wallet: request a payout of any amount up to the pending balance. */
export function PayoutRequest({ onDone }: { onDone: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const q = useQuery({ queryKey: ["payout-requests"], queryFn: () => api<any>("/driver/payout-requests") });
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const d = q.data;
  if (q.isLoading) return <Card testID="payout-request-card"><Txt v="caption">Loading payout options…</Txt></Card>;
  if (!d) return <Card testID="payout-request-card"><Btn small variant="outline" title="Couldn't load payouts · Retry" onPress={() => q.refetch()} testID="payout-request-retry" /></Card>;
  const paise = Math.round(Number(amount || 0) * 100);
  const submit = async () => {
    setBusy(true);
    try {
      await api("/driver/payout-requests", { body: { amount: paise } });
      toast("Payout requested — finance will review it");
      setAmount("");
      q.refetch();
      onDone();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card testID="payout-request-card" style={{ gap: space.sm }}>
      <Txt v="h3">Request payout</Txt>
      {d.open ? (
        <View testID="payout-request-open" style={{ gap: 2 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Txt v="bodyBold">{money(d.open.amount)} requested</Txt>
            <StatusBadge status={d.open.status} />
          </Row>
          <Txt v="caption">Sent {fmtDate(d.open.created_at)} · to {d.open.payout_method}. You&apos;ll be notified when it&apos;s paid.</Txt>
        </View>
      ) : d.pending >= 10000 ? (
        <>
          <Txt v="caption">Available: {money(d.pending)} · minimum ₹100</Txt>
          <Row>
            <View style={{ flex: 1 }}>
              <Field placeholder="Amount in ₹" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} testID="payout-amount-input" />
            </View>
            <Btn small variant="ghost" title="Max" onPress={() => setAmount(String(d.pending / 100))} testID="payout-amount-max" />
          </Row>
          <Btn title="Request payout" icon="cash" disabled={paise < 10000 || paise > d.pending} loading={busy} onPress={submit} testID="payout-request-submit" />
          {paise > d.pending ? <Txt v="caption" color={colors.error}>More than your pending balance</Txt> : null}
        </>
      ) : (
        <Txt v="caption">You can request a payout once you have at least ₹100 pending.</Txt>
      )}
      {d.items.filter((r: any) => r.status !== "REQUESTED").slice(0, 3).map((r: any) => (
        <Row key={r.id} style={{ justifyContent: "space-between" }}>
          <Txt v="caption">{fmtDate(r.created_at)} · {money(r.amount)}{r.reason ? ` · ${r.reason}` : ""}</Txt>
          <StatusBadge status={r.status} />
        </Row>
      ))}
    </Card>
  );
}

const lastMonths = (n: number) => {
  const out: { key: string; label: string }[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ key: `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`, label: x.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) });
  }
  return out;
};

/** Driver wallet: download a monthly earnings statement. */
export function Statements() {
  const toast = useToast();
  const months = lastMonths(6);
  const [m, setM] = useState(months[0].key);
  const [busy, setBusy] = useState(false);
  return (
    <Card testID="statements-card" style={{ gap: space.sm }}>
      <Txt v="h3">Monthly statement</Txt>
      <Txt v="caption">Trips, adjustments, badge bonuses and payouts with opening and closing balance.</Txt>
      <Row style={{ flexWrap: "wrap" }}>
        {months.map((x) => <Chip key={x.key} label={x.label} selected={m === x.key} onPress={() => setM(x.key)} testID={`statement-month-${x.key}`} />)}
      </Row>
      <Btn
        title="Download statement"
        icon="download"
        variant="outline"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await downloadHtml(`/driver/statements/${m}`, `Prajeta statement ${m}`);
          } catch (e: any) {
            toast(e.message ?? "Could not create statement", "err");
          } finally {
            setBusy(false);
          }
        }}
        testID="statement-download"
      />
    </Card>
  );
}
