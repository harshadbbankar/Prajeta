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
import { fmtDate, fmtTime, useConfig, usePolling } from "@/src/hooks";
import { usesNativeTabs } from "@/src/navigation";
import { SosQuick } from "@/src/components/SosQuick";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { Btn, Card, Divider, Empty, IconBtn, IconTile, Loader, Plate, Row, RouteLine, SectionHead, StatusBadge, Tag, TopBar, Txt, haptic, money, useToast } from "@/src/ui";

export default function DriverHome() {
  const { user, ready } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const profile = useQuery({ queryKey: ["driver-profile"], queryFn: () => api<any>("/driver/profile"), enabled: !!user });
  const offers = useQuery({ queryKey: ["driver-offers"], queryFn: () => api<any[]>("/driver/offers"), enabled: !!user });
  const cfg = useConfig();
  const earn = useQuery({ queryKey: ["driver-earnings"], queryFn: () => api<any>("/driver/earnings"), enabled: !!user });
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

  const cityName = cfg.data?.cities.find((c) => c.id === p?.city_id)?.name ?? "Your city";
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <TopBar
        title={cityName}
        eyebrow="Prajeta driver partner"
        right={
          <>
            <SosQuick role="driver" />
            <IconBtn icon="notifications-outline" onPress={() => router.push("/notifications")} testID="driver-notifications-button" />
          </>
        }
      />
      <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md }}>
        <Row gap={space.md}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintBorder, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="person" size={24} color={colors.onSurface} />
            {approved ? (
              <View style={{ position: "absolute", right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surface }}>
                <Ionicons name="checkmark" size={10} color={colors.onSuccess} />
              </View>
            ) : null}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt v="h3" style={{ fontFamily: fonts.bold, fontSize: 18 }} testID="driver-name" numberOfLines={1}>
              {p?.name || user.name || "Driver"}
            </Txt>
            <Txt v="caption" numberOfLines={1}>
              ☆ {p?.rating ?? "New"} · {p?.review_count ?? 0} reviews · {p?.experience_years ?? 0} yrs exp
            </Txt>
            {approved ? <Tag tone="success" label={p.badge === "gold" ? "Gold Star Chauffeur" : p.badge ? "Top Rated Chauffeur" : "Verified Chauffeur"} /> : <StatusBadge status={p?.status ?? "DRAFT"} />}
          </View>
          {approved ? (
            <View style={{ alignItems: "flex-end" }}>
              <Txt v="label">Today</Txt>
              <Txt v="numLg" testID="driver-today-earnings">{money(earn.data?.periods?.today ?? 0)}</Txt>
              <Txt v="caption" color={colors.successText}>{active.length ? `${active.length} active trip${active.length > 1 ? "s" : ""}` : "earned"}</Txt>
            </View>
          ) : null}
        </Row>
        {approved ? (
          <Pressable
            testID="driver-online-toggle"
            disabled={toggling}
            onPress={toggle}
            style={{ minHeight: 56, borderRadius: radius.lg, borderWidth: 1, borderColor: p.online ? colors.successBorder : colors.borderStrong, backgroundColor: p.online ? colors.successSoft : colors.surfaceSecondary, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg }}
          >
            <Row gap={space.sm}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.online ? colors.success : colors.muted }} />
              <View>
                <Txt v="h3" style={{ fontFamily: fonts.bold }} color={p.online ? colors.successText : colors.onSurface}>
                  {p.online ? "You're online · ON DUTY" : "You're offline"}
                </Txt>
                <Txt v="caption">{p.online ? "Receiving booking offers" : "Tap to start receiving jobs"}</Txt>
              </View>
            </Row>
            <View style={{ width: 52, height: 30, borderRadius: 15, backgroundColor: p.online ? colors.success : colors.borderStrong, justifyContent: "center", padding: 3, alignItems: p.online ? "flex-end" : "flex-start" }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surface }} />
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
            <SectionHead title="Booking offers" sub={p.online ? "Nearest verified drivers see new jobs first" : "Go on duty to receive jobs"} />
            {offers.isLoading ? (
              <Loader />
            ) : !(offers.data ?? []).length ? (
              <Empty icon="car-outline" title={p.online ? "No offers right now" : "You're offline"} body={p.online ? "New offers in your city will appear here." : "Go online to receive jobs."} />
            ) : (
              offers.data!.map((o) => {
                const mins = Math.max(0, Math.round((new Date(o.expires_at).getTime() - Date.now()) / 60000));
                const b = o.booking;
                return (
                  <View key={o.id} style={{ gap: space.md }}>
                    <Row gap={space.md} style={{ backgroundColor: colors.surfaceInverse, borderRadius: radius.lg, padding: space.lg }}>
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="flash" size={20} color={colors.onBrandPrimary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Txt v="h3" style={{ fontFamily: fonts.bold }} color={colors.onSurfaceInverse}>NEW JOB DISPATCH MATCH</Txt>
                        <Txt v="caption" color={colors.surfaceTertiary}>{o.priority ? "Priority offer · top-rated drivers see this first" : "Customer vehicle assigned nearby"}</Txt>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Txt v="caption" color={colors.surfaceTertiary}>Offer window</Txt>
                        <Txt v="num" color={colors.onSurfaceInverse}>{mins} min</Txt>
                      </View>
                    </Row>
                    <Card testID={`offer-${b.ref}`} style={{ gap: space.md }}>
                      {o.priority ? (
                        <View testID={`offer-priority-${b.ref}`}>
                          <Tag tone="warn" icon="flash" label="Priority offer" />
                        </View>
                      ) : null}
                      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                        <View style={{ flex: 1, gap: 6 }}>
                          <Tag tone="dark" icon="time-outline" label={`${b.service_name} (${b.service_id === "outstation" ? `${b.days} day(s)` : b.hours ? `${b.hours} hrs` : "as per quote"})`} />
                          <Tag tone="success" label="Verified client vehicle" />
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Txt v="caption">Estimated net payout</Txt>
                          <Txt v="display" testID={`offer-payout-${b.ref}`}>{money(o.payout)}</Txt>
                        </View>
                      </Row>
                      <Divider />
                      <View style={{ backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.tintBorder, borderRadius: radius.lg, padding: space.md, gap: space.sm }}>
                        <Row style={{ justifyContent: "space-between" }}>
                          <Row gap={6}>
                            <Ionicons name="car-outline" size={16} color={colors.onSurface} />
                            <Txt v="label" color={colors.onSurface}>Customer vehicle specs</Txt>
                          </Row>
                          {b.vehicle?.reg_number ? <Plate reg={b.vehicle.reg_number} /> : null}
                        </Row>
                        <Row gap={space.md}>
                          <IconTile icon="car-sport-outline" tone="plain" size={44} />
                          <View style={{ flex: 1 }}>
                            <Txt v="h3" style={{ fontFamily: fonts.bold }}>{b.vehicle ? `${b.vehicle.make} ${b.vehicle.model}` : b.vehicle_type}</Txt>
                            <Txt v="caption">{b.transmission} transmission · {b.vehicle_type}</Txt>
                          </View>
                        </Row>
                      </View>
                      <RouteLine
                        stops={[
                          {
                            label: `Pickup location${o.distance_km != null ? ` (${o.distance_km} km away)` : ""}`,
                            title: b.pickup_area || b.city_id,
                            sub: `${fmtDate(b.date)} · ${fmtTime(b.time)}`,
                            right: o.distance_km != null ? (
                              <View testID={`offer-distance-${b.ref}`}>
                                <Tag tone="success" label={o.rank && o.rank <= 3 ? "Among nearest" : `${o.distance_km} km`} />
                              </View>
                            ) : undefined,
                          },
                          ...(b.destination ? [{ label: "Drop / route", title: b.destination }] : []),
                        ]}
                      />
                      {b.notes ? (
                        <Row gap={space.sm} style={{ alignItems: "flex-start", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md }}>
                          <Ionicons name="information-circle-outline" size={18} color={colors.onSurface} />
                          <Txt v="body" style={{ flex: 1 }}>
                            <Txt v="bodyBold">Special instructions: </Txt>
                            {b.notes}
                          </Txt>
                        </Row>
                      ) : null}
                      <Row>
                        <Btn style={{ flex: 1 }} variant="outline" icon="close" title="Decline" loading={busyId === o.id + "decline"} onPress={() => respond(o.id, "decline")} testID={`decline-offer-${b.ref}`} />
                        <Btn style={{ flex: 1.4 }} variant="dark" icon="checkmark-circle-outline" title="Accept Trip" loading={busyId === o.id + "accept"} onPress={() => respond(o.id, "accept")} testID={`accept-offer-${b.ref}`} />
                      </Row>
                    </Card>
                  </View>
                );
              })
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
