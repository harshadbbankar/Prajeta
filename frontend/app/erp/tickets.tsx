import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { radius, space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, ChipRow, Empty, Field, Header, Loader, Row, Sheet, StatusBadge, Txt, useToast } from "@/src/ui";

export default function Tickets() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [status, setStatus] = useState("open");
  const [mine, setMine] = useState(false);
  const q = useQuery({ queryKey: ["admin-tickets", status, mine], queryFn: () => api<any[]>(`/admin/tickets?status=${status}&mine=${mine}`) });
  const [sel, setSel] = useState<any>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const reply = async (internal: boolean) => {
    setBusy(true);
    try {
      await api(`/admin/tickets/${sel.id}/reply`, { body: { text, internal } });
      setText("");
      toast(internal ? "Internal note added" : "Reply sent");
      const r = await q.refetch();
      setSel(r.data?.find((t) => t.id === sel.id) ?? null);
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };
  const resolve = async () => {
    try {
      await api(`/admin/tickets/${sel.id}/status`, { body: { status: "resolved", resolution: text } });
      toast("Ticket resolved");
      setSel(null);
      setText("");
      q.refetch();
    } catch (e: any) {
      toast(e.message, "err");
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title="Support & incidents" />
      <View style={{ backgroundColor: colors.surface }}>
        <ChipRow>
          <Chip label="Assigned to me" icon="person" selected={mine} onPress={() => setMine(!mine)} testID="tickets-filter-mine" />
          {[["open", "Open"], ["in_progress", "In progress"], ["resolved", "Resolved"], ["", "All"]].map(([k, l]) => <Chip key={l} label={l} selected={status === k} onPress={() => setStatus(k)} testID={`tickets-filter-${l.toLowerCase().replace(/ /g, "-")}`} />)}
        </ChipRow>
      </View>
      {q.isLoading ? <Loader /> : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: insets.bottom + space.xl }}
          ListEmptyComponent={<Empty icon="chatbubbles-outline" title="No tickets" />}
          renderItem={({ item: t }) => (
            <Card testID={`admin-ticket-${t.ref}`} onPress={() => setSel(t)} style={{ padding: space.md, gap: 4, borderLeftWidth: t.priority === "high" ? 4 : 1, borderLeftColor: t.priority === "high" ? colors.error : colors.border }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt v="bodyBold" style={{ flex: 1 }} numberOfLines={1}>{t.subject}</Txt>
                <StatusBadge status={t.status} />
              </Row>
              <Txt v="caption">{t.ref} · {t.category} · {t.user_role} {t.user_name} {t.booking_ref ? `· ${t.booking_ref}` : ""}</Txt>
            </Card>
          )}
        />
      )}
      <Sheet visible={!!sel} onClose={() => setSel(null)} title={sel?.ref ?? ""} testID="admin-ticket-sheet">
        {sel ? (
          <View style={{ gap: space.md }}>
            <Txt v="h3">{sel.subject}</Txt>
            {sel.booking_id ? <Btn small variant="ghost" title={`Open booking ${sel.booking_ref}`} onPress={() => { setSel(null); router.push(`/erp/booking/${sel.booking_id}` as any); }} testID="ticket-open-booking" style={{ alignSelf: "flex-start" }} /> : null}
            {sel.messages.map((m: any, i: number) => (
              <View key={i} style={{ backgroundColor: m.internal ? colors.warningSoft : m.by === "support" ? colors.surfaceInverse : colors.surfaceSecondary, borderRadius: radius.md, padding: space.md }}>
                <Txt v="body" color={m.by === "support" && !m.internal ? colors.onSurfaceInverse : colors.onSurface}>{m.text}</Txt>
                <Txt v="caption">{m.internal ? "Internal · " : ""}{m.name ?? m.by}</Txt>
              </View>
            ))}
            <Field placeholder="Reply, note or resolution" multiline value={text} onChangeText={setText} testID="admin-ticket-reply-input" />
            <Row style={{ flexWrap: "wrap" }}>
              <Btn small title="Reply to user" loading={busy} disabled={!text.trim()} onPress={() => reply(false)} testID="admin-ticket-reply-button" />
              <Btn small variant="outline" title="Internal note" disabled={!text.trim()} onPress={() => reply(true)} testID="admin-ticket-note-button" />
              <Btn small variant="success" title="Resolve" onPress={resolve} testID="admin-ticket-resolve-button" />
            </Row>
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}
