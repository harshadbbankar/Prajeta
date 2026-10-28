import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Switch, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Field, Header, Loader, Row, Txt, useToast } from "@/src/ui";

const FIELDS: [string, string][] = [["base_fare", "Base fare ₹"], ["base_hours", "Base hours"], ["extra_hour_rate", "Extra hour ₹"], ["night_surcharge", "Night surcharge ₹"], ["per_day", "Per day ₹"], ["waiting_per_hour", "Waiting /hr ₹"], ["cancellation_fee", "Cancellation fee ₹"]];

function ServiceEditor({ s, onSaved }: { s: any; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(FIELDS.map(([k]) => [k, String(k === "base_hours" ? s[k] : (s[k] ?? 0) / 100)])));
  const [active, setActive] = useState(s.active);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const body: any = { active };
      FIELDS.forEach(([k]) => (body[k] = k === "base_hours" ? Number(v[k]) : Math.round(Number(v[k]) * 100)));
      await api(`/admin/services/${s.id}`, { method: "PUT", body });
      toast(`${s.name} tariff saved`);
      onSaved();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };
  const fields = s.pricing_mode === "quote" ? [] : FIELDS.filter(([k]) => (s.pricing_mode === "daily" ? k !== "base_fare" : k !== "per_day"));
  return (
    <Card testID={`tariff-${s.id}`} style={{ gap: space.sm }}>
      <Row style={{ justifyContent: "space-between" }}>
        <View>
          <Txt v="h3">{s.name}</Txt>
          <Txt v="caption">{s.pricing_mode} · version {s.tariff_version}</Txt>
        </View>
        <Switch value={active} onValueChange={setActive} testID={`tariff-active-${s.id}`} />
      </Row>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {fields.map(([k, l]) => (
          <View key={k} style={{ flexBasis: "47%", flexGrow: 1 }}>
            <Field label={l} keyboardType="decimal-pad" value={v[k]} onChangeText={(t) => setV({ ...v, [k]: t })} testID={`tariff-${s.id}-${k}`} />
          </View>
        ))}
      </View>
      {s.pricing_mode === "quote" ? <Txt v="caption">Manual quotation service — priced per booking from Dispatch.</Txt> : null}
      <Btn small variant="dark" title="Save tariff" loading={busy} onPress={save} testID={`tariff-save-${s.id}`} />
    </Card>
  );
}

export default function Tariffs() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const svc = useQuery({ queryKey: ["admin-services"], queryFn: () => api<any[]>("/admin/services") });
  const cities = useQuery({ queryKey: ["admin-cities"], queryFn: () => api<any[]>("/admin/cities") });
  if (!svc.data || !cities.data) return <Loader />;
  const toggleCity = async (c: any) => {
    try {
      await api(`/admin/cities/${c.id}`, { method: "PUT", body: { enabled: !c.enabled } });
      cities.refetch();
    } catch (e: any) {
      toast(e.message, "err");
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title="Tariffs & service areas" subtitle="All apps use these server-side rules" />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xl }}>
        <Card style={{ gap: space.sm }}>
          <Txt v="h3">Cities</Txt>
          {cities.data.map((c) => (
            <Row key={c.id} style={{ justifyContent: "space-between" }}>
              <Txt v="bodyBold">{c.name} <Txt v="caption">× {c.multiplier} · {c.areas.length} areas</Txt></Txt>
              <Switch value={c.enabled} onValueChange={() => toggleCity(c)} testID={`city-toggle-${c.id}`} />
            </Row>
          ))}
        </Card>
        {svc.data.map((s) => <ServiceEditor key={s.id + s.tariff_version} s={s} onSaved={() => svc.refetch()} />)}
        <Txt v="caption">Confirmed bookings keep their fare snapshot and tariff version. GST & advance % are set in Settings.</Txt>
      </KeyboardAwareScrollView>
    </View>
  );
}
