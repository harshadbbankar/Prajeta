import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import { useCallback, useState } from "react";
import { View } from "react-native";

import { api } from "@/src/api";
import { useContacts } from "@/src/components/TrustedContacts";
import { usePolling } from "@/src/hooks";
import { radius, space, useTheme } from "@/src/theme";
import { Btn, Card, Field, Row, Sheet, Txt, useToast } from "@/src/ui";
import { liveLink, openWhatsApp } from "@/src/whatsapp";

/** SOS during a live trip — alerts Prajeta safety/ops instantly (customer or driver). */
export function SosButton({ bookingId, role }: { bookingId: string; role: "customer" | "driver" }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<boolean | string>(false);
  const contacts = useContacts(role === "customer").data?.contacts ?? [];
  const alertFamily = async (phone?: string) => {
    setBusy(phone ?? "any");
    try {
      const r = await api<any>(`/bookings/${bookingId}/share`, { body: {} });
      await openWhatsApp(`🚨 I've raised an SOS on my Prajeta trip and their safety team is helping. Please call me now. My live location: ${liveLink(r.token)}`, phone);
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };
  const q = useQuery({ queryKey: ["sos", bookingId], queryFn: () => api<any>(`/bookings/${bookingId}/sos`) });
  const alert = q.data?.alert;
  const active = alert && alert.status !== "RESOLVED";
  const poll = useCallback(() => q.refetch(), [q]);
  usePolling(poll, 10000, !!active);

  const send = async () => {
    setBusy(true);
    try {
      let pos: { lat: number; lng: number } | null = null;
      try {
        let perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
        if (perm.granted) {
          const l = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise<null>((r) => setTimeout(() => r(null), 5000)),
          ]);
          if (l) pos = { lat: l.coords.latitude, lng: l.coords.longitude };
        }
      } catch {
        // location is a bonus — never block the SOS
      }
      await api(`/bookings/${bookingId}/sos`, { body: { note, ...(pos ?? {}) } });
      setOpen(false);
      setNote("");
      toast("SOS sent — our safety team is calling you");
      q.refetch();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {active ? (
        <Card testID="sos-status-card" style={{ gap: space.sm, borderColor: colors.error, borderWidth: 2 }}>
          <Row>
            <Ionicons name="alert-circle" size={22} color={colors.error} />
            <Txt v="h3" style={{ flex: 1 }} testID="sos-status-text">
              {alert.status === "ACKNOWLEDGED" ? `${alert.acknowledged_by ?? "Safety team"} is handling your SOS` : "SOS sent · alerting safety team"}
            </Txt>
          </Row>
          <Txt v="caption">Stay where it&apos;s safe. Our team will call you. In immediate danger, call 112.</Txt>
          {role === "customer" ? (
            <View style={{ gap: space.sm }}>
              {contacts.map((c, i) => (
                <Btn key={c.phone} small variant="outline" icon="logo-whatsapp" title={`Alert ${c.name}${c.relation ? ` (${c.relation})` : ""}`} loading={busy === c.phone} onPress={() => alertFamily(c.phone)} testID={`sos-alert-contact-${i}`} />
              ))}
              <Btn small variant="ghost" icon="logo-whatsapp" title={contacts.length ? "Alert someone else" : "Alert family on WhatsApp"} loading={busy === "any"} onPress={() => alertFamily()} testID="sos-alert-family" />
            </View>
          ) : null}
          <Btn title="Call 112 (Emergency)" icon="call" variant="dark" onPress={() => Linking.openURL("tel:112")} testID="sos-call-112" />
        </Card>
      ) : (
        <Btn title="SOS · Emergency help" icon="alert-circle" variant="danger" onPress={() => setOpen(true)} testID="sos-button" />
      )}
      <Sheet visible={open} onClose={() => setOpen(false)} title="Send SOS alert?" testID="sos-sheet">
        <View style={{ gap: space.md }}>
          <View style={{ backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: space.md, gap: 4 }}>
            <Txt v="bodyBold" color={colors.error}>Prajeta&apos;s safety team is alerted instantly</Txt>
            <Txt v="caption">
              They see your trip, {role === "customer" ? "driver" : "customer"} details and your current location (if allowed), and will call you right away.
            </Txt>
          </View>
          <Field placeholder="What's happening? (optional)" value={note} onChangeText={setNote} multiline testID="sos-note-input" />
          <Btn title="Send SOS now" icon="alert-circle" variant="danger" loading={busy === true} onPress={send} testID="sos-confirm-button" />
          <Btn title="Call 112 instead" icon="call" variant="outline" onPress={() => Linking.openURL("tel:112")} testID="sos-sheet-call-112" />
        </View>
      </Sheet>
    </>
  );
}
