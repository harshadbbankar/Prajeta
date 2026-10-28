import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { space, radius, useTheme } from "@/src/theme";
import { Btn, Field, Header, Loader, Row, StatusBadge, Txt, useToast } from "@/src/ui";

export default function TicketDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const q = useQuery({ queryKey: ["tickets"], queryFn: () => api<any[]>("/tickets") });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const t = q.data?.find((x) => x.id === id);
  const send = async () => {
    setBusy(true);
    try {
      await api(`/tickets/${id}/reply`, { body: { text } });
      setText("");
      q.refetch();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title={t?.subject ?? "Ticket"} subtitle={t ? `${t.ref}${t.booking_ref ? " · " + t.booking_ref : ""}` : ""} right={t ? <StatusBadge status={t.status} /> : null} />
      {!t ? (
        <Loader />
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
            {t.messages.map((m: any, i: number) => {
              const mine = m.by !== "support";
              return (
                <View key={i} testID={`ticket-message-${i}`} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "85%", backgroundColor: mine ? colors.surfaceInverse : colors.surfaceSecondary, borderRadius: radius.lg, padding: space.md }}>
                  <Txt v="body" color={mine ? colors.onSurfaceInverse : colors.onSurface}>{m.text}</Txt>
                  <Txt v="caption" color={mine ? colors.surfaceTertiary : colors.muted}>
                    {mine ? "You" : "Prajeta support"} · {new Date(m.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  </Txt>
                </View>
              );
            })}
            {t.resolution ? <Txt v="caption">Resolution: {t.resolution}</Txt> : null}
          </ScrollView>
          <Row style={{ padding: space.md, paddingBottom: insets.bottom + space.md, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "flex-end" }}>
            <View style={{ flex: 1 }}>
              <Field placeholder="Write a reply" value={text} onChangeText={setText} testID="ticket-reply-input" />
            </View>
            <Btn small title="Send" icon="send" disabled={!text.trim()} loading={busy} onPress={send} testID="ticket-reply-send" style={{ marginBottom: 5 }} />
          </Row>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
