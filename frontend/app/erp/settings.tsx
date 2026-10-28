import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Switch, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Field, Header, Loader, Row, Txt, useToast } from "@/src/ui";

const TEXT: [string, string][] = [["company_name", "Company name"], ["legal_name", "Legal entity"], ["tagline", "Hero headline"], ["support_phone", "Support phone"], ["support_email", "Support email"], ["whatsapp_link", "WhatsApp link"], ["business_hours", "Business hours"], ["address", "Address"]];
const NUM: [string, string][] = [["tax_rate", "GST %"], ["advance_percent", "Advance to confirm %"], ["driver_share_percent", "Driver share %"], ["gateway_fee_percent", "Gateway fee %"], ["badge_bonus_top", "Top Rated bonus ₹/trip"], ["badge_bonus_gold", "Gold Star bonus ₹/trip"], ["referral_friend_amount", "Friend saves ₹"], ["referral_referrer_amount", "Referrer earns ₹"]];

export default function Settings() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const q = useQuery({ queryKey: ["admin-settings"], queryFn: () => api<any>("/admin/settings") });
  const logs = useQuery({ queryKey: ["audit"], queryFn: () => api<any[]>("/admin/audit-logs"), retry: false });
  const [s, setS] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data && !s) setS(q.data);
  }, [q.data, s]);
  if (!s) return <Loader />;
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...s };
      const blank = NUM.find(([k]) => String(body[k] ?? "").trim() === "" || isNaN(Number(body[k])));
      if (blank) {
        toast(`${blank[1]} needs a number`, "err");
        return;
      }
      NUM.forEach(([k]) => (body[k] = Number(body[k])));
      await api("/admin/settings", { method: "PUT", body });
      queryClient.invalidateQueries({ queryKey: ["config"] });
      toast("Settings saved");
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title="Settings & audit" />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xl }}>
        {TEXT.map(([k, l]) => <Field key={k} label={l} value={String(s[k] ?? "")} onChangeText={(v) => setS({ ...s, [k]: v })} testID={`settings-${k}`} autoCapitalize="none" />)}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {NUM.map(([k, l]) => (
            <View key={k} style={{ flexBasis: "47%", flexGrow: 1 }}>
              <Field label={l} keyboardType="decimal-pad" value={String(s[k] ?? "")} onChangeText={(v) => setS({ ...s, [k]: v })} testID={`settings-${k}`} />
            </View>
          ))}
        </View>
        {[["cash_enabled", "Allow cash balance payments"], ["bookings_enabled", "Accept new bookings"]].map(([k, l]) => (
          <Row key={k} style={{ justifyContent: "space-between", minHeight: 48 }}>
            <Txt v="bodyBold">{l}</Txt>
            <Switch value={!!s[k]} onValueChange={(v) => setS({ ...s, [k]: v })} testID={`settings-${k}`} />
          </Row>
        ))}
        <Btn title="Save settings" loading={busy} onPress={save} testID="settings-save-button" />
        <Card tone="grey" style={{ gap: 4, marginTop: space.lg }}>
          <Txt v="h3">Audit log</Txt>
          {logs.error ? <Txt v="caption">Visible to Owner / Super Admin only.</Txt> : null}
          {(logs.data ?? []).slice(0, 50).map((a) => (
            <Txt key={a.id} v="caption" style={{ color: colors.onSurface }}>
              {new Date(a.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {a.actor_name} ({a.actor_role}) · {a.action} · {a.entity}
            </Txt>
          ))}
        </Card>
      </KeyboardAwareScrollView>
    </View>
  );
}
