import { Ionicons } from "@react-native-vector-icons/ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { priceFrom, useConfig } from "@/src/hooks";
import { space, useTheme } from "@/src/theme";
import { Btn, Card, Header, KV, Loader, Row, Txt, money } from "@/src/ui";

const EXTRA: Record<string, { points: string[]; faqs: { q: string; a: string }[] }> = {
  hourly: { points: ["Minimum 2 hours", "Ideal for errands, shopping, meetings", "Extra time billed per hour"], faqs: [{ q: "Can I extend the booking?", a: "Yes, extra hours are billed at the hourly rate shown." }] },
  "full-day": { points: ["8 hours included", "Driver meal break as per policy", "Perfect for weddings, city tours, office days"], faqs: [{ q: "What if the day runs longer?", a: "Hours beyond 8 are billed at the extra-hour rate." }] },
  night: { points: ["Designed for 10 PM – 6 AM", "No additional night surcharge", "Safe drive home after events"], faqs: [{ q: "Is there a night charge?", a: "Night service rate already includes night duty." }] },
  "pickup-drop": { points: ["One-way or return", "Airport, railway station, hospital", "Up to 3 hours included"], faqs: [{ q: "How does the driver return?", a: "Driver return travel is included in the fare within city limits." }] },
  outstation: { points: ["Priced per day (12 hrs)", "Experienced highway drivers", "Driver stay & food as per policy"], faqs: [{ q: "Who pays tolls and state taxes?", a: "Tolls, permits and parking are paid by the customer." }] },
  monthly: { points: ["Dedicated driver 26 days/month", "Backup driver on leave days", "Fixed monthly invoice"], faqs: [{ q: "How is pricing decided?", a: "Based on hours/day, city and vehicle. Our team shares a quote within 24 hours." }] },
  permanent: { points: ["We source & verify candidates", "Trial period with replacement", "One-time placement fee"], faqs: [{ q: "Who employs the driver?", a: "After placement the driver works directly for you, with our replacement guarantee." }] },
  corporate: { points: ["Offices, hotels, societies, fleets", "Consolidated monthly invoices", "Dedicated account manager"], faqs: [{ q: "Do you offer contracts?", a: "Yes, we sign service contracts with SLAs for corporate clients." }] },
  "event-valet": { points: ["Uniformed, trained valets", "Weddings, events, hotels", "Priced per driver (4 hrs minimum)"], faqs: [{ q: "How many valets do I need?", a: "Typically one valet per 15–20 cars per hour. We help you plan." }] },
};

export default function ServicePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const cfg = useConfig();
  const s = cfg.data?.services.find((x) => x.id === id);
  const extra = EXTRA[id ?? ""] ?? { points: [], faqs: [] };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title={s?.name ?? "Service"} subtitle="Prajeta driver service" />
      {!s ? (
        <Loader />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}>
            <Card tone="dark" style={{ gap: space.sm }}>
              <Ionicons name={s.icon as any} size={28} color={colors.brandPrimary} />
              <Txt v="title" color={colors.onSurfaceInverse} testID="service-title">
                {s.name}
              </Txt>
              <Txt v="body" color={colors.surfaceTertiary}>
                {s.tagline}
              </Txt>
              <Txt v="num" color={colors.onSurfaceInverse} testID="service-price">
                {priceFrom(s)}
              </Txt>
            </Card>
            <View style={{ gap: space.sm }}>
              {extra.points.map((p) => (
                <Row key={p}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  <Txt v="body">{p}</Txt>
                </Row>
              ))}
            </View>
            {s.pricing_mode !== "quote" ? (
              <Card>
                <Txt v="h3" style={{ marginBottom: space.sm }}>
                  Tariff (before GST)
                </Txt>
                {s.pricing_mode === "daily" ? <KV k="Per day (12 hrs)" v={money(s.per_day)} /> : <KV k={`Base fare (${s.base_hours} hrs)`} v={money(s.base_fare)} />}
                <KV k="Additional hour" v={money(s.extra_hour_rate)} />
                {s.night_surcharge ? <KV k="Night surcharge (10 PM–6 AM)" v={money(s.night_surcharge)} /> : null}
                <KV k="Waiting (per hour)" v={money(s.waiting_per_hour)} />
                <KV k="Late cancellation fee" v={money(s.cancellation_fee)} />
                <Txt v="caption">City adjustments may apply. GST 18% extra. Fuel, tolls & parking paid by customer.</Txt>
              </Card>
            ) : null}
            <Card tone="grey">
              <Txt v="h3" style={{ marginBottom: space.sm }}>
                Service terms
              </Txt>
              {s.terms.map((t) => (
                <Txt key={t} v="body" style={{ marginBottom: 4 }}>
                  • {t}
                </Txt>
              ))}
            </Card>
            <View style={{ gap: space.md }}>
              <Txt v="h2">FAQs</Txt>
              {extra.faqs.map((f) => (
                <View key={f.q}>
                  <Txt v="bodyBold">{f.q}</Txt>
                  <Txt v="body" color={colors.muted}>
                    {f.a}
                  </Txt>
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={{ padding: space.lg, paddingBottom: insets.bottom + space.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
            <Btn
              title={s.pricing_mode === "quote" ? "Request a quote" : "Book this service"}
              icon="arrow-forward"
              testID="service-book-button"
              onPress={() => router.push(s.id === "corporate" ? "/enquiry?type=corporate" : (`/book/${s.id}` as any))}
            />
          </View>
        </>
      )}
    </View>
  );
}
