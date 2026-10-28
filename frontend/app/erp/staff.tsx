import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, ChipRow, Empty, ErrorView, Field, Header, Loader, Row, Sheet, Txt, useToast } from "@/src/ui";

const ROLES: [string, string, string][] = [
  ["ops", "Operations", "Dispatch, drivers, tickets, customers"],
  ["verification", "Verification", "Driver documents & licences only"],
  ["support", "Support", "Tickets, bookings (view), enquiries"],
  ["finance", "Finance", "Payments, refunds, payouts, P&L"],
  ["super_admin", "Super Admin", "Everything except owner account"],
];
const label = (r: string) => (r === "owner" ? "Owner" : ROLES.find((x) => x[0] === r)?.[1] ?? r);

export default function Staff() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["staff"], queryFn: () => api<any[]>("/admin/staff") });
  const [sheet, setSheet] = useState<any>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("ops");
  const [busy, setBusy] = useState(false);
  const roles = ROLES.filter((r) => r[0] !== "super_admin" || user?.role === "owner");

  const open = (s?: any) => {
    setSheet(s ?? { new: true });
    setName(s?.name ?? "");
    setPhone(s ? s.phone.slice(3) : "");
    setRole(s?.role ?? "ops");
  };
  const save = async () => {
    setBusy(true);
    try {
      if (sheet.new) await api("/admin/staff", { body: { name, phone, role } });
      else await api(`/admin/staff/${sheet.id}`, { method: "PUT", body: { name, role } });
      toast(sheet.new ? "Staff added — they can log in with their number" : "Access updated");
      setSheet(null);
      q.refetch();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (s: any) => {
    try {
      await api(`/admin/staff/${s.id}`, { method: "PUT", body: { active: !!s.restricted } });
      toast(s.restricted ? "Access restored" : "Access paused");
      q.refetch();
    } catch (e: any) {
      toast(e.message, "err");
    }
  };
  const editable = (s: any) => s.id !== user?.id && s.role !== "owner" && (s.role !== "super_admin" || user?.role === "owner");

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title="Staff & access" subtitle="Each role sees only its own ERP areas" right={<Btn small title="Add" icon="person-add" onPress={() => open()} testID="add-staff-button" />} />
      {q.isLoading ? <Loader /> : q.error ? <ErrorView message={(q.error as any).message} /> : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: insets.bottom + space.xl }}
          ListEmptyComponent={<Empty icon="people-outline" title="No staff yet" />}
          renderItem={({ item: s }) => (
            <Card testID={`staff-${s.phone}`} style={{ padding: space.md, gap: 4, opacity: s.restricted ? 0.6 : 1 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Txt v="bodyBold">{s.name || s.phone}</Txt>
                  <Txt v="caption">{s.phone} · {label(s.role)}{s.restricted ? " · Paused" : ""}</Txt>
                </View>
                {editable(s) ? <Switch value={!s.restricted} onValueChange={() => toggle(s)} testID={`staff-active-${s.phone}`} /> : null}
              </Row>
              {editable(s) ? <Btn small variant="outline" title="Change role" style={{ alignSelf: "flex-start" }} onPress={() => open(s)} testID={`staff-edit-${s.phone}`} /> : null}
            </Card>
          )}
        />
      )}
      <Sheet visible={!!sheet} onClose={() => setSheet(null)} title={sheet?.new ? "Add staff member" : "Change access"} testID="staff-sheet">
        <View style={{ gap: space.md }}>
          <Field label="Name" value={name} onChangeText={setName} testID="staff-name-input" />
          {sheet?.new ? <Field label="Mobile number (they log in with this)" keyboardType="phone-pad" maxLength={10} value={phone} onChangeText={(t) => setPhone(t.replace(/\D/g, ""))} testID="staff-phone-input" /> : null}
          <View style={{ marginHorizontal: -space.lg }}>
            <ChipRow>
              {roles.map(([k, l]) => <Chip key={k} label={l} selected={role === k} onPress={() => setRole(k)} testID={`staff-role-${k}`} />)}
            </ChipRow>
          </View>
          <Txt v="caption">{ROLES.find((r) => r[0] === role)?.[2]}</Txt>
          <Btn title="Save" loading={busy} disabled={!name.trim() || (sheet?.new && phone.length !== 10)} onPress={save} testID="staff-save-button" />
        </View>
      </Sheet>
    </View>
  );
}
