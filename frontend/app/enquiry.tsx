import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useConfig } from "@/src/hooks";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, ChipRow, Field, Header, Txt } from "@/src/ui";

const TITLES: Record<string, string> = {
  corporate: "Corporate enquiry",
  monthly: "Monthly driver enquiry",
  permanent: "Permanent placement enquiry",
  contact: "Contact us",
};

export default function Enquiry() {
  const { type = "corporate" } = useLocalSearchParams<{ type?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const cfg = useConfig();
  const [f, setF] = useState({ name: user?.name ?? "", phone: user?.phone?.slice(3) ?? "", email: "", company: "", city_id: "", drivers_needed: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setErr("");
    setBusy(true);
    try {
      const r = await api<{ ref: string }>("/public/enquiry", {
        body: { ...f, type, drivers_needed: f.drivers_needed ? Number(f.drivers_needed) : null },
      });
      setDone(r.ref);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title={TITLES[type] ?? "Enquiry"} subtitle="We respond within one business day" />
      {done ? (
        <View style={{ padding: space.lg }}>
          <Card testID="enquiry-success" style={{ gap: space.sm }}>
            <Txt v="h2">Thank you!</Txt>
            <Txt v="body">Your enquiry reference is</Txt>
            <Txt v="numLg" color={colors.brandPrimary}>{done}</Txt>
            <Txt v="body" color={colors.muted}>Our team will contact you shortly with a quotation.</Txt>
          </Card>
        </View>
      ) : (
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xl }}>
          <Field label="Your name" value={f.name} onChangeText={set("name")} testID="enquiry-name-input" />
          <Field label="Mobile number" keyboardType="phone-pad" maxLength={10} value={f.phone} onChangeText={set("phone")} testID="enquiry-phone-input" />
          <Field label="Email (optional)" keyboardType="email-address" autoCapitalize="none" value={f.email} onChangeText={set("email")} testID="enquiry-email-input" />
          {type === "corporate" ? <Field label="Company / Society / Hotel" value={f.company} onChangeText={set("company")} testID="enquiry-company-input" /> : null}
          <View style={{ marginHorizontal: -space.lg }}>
            <View style={{ paddingHorizontal: space.lg }}>
              <Txt v="label">City</Txt>
            </View>
            <ChipRow>
              {(cfg.data?.cities ?? []).map((c) => (
                <Chip key={c.id} label={c.name} selected={f.city_id === c.id} onPress={() => set("city_id")(c.id)} testID={`enquiry-city-${c.id}`} />
              ))}
            </ChipRow>
          </View>
          {type !== "contact" ? <Field label="Drivers needed" keyboardType="number-pad" value={f.drivers_needed} onChangeText={set("drivers_needed")} testID="enquiry-drivers-input" /> : null}
          <Field label="Requirements" multiline placeholder="Schedule, hours per day, vehicle type, start date…" value={f.message} onChangeText={set("message")} testID="enquiry-message-input" />
          {err ? <Txt v="bodyBold" color={colors.error} testID="enquiry-error">{err}</Txt> : null}
          <Btn title="Submit enquiry" loading={busy} onPress={submit} testID="enquiry-submit-button" />
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}
