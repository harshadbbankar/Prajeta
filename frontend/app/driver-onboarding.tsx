import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BACKEND_URL, api, getToken } from "@/src/api";
import { useConfig } from "@/src/hooks";
import { space, radius, useTheme } from "@/src/theme";
import { Btn, Card, Chip, ChipRow, Field, Header, Loader, Row, StatusBadge, Txt, useToast } from "@/src/ui";
import { uploadForm } from "@/src/utils/upload";

const DOCS = [
  { type: "licence", label: "Driving licence", required: true },
  { type: "identity", label: "Identity proof (Aadhaar / PAN / Passport)", required: true },
  { type: "address_proof", label: "Address proof", required: false },
  { type: "police_verification", label: "Police verification certificate", required: false },
];

export default function Onboarding() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const cfg = useConfig();
  const q = useQuery({ queryKey: ["driver-profile"], queryFn: () => api<any>("/driver/profile") });
  const [f, setF] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [renewExpiry, setRenewExpiry] = useState("");
  const [docExpiry, setDocExpiry] = useState<Record<string, string>>({});
  useEffect(() => {
    if (q.data && !f) setF(q.data);
  }, [q.data, f]);
  if (!f) return <Loader />;
  const locked = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "SUSPENDED"].includes(f.status);
  const set = (k: string) => (v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const toggle = (k: string, v: string) => set(k)(f[k]?.includes(v) ? f[k].filter((x: string) => x !== v) : [...(f[k] ?? []), v]);
  const city = cfg.data?.cities.find((c) => c.id === f.city_id);

  const save = async (silent = false) => {
    setBusy("save");
    try {
      const body: any = {
        name: f.name, address: f.address, city_id: f.city_id, areas: f.areas, experience_years: Number(f.experience_years) || 0,
        vehicle_types: f.vehicle_types, transmissions: f.transmissions, services: f.services, availability: f.availability,
        payout_upi: f.payout_upi, consent: f.consent,
      };
      if (!locked) {
        body.licence_number = f.licence_number;
        body.licence_expiry = f.licence_expiry;
      }
      const r = await api("/driver/profile", { method: "PUT", body });
      setF(r);
      if (!silent) toast("Draft saved");
      return true;
    } catch (e: any) {
      toast(e.message, "err");
      return false;
    } finally {
      setBusy("");
    }
  };
  const upload = async (docType: string) => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["image/*", "application/pdf"], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if ((a.size ?? 0) > 8 * 1024 * 1024) return toast("File too large (max 8 MB)", "err");
    setBusy(docType);
    try {
      const token = await getToken();
      const r = await uploadForm(`${BACKEND_URL}/api/driver/documents`, {
        headers: { Authorization: `Bearer ${token}` },
        fields: { doc_type: docType, number: docType === "licence" ? f.licence_number ?? "" : "", expiry: docType === "licence" ? f.licence_expiry ?? "" : docType === "licence_renewal" ? renewExpiry : docExpiry[docType] ?? "" },
        files: { file: { uri: a.uri, name: a.name, mimeType: a.mimeType } },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail ?? "Upload failed");
      setF((p: any) => ({ ...p, documents: [...p.documents.filter((d: any) => d.doc_type !== docType), { ...data, has_file: true }] }));
      toast("Document uploaded — pending verification");
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy("");
    }
  };
  const submit = async () => {
    if (!(await save(true))) return;
    setBusy("submit");
    try {
      await api("/driver/submit", { body: {} });
      toast("Application submitted for verification");
      q.refetch();
      router.back();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy("");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title="Driver onboarding" subtitle="Your details are kept private" right={<StatusBadge status={f.status} testID="onboarding-status" />} />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xl }}>
        <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
          {f.status === "REJECTED" ? (
            <Card tone="grey"><Txt v="bodyBold" color={colors.error}>Rejected: {f.rejection_reason}</Txt></Card>
          ) : null}
          <Txt v="h2">1. Personal details</Txt>
          <Field label="Full name (as on licence)" value={f.name} onChangeText={set("name")} testID="onb-name-input" />
          <Field label="Address" value={f.address} onChangeText={set("address")} testID="onb-address-input" />
        </View>
        <View>
          <Txt v="label" style={{ paddingHorizontal: space.lg }}>City</Txt>
          <ChipRow>
            {(cfg.data?.cities ?? []).map((c) => (
              <Chip key={c.id} label={c.name} selected={f.city_id === c.id} onPress={() => set("city_id")(c.id)} testID={`onb-city-${c.id}`} />
            ))}
          </ChipRow>
          {city ? (
            <>
              <Txt v="label" style={{ paddingHorizontal: space.lg }}>Preferred areas</Txt>
              <ChipRow>
                {city.areas.map((a) => (
                  <Chip key={a} label={a} selected={f.areas?.includes(a)} onPress={() => toggle("areas", a)} testID={`onb-area-${a}`} />
                ))}
              </ChipRow>
            </>
          ) : null}
        </View>
        <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
          <Txt v="h2">2. Driving & licence</Txt>
          <Field label="Driving experience (years)" keyboardType="number-pad" value={String(f.experience_years ?? "")} onChangeText={set("experience_years")} testID="onb-experience-input" />
          <Field label="Licence number" autoCapitalize="characters" editable={!locked} value={f.licence_number} onChangeText={set("licence_number")} testID="onb-licence-input" />
          <Field label="Licence expiry (YYYY-MM-DD)" editable={!locked} placeholder="2030-12-31" value={f.licence_expiry} onChangeText={set("licence_expiry")} testID="onb-licence-expiry-input" />
        </View>
        <View>
          <Txt v="label" style={{ paddingHorizontal: space.lg }}>Vehicles you can drive</Txt>
          <ChipRow>
            {["Hatchback", "Sedan", "SUV", "Luxury", "MUV", "Manual", "Automatic"].map((v) => {
              const key = ["Manual", "Automatic"].includes(v) ? "transmissions" : "vehicle_types";
              return <Chip key={v} label={v} selected={f[key]?.includes(v)} onPress={() => toggle(key, v)} testID={`onb-vehicle-${v}`} />;
            })}
          </ChipRow>
          <Txt v="label" style={{ paddingHorizontal: space.lg }}>Services (leave empty for all)</Txt>
          <ChipRow>
            {(cfg.data?.services ?? []).map((s) => (
              <Chip key={s.id} label={s.name} selected={f.services?.includes(s.id)} onPress={() => toggle("services", s.id)} testID={`onb-service-${s.id}`} />
            ))}
          </ChipRow>
          <Txt v="label" style={{ paddingHorizontal: space.lg }}>Availability</Txt>
          <ChipRow>
            {["Full time", "Part time", "Weekends", "Nights"].map((a) => (
              <Chip key={a} label={a} selected={f.availability === a} onPress={() => set("availability")(a)} testID={`onb-availability-${a}`} />
            ))}
          </ChipRow>
        </View>
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          {f.status === "APPROVED" || f.licence_expired ? <RenewalCard f={f} renewExpiry={renewExpiry} setRenewExpiry={setRenewExpiry} busy={busy === "licence_renewal"} onUpload={() => upload("licence_renewal")} /> : null}
          <Txt v="h2">3. Documents</Txt>
          <Txt v="caption">JPG, PNG or PDF up to 8 MB. Stored privately. Uploading does not mean verified — our team reviews each document.</Txt>
          {DOCS.map((d) => {
            const doc = f.documents?.find((x: any) => x.doc_type === d.type);
            return (
              <Card key={d.type} testID={`onb-doc-${d.type}`} style={{ gap: space.sm }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Txt v="bodyBold" style={{ flex: 1 }}>{d.label}{d.required ? " *" : ""}</Txt>
                  {doc ? <StatusBadge status={doc.verified ? "APPROVED" : "UNDER_REVIEW"} /> : null}
                </Row>
                {doc ? <Txt v="caption">{doc.name}{doc.expiry ? ` · valid till ${doc.expiry}` : ""}</Txt> : null}
                {d.type !== "licence" ? (
                  <Field placeholder="Valid till (YYYY-MM-DD, if printed)" value={docExpiry[d.type] ?? ""} onChangeText={(t) => setDocExpiry({ ...docExpiry, [d.type]: t })} testID={`onb-expiry-${d.type}`} />
                ) : null}
                {!locked || !doc?.verified || (d.type !== "licence" && (daysUntil(doc?.expiry) ?? 999) <= 30) ? (
                  <Btn small variant="outline" icon="cloud-upload" title={doc ? "Replace file" : "Upload file"} loading={busy === d.type} onPress={() => upload(d.type)} testID={`onb-upload-${d.type}`} />
                ) : null}
              </Card>
            );
          })}
          <Card tone="grey" style={{ gap: 4 }}>
            <Txt v="bodyBold">Police / background verification</Txt>
            <StatusBadge status={f.police_verification ?? "NOT_STARTED"} testID="onb-police-status" />
          </Card>
          <Txt v="h2">4. Payout details</Txt>
          <Field label="UPI ID for payouts" autoCapitalize="none" placeholder="name@bank" value={f.payout_upi} onChangeText={set("payout_upi")} testID="onb-upi-input" />
          <Pressable testID="onb-consent-checkbox" onPress={() => set("consent")(!f.consent)} style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start", padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary }}>
            <Ionicons name={f.consent ? "checkbox" : "square-outline"} size={22} color={f.consent ? colors.brandPrimary : colors.muted} />
            <Txt v="body" style={{ flex: 1 }}>
              I declare the information and documents are genuine, consent to background verification, and accept the Driver Partner Terms and Privacy Policy.
            </Txt>
          </Pressable>
          <Btn variant="outline" title="Save draft" loading={busy === "save"} onPress={() => save()} testID="onb-save-draft-button" />
          {["DRAFT", "REJECTED"].includes(f.status) ? <Btn title="Submit for verification" loading={busy === "submit"} onPress={submit} testID="onb-submit-button" /> : null}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}


export const daysUntil = (iso?: string) => (iso ? Math.round((new Date(iso + "T00:00:00").getTime() - Date.now()) / 86400000) : null);

function RenewalCard({ f, renewExpiry, setRenewExpiry, busy, onUpload }: { f: any; renewExpiry: string; setRenewExpiry: (v: string) => void; busy: boolean; onUpload: () => void }) {
  const { colors } = useTheme();
  const left = daysUntil(f.licence_expiry) ?? 999;
  const renewal = f.documents?.find((x: any) => x.doc_type === "licence_renewal");
  if (left > 30 && !renewal) return null;
  return (
    <Card testID="licence-renewal-card" style={{ gap: space.sm, borderColor: left < 0 ? colors.error : colors.warning, borderWidth: 1.5 }}>
      <Txt v="h3">{left < 0 ? "Licence expired — upload renewal" : `Licence expires in ${left} day(s)`}</Txt>
      {renewal ? (
        <>
          <Txt v="caption" color={colors.success}>Renewed licence uploaded (exp {renewal.expiry}). Waiting for verification.</Txt>
          <Field label="Correct expiry (YYYY-MM-DD) to re-upload" placeholder="2045-12-31" value={renewExpiry} onChangeText={setRenewExpiry} testID="renewal-expiry-input" />
          <Btn small variant="outline" icon="refresh" title="Replace upload" disabled={!/^\d{4}-\d{2}-\d{2}$/.test(renewExpiry)} loading={busy} onPress={onUpload} testID="renewal-replace-button" />
        </>
      ) : (
        <>
          <Field label="New licence expiry (YYYY-MM-DD)" placeholder="2045-12-31" value={renewExpiry} onChangeText={setRenewExpiry} testID="renewal-expiry-input" />
          <Btn small icon="cloud-upload" title="Upload renewed licence" disabled={!/^\d{4}-\d{2}-\d{2}$/.test(renewExpiry)} loading={busy} onPress={onUpload} testID="renewal-upload-button" />
        </>
      )}
    </Card>
  );
}
