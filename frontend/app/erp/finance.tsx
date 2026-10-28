import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { fmtDate, todayISO } from "@/src/hooks";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, ChipRow, Field, Header, Loader, Row, Sheet, StatusBadge, Txt, money, useToast } from "@/src/ui";

export default function Finance() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const [tab, setTab] = useState("payments");
  const pays = useQuery({ queryKey: ["fin-pay"], queryFn: () => api<any[]>("/admin/payments"), enabled: tab === "payments" });
  const exp = useQuery({ queryKey: ["fin-exp"], queryFn: () => api<any>("/admin/expenses"), enabled: tab === "expenses" });
  const pout = useQuery({ queryKey: ["fin-pout"], queryFn: () => api<any>("/admin/payouts"), enabled: tab === "payouts" });
  const reqs = useQuery({ queryKey: ["fin-reqs"], queryFn: () => api<any>("/admin/payout-requests"), enabled: tab === "payouts" });
  const [sheet, setSheet] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [text, setText] = useState("");
  const [cat, setCat] = useState("Marketing");
  const [busy, setBusy] = useState(false);
  const paise = Math.round(Number(amount || 0) * 100);
  const close = () => { setSheet(null); setAmount(""); setText(""); };
  const submit = async () => {
    setBusy(true);
    try {
      if (sheet.kind === "refund") await api(`/admin/payments/${sheet.id}/refund`, { body: { amount: paise, reason: text } });
      if (sheet.kind === "expense") await api("/admin/expenses", { body: { category: cat, amount: paise, date: todayISO(), note: text } });
      if (sheet.kind === "payout") await api("/admin/payouts", { body: { driver_id: sheet.driver_id, amount: paise, reference: text } });
      if (sheet.kind === "approve") await api(`/admin/payout-requests/${sheet.id}`, { body: { action: "approve", reference: text } });
      if (sheet.kind === "reject") await api(`/admin/payout-requests/${sheet.id}`, { body: { action: "reject", reason: text } });
      toast(sheet.kind === "approve" ? "Payout approved — driver notified" : sheet.kind === "reject" ? "Request rejected — driver notified" : "Saved");
      close();
      pays.refetch(); exp.refetch(); pout.refetch(); reqs.refetch();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };
  const loading = (tab === "payments" && pays.isLoading) || (tab === "expenses" && exp.isLoading) || (tab === "payouts" && pout.isLoading);
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title="Finance" subtitle="Role-restricted · all changes audited" />
      <View style={{ backgroundColor: colors.surface }}>
        <ChipRow>
          {[["payments", "Payments & refunds"], ["expenses", "Expenses"], ["payouts", "Driver payouts"]].map(([k, l]) => <Chip key={k} label={l} selected={tab === k} onPress={() => setTab(k)} testID={`finance-tab-${k}`} />)}
        </ChipRow>
      </View>
      {loading ? <Loader /> : (
        <ScrollView refreshControl={<RefreshControl refreshing={false} onRefresh={() => { pays.refetch(); exp.refetch(); pout.refetch(); }} />} contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: insets.bottom + space.xl }}>
          {tab === "payments" ? (pays.data ?? []).map((p) => (
            <Card key={p.id} testID={`payment-row-${p.id}`} style={{ padding: space.md, gap: 4 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt v="bodyBold">{money(p.amount)} · {p.kind}</Txt>
                <StatusBadge status={p.status} />
              </Row>
              <Txt v="caption">{p.booking_ref} · {p.customer_name} · {p.method} · {fmtDate(p.created_at)} {p.razorpay_payment_id ? `· ${p.razorpay_payment_id}` : ""}</Txt>
              {p.refunded_amount ? <Txt v="caption" color={colors.error}>Refunded {money(p.refunded_amount)}</Txt> : null}
              {["paid", "partially_refunded"].includes(p.status) && ["owner", "finance"].includes(user?.role ?? "") ? <Btn small variant="outline" title="Refund" style={{ alignSelf: "flex-start" }} onPress={() => setSheet({ kind: "refund", id: p.id })} testID={`refund-button-${p.id}`} /> : null}
            </Card>
          )) : null}
          {tab === "expenses" ? (
            <>
              <Btn title="Add expense" icon="add" onPress={() => setSheet({ kind: "expense" })} testID="add-expense-button" />
              {(exp.data?.items ?? []).map((x: any) => (
                <Card key={x.id} style={{ padding: space.md }}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <Txt v="bodyBold">{x.category}</Txt>
                    <Txt v="num">{money(x.amount)}</Txt>
                  </Row>
                  <Txt v="caption">{fmtDate(x.date)} · {x.note}</Txt>
                </Card>
              ))}
            </>
          ) : null}
          {tab === "payouts" ? (
            <>
              {(reqs.data?.items ?? []).length ? <Txt v="label">Payout requests ({reqs.data.open})</Txt> : null}
              {(reqs.data?.items ?? []).map((r: any) => (
                <Card key={r.id} testID={`payout-request-${r.id}`} style={{ padding: space.md, gap: 4, borderColor: colors.warning, borderWidth: 1.5 }}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <Txt v="bodyBold">{r.driver_name}</Txt>
                    <Txt v="num" color={colors.brandPrimary}>{money(r.amount)}</Txt>
                  </Row>
                  <Txt v="caption">Requested {fmtDate(r.created_at)} · to {r.payout_method} · pending balance {money(r.balance.pending)}</Txt>
                  {r.amount > r.balance.pending ? <Txt v="caption" color={colors.error}>More than current pending balance</Txt> : null}
                  <Row>
                    <Btn small style={{ flex: 1 }} variant="ghost" title="Reject" onPress={() => setSheet({ kind: "reject", id: r.id })} testID={`reject-request-${r.id}`} />
                    <Btn small style={{ flex: 1 }} variant="success" icon="checkmark" title="Approve & mark paid" disabled={r.amount > r.balance.pending} onPress={() => { setText(`UPI-${r.id.slice(0, 6).toUpperCase()}`); setSheet({ kind: "approve", id: r.id, amount: r.amount }); }} testID={`approve-request-${r.id}`} />
                  </Row>
                </Card>
              ))}
              {(pout.data?.drivers ?? []).map((d: any) => (
                <Card key={d.driver_id} testID={`payout-driver-${d.driver_id}`} style={{ padding: space.md, gap: 4 }}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <Txt v="bodyBold">{d.name}</Txt>
                    <Txt v="num" color={d.pending ? colors.brandPrimary : colors.onSurface}>{money(d.pending)}</Txt>
                  </Row>
                  <Txt v="caption">Earned {money(d.earned)} · Paid {money(d.paid)} · UPI {d.upi || "—"}</Txt>
                  {d.pending ? <Btn small variant="outline" title="Record payout" style={{ alignSelf: "flex-start" }} onPress={() => { setAmount(String(d.pending / 100)); setSheet({ kind: "payout", driver_id: d.driver_id }); }} testID={`record-payout-${d.driver_id}`} /> : null}
                </Card>
              ))}
              <Txt v="caption">Payouts are recorded manually after bank/UPI transfer. Automated payouts need explicit approval.</Txt>
            </>
          ) : null}
        </ScrollView>
      )}
      <Sheet visible={!!sheet} onClose={close} title={sheet?.kind === "refund" ? "Refund payment" : sheet?.kind === "expense" ? "Add expense" : sheet?.kind === "approve" ? `Approve ${money(sheet.amount)} payout` : sheet?.kind === "reject" ? "Reject payout request" : "Record payout"} testID="finance-sheet">
        <View style={{ gap: space.md }}>
          {sheet?.kind === "expense" ? (
            <View style={{ marginHorizontal: -space.lg }}>
              <ChipRow>{(exp.data?.categories ?? []).map((c: string) => <Chip key={c} label={c} selected={cat === c} onPress={() => setCat(c)} testID={`expense-cat-${c}`} />)}</ChipRow>
            </View>
          ) : null}
          {sheet?.kind === "approve" || sheet?.kind === "reject" ? null : <Field label="Amount (₹)" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} testID="finance-amount-input" />}
          <Field label={sheet?.kind === "payout" || sheet?.kind === "approve" ? "Transfer reference" : sheet?.kind === "refund" || sheet?.kind === "reject" ? "Reason" : "Note"} value={text} onChangeText={setText} testID="finance-text-input" />
          <Btn title={sheet?.kind === "approve" ? "Confirm — money sent" : sheet?.kind === "reject" ? "Reject request" : "Save"} loading={busy} disabled={sheet?.kind === "approve" || sheet?.kind === "reject" ? !text.trim() : !paise} onPress={submit} testID="finance-submit-button" />
        </View>
      </Sheet>
    </View>
  );
}
