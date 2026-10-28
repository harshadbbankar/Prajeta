import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useConfig } from "@/src/hooks";
import { usesNativeTabs } from "@/src/navigation";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, Empty, Field, Header, Loader, Row, Sheet, StatusBadge, Txt, useToast } from "@/src/ui";

/** Shared support screen for customers and drivers. */
export function SupportScreen({ inTabs = true }: { inTabs?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const cfg = useConfig();
  const q = useQuery({ queryKey: ["tickets"], queryFn: () => api<any[]>("/tickets") });
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [msg, setMsg] = useState("");
  const [cat, setCat] = useState("general");
  const [busy, setBusy] = useState(false);
  const s = cfg.data?.settings ?? {};

  const create = async () => {
    setBusy(true);
    try {
      await api("/tickets", { body: { subject, message: msg, category: cat } });
      toast("Ticket created");
      setOpen(false);
      setSubject("");
      setMsg("");
      q.refetch();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {inTabs ? (
        <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, paddingBottom: space.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Txt v="title">Help & support</Txt>
          <Txt v="caption">{s.business_hours}</Txt>
        </View>
      ) : (
        <Header title="Help & support" subtitle={s.business_hours} />
      )}
      <FlatList
        data={q.data ?? []}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: (inTabs && usesNativeTabs ? insets.bottom : 0) + space.xl }}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.md }}>
            <Row>
              <Btn style={{ flex: 1 }} title="WhatsApp" icon="logo-whatsapp" variant="success" testID="support-whatsapp-button" onPress={() => s.whatsapp_link && Linking.openURL(s.whatsapp_link)} />
              <Btn style={{ flex: 1 }} title="Call" icon="call" variant="outline" testID="support-call-button" onPress={() => Linking.openURL(`tel:${(s.support_phone ?? "").replace(/\s/g, "")}`)} />
            </Row>
            <Btn title="New support ticket" icon="add" variant="dark" testID="new-ticket-button" onPress={() => setOpen(true)} />
            <Txt v="h3">Your tickets</Txt>
          </View>
        }
        ListEmptyComponent={q.isLoading ? <Loader /> : <Empty icon="chatbubbles-outline" title="No tickets yet" body="Raise a ticket and our team will reply here." />}
        renderItem={({ item: t }) => (
          <Card testID={`ticket-row-${t.ref}`} onPress={() => router.push(`/ticket/${t.id}` as any)} style={{ gap: 6 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Txt v="bodyBold" style={{ flex: 1 }} numberOfLines={1}>
                {t.subject}
              </Txt>
              <StatusBadge status={t.status} />
            </Row>
            <Txt v="caption">
              {t.ref} {t.booking_ref ? `· ${t.booking_ref}` : ""} · {t.messages.length} message(s)
            </Txt>
          </Card>
        )}
      />
      <Sheet visible={open} onClose={() => setOpen(false)} title="New ticket" testID="new-ticket-sheet">
        <View style={{ gap: space.md }}>
          <Row style={{ flexWrap: "wrap" }}>
            {["general", "billing", "complaint", "incident"].map((c) => (
              <Chip key={c} label={c[0].toUpperCase() + c.slice(1)} selected={cat === c} onPress={() => setCat(c)} testID={`ticket-category-${c}`} />
            ))}
          </Row>
          <Field placeholder="Subject" value={subject} onChangeText={setSubject} testID="ticket-subject-input" />
          <Field placeholder="How can we help?" multiline value={msg} onChangeText={setMsg} testID="ticket-message-input" />
          <Btn title="Submit" loading={busy} disabled={!subject.trim() || !msg.trim()} onPress={create} testID="ticket-submit-button" />
        </View>
      </Sheet>
    </View>
  );
}

export default function CustomerSupport() {
  return <SupportScreen />;
}
