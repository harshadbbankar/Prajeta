import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, router } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { LocationShare } from "@/src/components/LocationShare";
import { AddPhone } from "@/src/components/AddPhone";
import { useAuth } from "@/src/auth";
import { fmtDate, fmtTime, usePolling } from "@/src/hooks";
import { usesNativeTabs } from "@/src/navigation";
import { radius, space, useTheme } from "@/src/theme";
import { Btn, Card, Empty, Loader, Row, StatusBadge, Txt, haptic, money, useToast } from "@/src/ui";

export default function DriverHome() {
  const { user, ready } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const profile = useQuery({ queryKey: ["driver-profile"], queryFn: () => api<any>("/driver/profile"), enabled: !!user });
  const offers = useQuery({ queryKey: ["driver-offers"], queryFn: () => api<any[]>("/driver/offers"), enabled: !!user });
  const jobs = useQuery({ queryKey: ["driver-jobs"], queryFn: () => api<any[]>("/driver/jobs"), enabled: !!user });
  const [busyId, setBusyId] = useState("");
  const [toggling, setToggling] = useState(false);
  const refetchAll = useCallback(() => {
    offers.refetch();
    jobs.refetch();
  }, [offers, jobs]);
  usePolling(refetchAll, 15000, profile.data?.status === "APPROVED");

  if (!ready) return <Loader />;
  if (!user) return <Redirect href="/login?role=driver" />;
  if (profile.isLoading) return <Loader />;
  const p = profile.data;
  const approved = p?.status === "APPROVED";
  const licLeft = p?.licence_expiry ? Math.round((new Date(p.licence_expiry + "T00:00:00").getTime() - Date.now()) / 86400000) : null;
  const expDocs = (p?.documents ?? [])
    .filter((x: any) => ["identity", "police_verification", "address_proof"].includes(x.doc_type) && x.expiry)
    .map((x: any) => ({ ...x, left: Math.round((new Date(x.expiry + "T00:00:00").getTime() - Date.now()) / 86400000) }))
    .filter((x: any) => x.left <= 30);
  const active = (jobs.data ?? []).filter((j) => ["ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"].includes(j.status));

  const toggle = async () => {
    setToggling(true);
    haptic("heavy");
    try {
      await api("/driver/online", { body: { online: !p.online } });
      await profile.refetch();
      offers.refetch();
      toast(!p.online ? "You're online — offers will appear here" : "You're offline");
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setToggling(false);
    }
  };
  const respond = async (id: string, action: "accept" | "decline") => {
    setBusyId(id + action);
    try {
      const r = await api<any>(`/driver/offers/${id}/${action}`, { body: {} });
      toast(action === "accept" ? "Job accepted!" : "Offer declined");
      refetchAll();
      if (action === "accept") router.push(`/trip/${r.id}` as any);
    } catch (e: any) {
      toast(e.message, "err");
      refetchAll();
    } finally {
      setBusyId("");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}>
      <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, paddingBottom: space.md, backgroundColor: colors.surfaceInverse }}>
        <Row style={{ justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Txt v="caption" color={colors.surfaceTertiary}>
              Prajeta Driver Partner
            </Txt>
            <Txt v="h2" color={colors.onSurfaceInverse} testID="driver-name">
              {p?.name || user.name || "Driver"}
            </Txt>
          </View>
          <Pressable testID="driver-notifications-button" onPress={() => router.push("/notifications")} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="notifications" size={20} color={colors.onSurfaceInverse} />
          </Pressable>
        </Row>
        {approved ? (
          <Pressable
            testID="driver-online-toggle"
            disabled={toggling}
            onPress={toggle}
            style={{ marginTop: space.md, height: 64, borderRadius: radius.lg, backgroundColor: p.online ? colors.success : colors.brandSecondary, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg }}
          >
            <View>
              <Txt v="h2" color={colors.onSuccess}>
                {p.online ? "You're online" : "You're offline"}
              </Txt>
              <Txt v="caption" color={colors.onSuccess}>
                {p.online ? "Receiving booking offers" : "Tap to start receiving jobs"}
              </Txt>
            </View>
            <View style={{ width: 56, height: 32, borderRadius: 16, backgroundColor: colors.surface, justifyContent: "center", padding: 3, alignItems: p.online ? "flex-end" : "flex-start" }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: p.online ? colors.success : colors.muted }} />
            </View>
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        refreshControl={<RefreshControl refreshing={offers.isRefetching} onRefresh={() => { profile.refetch(); refetchAll(); }} />}
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: (usesNativeTabs ? insets.bottom : 0) + space.xl }}
      >
        {approved && licLeft !== null && licLeft <= 30 ? (
          <Card testID="licence-warning-card" style={{ gap: space.sm, borderColor: licLeft < 0 ? colors.error : colors.warning, borderWidth: 1.5 }}>
            <Txt v="h3" color={licLeft < 0 ? colors.error : colors.onSurface}>
              {licLeft < 0 ? "Licence expired — jobs paused" : `Licence expires in ${licLeft} day(s)`}
            </Txt>
            <Txt v="caption">
              {p.documents?.some((x: any) => x.doc_type === "licence_renewal")
                ? "Renewed licence received — our team is verifying it."
                : licLeft < 0
                  ? "Upload your renewed licence. You can go online once our team verifies it."
                  : "Upload your renewed licence early so your jobs are not interrupted."}
            </Txt>
            <Btn small title="Upload renewed licence" icon="cloud-upload" onPress={() => router.push("/driver-onboarding")} testID="licence-renew-button" />
          </Card>
        ) : null}
        {approved && expDocs.length ? (
          <Card testID="docs-warning-card" style={{ gap: space.sm, borderColor: expDocs.some((x: any) => x.left < 0) ? colors.error : colors.warning, borderWidth: 1.5 }}>
            <Txt v="h3">{p.docs_expired?.length ? "Documents expired — jobs paused" : "Documents expiring soon"}</Txt>
            {expDocs.map((x: any) => (
              <Txt key={x.id} v="caption" style={{ color: colors.onSurface }}>
                • {({ identity: "Identity proof", police_verification: "Police verification", address_proof: "Address proof" } as Record<string, string>)[x.doc_type]}: {x.left < 0 ? `expired ${-x.left} day(s) ago` : `expires in ${x.left} day(s)`}
              </Txt>
            ))}
            <Btn small title="Upload valid documents" icon="cloud-upload" onPress={() => router.push("/driver-onboarding")} testID="docs-renew-button" />
          </Card>
        ) : null}
        {!approved ? (
          <Card testID="verification-status-card" style={{ gap: space.sm }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Txt v="h3">Verification</Txt>
              <StatusBadge status={p?.status ?? "DRAFT"} testID="driver-verification-status" />
            </Row>
            <Txt v="body" color={colors.muted}>
              {p?.status === "DRAFT"
                ? "Complete your profile and upload your licence and ID to apply."
                : p?.status === "REJECTED"
                  ? `Not approved: ${p.rejection_reason ?? ""}. Update and resubmit.`
                  : p?.status === "SUSPENDED"
                    ? `Account suspended: ${p.status_reason ?? ""}`
                    : "Our verification team is reviewing your documents. You'll be notified once approved."}
            </Txt>
            {["DRAFT", "REJECTED"].includes(p?.status) ? <Btn title={p?.status === "DRAFT" ? "Complete onboarding" : "Update application"} icon="arrow-forward" testID="start-onboarding-button" onPress={() => router.push("/driver-onboarding")} /> : <Btn variant="outline" title="View application" testID="view-application-button" onPress={() => router.push("/driver-onboarding")} />}
          </Card>
        ) : null}

        {approved && p.online && !active.length ? <LocationShare presence /> : null}
        <AddPhone />
        {approved && p.badge ? (
          <Card testID="driver-badge-card" style={{ gap: 4, borderColor: colors.warning, borderWidth: 1.5 }}>
            <Row>
              <Ionicons name={p.badge === "gold" ? "trophy" : "ribbon"} size={20} color={colors.warning} />
              <Txt v="h3">{p.badge === "gold" ? "Gold Star Driver" : "Top Rated"}</Txt>
            </Row>
            <Txt v="caption">Thanks for great service! You see new booking offers before other drivers and earn a bonus on every completed trip.</Txt>
          </Card>
        ) : null}
        {active.map((j) => (
          <Card key={j.id} tone="dark" testID={`active-job-${j.ref}`} onPress={() => router.push(`/trip/${j.id}` as any)} style={{ gap: space.sm }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Txt v="label" color={colors.surfaceTertiary}>
                Active job
              </Txt>
              <StatusBadge status={j.status} />
            </Row>
            <Txt v="h2" color={colors.onSurfaceInverse}>
              {j.service_name}
            </Txt>
            <Txt v="body" color={colors.surfaceTertiary}>
              {fmtDate(j.date)} · {fmtTime(j.time)} · {j.pickup_area}
            </Txt>
            <Txt v="bodyBold" color={colors.brandPrimary}>
              Open trip →
            </Txt>
          </Card>
        ))}

        {approved ? (
          <View style={{ gap: space.md }}>
            <Txt v="h2">Booking offers</Txt>
            {offers.isLoading ? (
              <Loader />
            ) : !(offers.data ?? []).length ? (
              <Empty icon="car-outline" title={p.online ? "No offers right now" : "You're offline"} body={p.online ? "New offers in your city will appear here." : "Go online to receive jobs."} />
            ) : (
              offers.data!.map((o) => {
                const mins = Math.max(0, Math.round((new Date(o.expires_at).getTime() - Date.now()) / 60000));
                return (
                  <Card key={o.id} testID={`offer-${o.booking.ref}`} style={{ gap: space.sm, borderColor: colors.brandPrimary, borderWidth: 1.5 }}>
                    {o.priority ? (
                      <View testID={`offer-priority-${o.booking.ref}`}>
                      <Row gap={4}>
                        <Ionicons name="flash" size={14} color={colors.warning} />
                        <Txt v="label" color={colors.warning}>Priority offer · top-rated drivers see this first</Txt>
                      </Row>
                      </View>
                    ) : null}
                    <Row style={{ justifyContent: "space-between" }}>
                      <Txt v="h3">{o.booking.service_name}</Txt>
                      <Txt v="caption" color={colors.brandPrimary}>
                        Expires in {mins} min
                      </Txt>
                    </Row>
                    <Txt v="body">
                      {fmtDate(o.booking.date)} · {fmtTime(o.booking.time)} · {o.booking.service_id === "outstation" ? `${o.booking.days} day(s)` : o.booking.hours ? `${o.booking.hours} hrs` : "Duration as per quote"}
                    </Txt>
                    <Txt v="caption">
                      Pickup area: {o.booking.pickup_area || o.booking.city_id} {o.booking.destination ? `→ ${o.booking.destination}` : ""} · {o.booking.vehicle_type} {o.booking.transmission}
                    </Txt>
                    {o.distance_km != null ? (
                      <Row gap={4}>
                        <Ionicons name="navigate" size={14} color={colors.success} />
                        <Txt v="label" color={colors.success} testID={`offer-distance-${o.booking.ref}`}>
                          {o.distance_km} km from you{o.rank && o.rank <= 3 ? " · you're among the nearest" : ""}
                        </Txt>
                      </Row>
                    ) : null}
                    {o.booking.notes ? <Txt v="caption">Note: {o.booking.notes}</Txt> : null}
                    <Row style={{ justifyContent: "space-between" }}>
                      <Txt v="label">Your payout</Txt>
                      <Txt v="num" testID={`offer-payout-${o.booking.ref}`}>
                        {money(o.payout)}
                      </Txt>
                    </Row>
                    <Row>
                      <Btn style={{ flex: 1 }} variant="outline" title="Decline" loading={busyId === o.id + "decline"} onPress={() => respond(o.id, "decline")} testID={`decline-offer-${o.booking.ref}`} />
                      <Btn style={{ flex: 1 }} title="Accept" loading={busyId === o.id + "accept"} onPress={() => respond(o.id, "accept")} testID={`accept-offer-${o.booking.ref}`} />
                    </Row>
                  </Card>
                );
              })
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
