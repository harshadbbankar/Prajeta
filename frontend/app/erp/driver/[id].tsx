import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, authedUrl } from "@/src/api";
import { fmtDate } from "@/src/hooks";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, Field, Header, KV, Loader, Row, Sheet, Stat, StatusBadge, Txt, money, useToast } from "@/src/ui";

export default function AdminDriver() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const q = useQuery({ queryKey: ["admin-driver", id], queryFn: () => api<any>(`/admin/drivers/${id}`) });
  const [sheet, setSheet] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const d = q.data;
  if (!d) return <Loader />;
  const call = async (path: string, body: any, msg: string, key: string) => {
    setBusy(key);
    try {
      await api(`/admin/drivers/${id}/${path}`, { body });
      toast(msg);
      setSheet("");
      setReason("");
      q.refetch();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy("");
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <Header title={d.name || d.phone} subtitle={`${d.phone} · ${d.city_id || "—"}`} right={<StatusBadge status={d.status} testID="admin-driver-status" />} />
      <ScrollView refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />} contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xl }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
          <Stat label="Rating" value={`★ ${d.rating ?? "—"}`} />
          <Stat label="Jobs" value={String(d.jobs.length)} />
          <Stat label="Earned" value={money(d.earned)} />
          <Stat label="Paid out" value={money(d.paid)} />
          <Stat label="Accepted / declined" value={`${d.offer_stats.ACCEPTED ?? 0} / ${d.offer_stats.DECLINED ?? 0}`} />
          <Stat label="Complaints" value={String(d.complaints)} />
        </View>
        <Card style={{ gap: 2 }}>
          <Txt v="h3" style={{ marginBottom: space.sm }}>Profile</Txt>
          <KV k="Address" v={d.address || "—"} />
          <KV k="Areas" v={(d.areas ?? []).join(", ") || "—"} />
          <KV k="Experience" v={`${d.experience_years ?? 0} yrs`} />
          <KV k="Licence" v={d.licence_number || "—"} />
          <KV k="Licence expiry" v={d.licence_expiry || "—"} />
          <KV k="Vehicles" v={[...(d.vehicle_types ?? []), ...(d.transmissions ?? [])].join(", ") || "—"} />
          <KV k="Availability" v={d.availability || "—"} />
          <KV k="Online" v={d.online ? "Yes" : "No"} />
          <KV k="Consent" v={d.consent ? "Given" : "Missing"} />
          {d.status_reason ? <KV k="Last reason" v={d.status_reason} /> : null}
        </Card>
        <Card style={{ gap: space.md }}>
          <Txt v="h3">Documents</Txt>
          {d.documents.length ? d.documents.map((doc: any) => (
            <View key={doc.id} testID={`admin-doc-${doc.doc_type}`} style={{ gap: 6, paddingBottom: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt v="bodyBold">{doc.doc_type.replace("_", " ")}</Txt>
                <StatusBadge status={doc.verified ? "APPROVED" : "UNDER_REVIEW"} />
              </Row>
              <Txt v="caption">{doc.name} {doc.number ? `· ${doc.number}` : ""} {doc.expiry ? `· exp ${doc.expiry}` : ""}</Txt>
              <Row>
                {doc.has_file ? <Btn small variant="outline" title="View" icon="eye" testID={`admin-view-doc-${doc.doc_type}`} onPress={async () => WebBrowser.openBrowserAsync(await authedUrl(`/files/${doc.id}`))} /> : null}
                <Btn small variant={doc.verified ? "outline" : "success"} title={doc.verified ? "Mark unverified" : "Verify"} loading={busy === doc.id} testID={`admin-verify-doc-${doc.doc_type}`} onPress={() => call(`documents/${doc.id}`, { verified: !doc.verified }, "Document updated", doc.id)} />
              </Row>
            </View>
          )) : <Txt v="caption">No documents uploaded</Txt>}
          <Txt v="label">Police verification: {d.police_verification ?? "NOT_STARTED"}</Txt>
          <Row style={{ flexWrap: "wrap" }}>
            {["PENDING", "CLEARED", "FAILED"].map((s) => (
              <Chip key={s} label={s} selected={d.police_verification === s} testID={`admin-police-${s}`} onPress={() => d.documents[0] && call(`documents/${d.documents[0].id}`, { verified: d.documents[0].verified, police_verification: s }, "Police status updated", "police")} />
            ))}
          </Row>
        </Card>
        <Row style={{ flexWrap: "wrap" }}>
          {d.status !== "APPROVED" ? <Btn title={d.status === "SUSPENDED" ? "Reactivate" : "Approve"} icon="checkmark" variant="success" loading={busy === "APPROVED"} onPress={() => call("status", { status: "APPROVED" }, "Driver approved", "APPROVED")} testID="admin-approve-driver-button" /> : null}
          {d.status !== "REJECTED" && d.status !== "APPROVED" ? <Btn variant="outline" title="Reject" onPress={() => setSheet("REJECTED")} testID="admin-reject-driver-button" /> : null}
          {d.status === "APPROVED" ? <Btn variant="outline" title="Suspend" onPress={() => setSheet("SUSPENDED")} testID="admin-suspend-driver-button" /> : null}
        </Row>
        <Card style={{ gap: space.sm }}>
          <Txt v="h3">Assignment history</Txt>
          {d.jobs.length ? d.jobs.map((j: any) => <KV key={j.id} k={`${j.ref} · ${j.service_name} · ${fmtDate(j.date)}`} v={<StatusBadge status={j.status} />} />) : <Txt v="caption">No jobs yet</Txt>}
        </Card>
        {d.reviews.length ? (
          <Card style={{ gap: space.sm }}>
            <Txt v="h3">Reviews</Txt>
            {d.reviews.map((r: any) => <Txt key={r.id} v="caption" style={{ color: colors.onSurface }}>{"★".repeat(r.rating)} {r.comment}</Txt>)}
          </Card>
        ) : null}
      </ScrollView>
      <Sheet visible={!!sheet} onClose={() => setSheet("")} title={sheet === "REJECTED" ? "Reject application" : "Suspend driver"} testID="admin-driver-reason-sheet">
        <View style={{ gap: space.md }}>
          <Field placeholder="Reason (shared with driver, audited)" value={reason} onChangeText={setReason} testID="admin-driver-reason-input" />
          <Btn title="Confirm" loading={busy === sheet} disabled={!reason.trim()} onPress={() => call("status", { status: sheet, reason }, "Status updated", sheet)} testID="admin-driver-reason-submit" />
        </View>
      </Sheet>
    </View>
  );
}
