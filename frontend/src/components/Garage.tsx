import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { api } from "@/src/api";
import { radius, space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, Field, Row, Txt, useToast } from "@/src/ui";

const BODY = ["Hatchback", "Sedan", "SUV", "MUV", "Luxury", "EV"];
const TRANS = ["Manual", "Automatic", "DCT", "EV"];

/** Customer garage: saved cars to pick when booking. */
export function Garage() {
  const { colors } = useTheme();
  const toast = useToast();
  const q = useQuery({ queryKey: ["garage"], queryFn: () => api<any>("/me/vehicles") });
  const items = q.data?.items ?? [];
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ reg_number: "", make: "", model: "", body_type: "Sedan", transmission: "Automatic", insurance_expiry: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      await api("/me/vehicles", { body: { ...f, insurance_expiry: f.insurance_expiry || null } });
      toast("Vehicle added to garage");
      setAdding(false);
      setF({ reg_number: "", make: "", model: "", body_type: "Sedan", transmission: "Automatic", insurance_expiry: "" });
      q.refetch();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    try {
      await api(`/me/vehicles/${id}`, { method: "DELETE" });
      q.refetch();
    } catch (e: any) {
      toast(e.message, "err");
    }
  };

  return (
    <Card testID="garage-card" style={{ gap: space.md }}>
      <Row>
        <Ionicons name="car-sport" size={20} color={colors.onSurface} />
        <Txt v="h3" style={{ flex: 1 }}>My garage</Txt>
        <Txt v="caption">{items.length}/10</Txt>
      </Row>
      {items.map((v: any, i: number) => (
        <Row key={v.id} testID={`garage-vehicle-${i}`} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt v="bodyBold">{v.make} {v.model}</Txt>
            <View style={{ alignSelf: "flex-start", borderWidth: 1.5, borderColor: colors.onSurface, borderRadius: 4, paddingHorizontal: 6 }}>
              <Txt v="label" color={colors.onSurface} style={{ letterSpacing: 1.5 }}>{v.reg_number}</Txt>
            </View>
            <Txt v="caption">{v.body_type} · {v.transmission}{v.insurance_expiry ? ` · insured till ${v.insurance_expiry}` : ""}</Txt>
          </View>
          <Pressable hitSlop={10} onPress={() => remove(v.id)} accessibilityLabel={`Remove ${v.reg_number}`} testID={`garage-remove-${i}`} style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </Pressable>
        </Row>
      ))}
      {adding ? (
        <View style={{ gap: space.sm }}>
          <Field label="Registration number" placeholder="MH01AB1234" autoCapitalize="characters" value={f.reg_number} onChangeText={(t) => set("reg_number", t)} testID="garage-reg-input" />
          <Row>
            <View style={{ flex: 1 }}><Field label="Make" placeholder="Mercedes" value={f.make} onChangeText={(t) => set("make", t)} testID="garage-make-input" /></View>
            <View style={{ flex: 1 }}><Field label="Model" placeholder="E350d" value={f.model} onChangeText={(t) => set("model", t)} testID="garage-model-input" /></View>
          </Row>
          <Row style={{ flexWrap: "wrap" }}>{BODY.map((b) => <Chip key={b} label={b} selected={f.body_type === b} onPress={() => set("body_type", b)} testID={`garage-body-${b}`} />)}</Row>
          <Row style={{ flexWrap: "wrap" }}>{TRANS.map((t) => <Chip key={t} icon="cog" label={t} selected={f.transmission === t} onPress={() => set("transmission", t)} testID={`garage-trans-${t}`} />)}</Row>
          <Field label="Insurance valid till (optional)" placeholder="YYYY-MM-DD" value={f.insurance_expiry} onChangeText={(t) => set("insurance_expiry", t)} testID="garage-insurance-input" />
          <Row>
            <Btn style={{ flex: 1 }} variant="outline" title="Cancel" onPress={() => setAdding(false)} testID="garage-cancel" />
            <Btn style={{ flex: 1 }} variant="dark" title="Save car" disabled={!f.reg_number.trim() || !f.make.trim() || !f.model.trim()} loading={busy} onPress={save} testID="garage-save" />
          </Row>
        </View>
      ) : q.isSuccess && items.length < 10 ? (
        <Btn variant="dark" icon="add" title="Add car details" onPress={() => setAdding(true)} testID="garage-add" />
      ) : null}
    </Card>
  );
}

/** Company GST details so invoices carry the customer's GSTIN (CGST/SGST or IGST split). */
export function GstBilling() {
  const { colors } = useTheme();
  const toast = useToast();
  const q = useQuery({ queryKey: ["billing"], queryFn: () => api<any>("/me/billing") });
  const [f, setF] = useState({ company_name: "", gstin: "", address: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const b = q.data?.billing;
    if (b) setF({ company_name: b.company_name, gstin: b.gstin, address: b.address });
  }, [q.data]);
  const save = async (clear = false) => {
    setBusy(true);
    try {
      await api("/me/billing", { method: "PUT", body: clear ? { gstin: "" } : f });
      if (clear) setF({ company_name: "", gstin: "", address: "" });
      toast(clear ? "GST details removed" : "GST details saved — used on your next bookings");
      q.refetch();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card testID="gst-billing-card" style={{ gap: space.sm }}>
      <Row>
        <Ionicons name="business" size={20} color={colors.onSurface} />
        <Txt v="h3" style={{ flex: 1 }}>GST invoice details</Txt>
        {q.data?.billing ? <Txt v="label" color={colors.successText}>Active</Txt> : null}
      </Row>
      <Txt v="caption">Add your company GSTIN to get a GST tax invoice (CGST + SGST or IGST) for input tax credit on new bookings.</Txt>
      <Field label="Company name" value={f.company_name} onChangeText={(t) => setF({ ...f, company_name: t })} testID="gst-company-input" />
      <Field label="GSTIN" placeholder="27AAPFU0939F1ZV" autoCapitalize="characters" maxLength={15} value={f.gstin} onChangeText={(t) => setF({ ...f, gstin: t.toUpperCase() })} testID="gst-gstin-input" />
      <Field label="Billing address" value={f.address} onChangeText={(t) => setF({ ...f, address: t })} testID="gst-address-input" />
      <Row>
        {q.data?.billing ? <Btn style={{ flex: 1 }} variant="outline" title="Remove" onPress={() => save(true)} testID="gst-remove" /> : null}
        <Btn style={{ flex: 1 }} variant="dark" title="Save GST details" disabled={f.gstin.length !== 15 || !f.company_name.trim()} loading={busy} onPress={() => save()} testID="gst-save" />
      </Row>
    </Card>
  );
}
