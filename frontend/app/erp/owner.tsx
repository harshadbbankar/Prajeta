import { useQuery } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, authedUrl } from "@/src/api";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, ChipRow, Divider, ErrorView, HBar, Header, KV, Loader, Row, Stat, Txt, money, useToast } from "@/src/ui";

const PERIODS = [["today", "Today"], ["yesterday", "Yesterday"], ["week", "This week"], ["prev_week", "Last week"], ["month", "This month"], ["prev_month", "Last month"], ["quarter", "Quarter"], ["fy", "Financial year"], ["all", "All time"]];
const TABS = ["Overview", "P&L", "Services", "Cities", "Insights"];

const delta = (c: number, p: number) => (p ? `${c >= p ? "▲" : "▼"} ${Math.abs(Math.round(((c - p) * 100) / p))}% vs prev` : "No prior data");

export default function Owner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [period, setPeriod] = useState("month");
  const [tab, setTab] = useState("Overview");
  const ov = useQuery({ queryKey: ["owner-ov", period], queryFn: () => api<any>(`/admin/owner/overview?period=${period}`) });
  const svc = useQuery({ queryKey: ["owner-svc", period], queryFn: () => api<any[]>(`/admin/owner/services?period=${period}`), enabled: tab === "Services" });
  const city = useQuery({ queryKey: ["owner-city", period], queryFn: () => api<any[]>(`/admin/owner/cities?period=${period}`), enabled: tab === "Cities" });
  const ins = useQuery({ queryKey: ["owner-ins"], queryFn: () => api<any[]>(`/admin/owner/insights`), enabled: tab === "Insights" });
  const c = ov.data?.current;
  const p = ov.data?.previous;
  const pnl = ov.data?.pnl;

  const addAction = async (i: any) => {
    try {
      await api("/admin/owner/actions", { body: { finding: i.finding, action: i.recommended_action, priority: i.confidence === "High" ? "High" : "Medium", impact: i.impact, assigned_to: i.action_owner, success_metric: i.expected_outcome, report: "Insights" } });
      toast("Added to action plan");
    } catch (e: any) {
      toast(e.message, "err");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title="Owner intelligence" subtitle="Live from production records" right={<Btn small variant="outline" icon="download" title="CSV" testID="owner-export-csv" onPress={async () => WebBrowser.openBrowserAsync(await authedUrl("/admin/bookings/export.csv"))} />} />
      <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <ChipRow>
          {TABS.map((t) => <Chip key={t} label={t} selected={tab === t} onPress={() => setTab(t)} testID={`owner-tab-${t.toLowerCase().replace("&", "")}`} />)}
        </ChipRow>
        {tab !== "Insights" ? (
          <ChipRow>
            {PERIODS.map(([k, l]) => <Chip key={k} label={l} selected={period === k} onPress={() => setPeriod(k)} testID={`owner-period-${k}`} />)}
          </ChipRow>
        ) : null}
      </View>
      {ov.isLoading ? <Loader /> : ov.error ? <ErrorView message={(ov.error as any).message} onRetry={() => ov.refetch()} /> : (
        <ScrollView refreshControl={<RefreshControl refreshing={ov.isRefetching} onRefresh={() => ov.refetch()} />} contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xl }}>
          {ov.data.data_quality.length && tab !== "Insights" ? (
            <Card tone="grey" testID="data-quality-card" style={{ gap: 4, borderLeftWidth: 4, borderLeftColor: colors.warning }}>
              <Txt v="bodyBold">Data quality</Txt>
              {ov.data.data_quality.map((w: string) => <Txt key={w} v="caption">• {w}</Txt>)}
            </Card>
          ) : null}

          {tab === "Overview" ? (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
                <Stat tone="dark" label="Earned revenue" value={money(c.revenue)} sub={delta(c.revenue, p.revenue)} testID="owner-kpi-revenue" />
                <Stat tone="brand" label="Operating profit" value={money(c.operating_profit)} sub={delta(c.operating_profit, p.operating_profit)} testID="owner-kpi-profit" />
                <Stat label="Gross booking value" value={money(c.gbv)} sub={delta(c.gbv, p.gbv)} />
                <Stat label="Collections" value={money(c.collections)} sub={delta(c.collections, p.collections)} />
                <Stat label="Receivables" value={money(c.receivables)} />
                <Stat label="Driver payouts" value={money(c.payouts)} />
                <Stat label="Contribution" value={money(c.contribution)} sub={`Margin ${c.contribution_margin}%`} />
                <Stat label="Operating expenses" value={money(c.opex)} />
                <Stat label="Bookings" value={String(c.bookings)} sub={delta(c.bookings, p.bookings)} />
                <Stat label="Completion rate" value={`${c.completion_rate}%`} sub={`Cancel ${c.cancellation_rate}%`} />
                <Stat label="Avg booking value" value={money(c.avg_booking_value)} />
                <Stat label="Contribution / booking" value={money(c.contribution_per_booking)} />
                <Stat label="Repeat customers" value={`${c.repeat_rate}%`} sub={`${c.customers} customers`} />
                <Stat label="Driver utilisation" value={`${c.driver_utilisation}%`} sub={`${c.active_drivers}/${c.drivers_approved} drivers`} />
                <Stat label="Acceptance rate" value={c.acceptance_rate == null ? "—" : `${c.acceptance_rate}%`} />
                <Stat label="Revenue / active driver" value={money(c.revenue_per_active_driver)} />
                <Stat label="Discounts & refunds" value={money(c.refunds)} />
                <Stat label="Gateway fees" value={money(c.gateway_fees)} />
              </View>
              <Card style={{ gap: 4 }}>
                <Txt v="h3">KPI definitions</Txt>
                <Txt v="caption">Basis: {ov.data.basis}</Txt>
                {Object.entries(ov.data.definitions).map(([k, v]) => <Txt key={k} v="caption"><Txt v="caption" style={{ color: colors.onSurface }}>{k}: </Txt>{String(v)}</Txt>)}
              </Card>
            </>
          ) : null}

          {tab === "P&L" ? (
            <Card testID="pnl-statement" style={{ gap: 2 }}>
              <Txt v="h2" style={{ marginBottom: space.sm }}>Profit & Loss</Txt>
              <Txt v="label">Service income</Txt>
              {Object.entries(pnl.income_by_service).map(([k, v]) => <KV key={k} k={k} v={money(v as number)} />)}
              <KV k="Total earned revenue" v={money(pnl.revenue)} bold />
              <Divider />
              <Txt v="label">Direct costs</Txt>
              <KV k="Driver & partner payouts" v={`-${money(pnl.driver_payouts)}`} />
              <KV k="Payment gateway fees" v={`-${money(pnl.gateway_fees)}`} />
              <KV k="Refunds" v={`-${money(pnl.refunds)}`} />
              <KV k="Gross contribution" v={money(pnl.contribution)} bold testID="pnl-contribution" />
              <Divider />
              <Txt v="label">Operating expenses</Txt>
              {Object.entries(pnl.expenses).map(([k, v]) => <KV key={k} k={k} v={`-${money(v as number)}`} />)}
              <KV k="Total opex" v={`-${money(pnl.opex)}`} />
              <Divider />
              <KV k="Operating profit / (loss)" v={money(pnl.operating_profit)} bold testID="pnl-operating-profit" />
              <Txt v="caption" style={{ marginTop: space.sm }}>GST collected {money(pnl.tax_collected)} is a liability, not revenue. Driver share {money(pnl.collected_for_drivers)} is collected on behalf of drivers.</Txt>
            </Card>
          ) : null}

          {tab === "Services" ? (svc.isLoading ? <Loader /> : (
            <>
              <Card style={{ gap: space.sm }}>
                <Txt v="h3" style={{ marginBottom: space.sm }}>Revenue by service</Txt>
                {(svc.data ?? []).map((r) => <HBar key={r.key} label={r.name} value={r.revenue} max={svc.data![0]?.revenue} right={`${money(r.revenue)} · ${r.margin}%`} />)}
              </Card>
              {(svc.data ?? []).map((r) => (
                <Card key={r.key} testID={`service-profit-${r.key}`} style={{ gap: 2 }}>
                  <Txt v="h3">{r.name}</Txt>
                  <KV k="Requests / completed / cancelled" v={`${r.requests} / ${r.completed} / ${r.cancelled}`} />
                  <KV k="Cancellation rate" v={`${r.cancellation_rate}%`} />
                  <KV k="GBV" v={money(r.gbv)} />
                  <KV k="Collections · receivables" v={`${money(r.collections)} · ${money(r.receivables)}`} />
                  <KV k="Payouts · gateway fees" v={`${money(r.payouts)} · ${money(r.gateway_fees)}`} />
                  <KV k="Contribution (margin)" v={`${money(r.contribution)} (${r.margin}%)`} bold />
                </Card>
              ))}
              <Txt v="caption">Contribution = revenue − driver payouts − gateway fees. Overheads are not allocated per service.</Txt>
            </>
          )) : null}

          {tab === "Cities" ? (city.isLoading ? <Loader /> : (city.data ?? []).map((r) => (
            <Card key={r.key} testID={`city-profit-${r.key}`} style={{ gap: 2 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt v="h3">{r.name}</Txt>
                <Txt v="caption" color={r.drivers_online <= 1 && r.requests >= 5 ? colors.error : colors.success}>{r.drivers_online} online · {r.drivers_approved} approved</Txt>
              </Row>
              <KV k="Bookings / completed" v={`${r.requests} / ${r.completed}`} />
              <KV k="Fulfilment" v={`${r.fulfilment}%`} />
              <KV k="Revenue · contribution" v={`${money(r.revenue)} · ${money(r.contribution)}`} />
              <KV k="Margin" v={`${r.margin}%`} />
              <KV k="Receivables" v={money(r.receivables)} />
              <KV k="Unassigned now" v={String(r.unassigned)} />
            </Card>
          ))) : null}

          {tab === "Insights" ? (ins.isLoading ? <Loader /> : (ins.data ?? []).map((i, idx) => (
            <Card key={idx} testID={`insight-${idx}`} style={{ gap: 4 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt v="h3" style={{ flex: 1 }}>{i.finding}</Txt>
                <Txt v="caption">Confidence: {i.confidence}</Txt>
              </Row>
              <Txt v="caption"><Txt v="caption" style={{ color: colors.onSurface }}>Evidence: </Txt>{i.evidence}</Txt>
              <Txt v="caption"><Txt v="caption" style={{ color: colors.onSurface }}>Impact: </Txt>{i.impact}</Txt>
              <Txt v="caption"><Txt v="caption" style={{ color: colors.onSurface }}>Action: </Txt>{i.recommended_action}</Txt>
              <Txt v="caption"><Txt v="caption" style={{ color: colors.onSurface }}>Expected: </Txt>{i.expected_outcome} · Owner: {i.action_owner}</Txt>
              <Txt v="caption">Assumptions: {i.assumptions}</Txt>
              <Btn small variant="soft" title="Add to action plan" icon="add" onPress={() => addAction(i)} testID={`insight-add-action-${idx}`} style={{ alignSelf: "flex-start", marginTop: space.sm }} />
            </Card>
          ))) : null}
        </ScrollView>
      )}
    </View>
  );
}
