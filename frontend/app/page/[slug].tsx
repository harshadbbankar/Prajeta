import { useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useConfig } from "@/src/hooks";
import { space, useTheme } from "@/src/theme";
import { Btn, Header, Row, Txt } from "@/src/ui";

const PAGES: Record<string, { title: string; body: string[] }> = {
  about: {
    title: "About us",
    body: [
      "Prajeta provides professional drivers for customers' own vehicles across India. We are not a taxi-booking or vehicle-rental business.",
      "We serve individuals, families, corporate clients, hotels, residential societies and event organisers with hourly, full-day, night, outstation, monthly and permanent driver services.",
      "Our mission is simple: make it easy to find a trusted, verified driver whenever you need one.",
    ],
  },
  contact: { title: "Contact us", body: ["We are happy to help with bookings, driver partnerships and corporate staffing."] },
  safety: {
    title: "Safety & verification",
    body: [
      "Every driver applies through our app with identity and driving licence documents. Uploading a document does not make a driver verified — our verification staff review each document manually.",
      "We record police/background verification status, licence expiry dates and set reminders before documents expire. Only approved drivers with valid mandatory documents can accept bookings.",
      "Each trip starts only after the customer shares a 4-digit trip OTP with the assigned driver. All trip events are timestamped.",
      "Customers can report incidents from the booking screen at any time; incidents are escalated to our operations team with high priority.",
    ],
  },
  faq: { title: "FAQs", body: [] },
  privacy: {
    title: "Privacy Policy",
    body: [
      "We collect only the information needed to provide our service: name, mobile number, booking addresses, and for drivers, identity and licence documents.",
      "Driver documents are stored in private storage and are visible only to the driver and authorised verification staff.",
      "Payments are processed by our payment partner. We never store card numbers or CVVs.",
      "You may request access, correction or deletion of your data by contacting support. (Full policy to be configured by the business.)",
    ],
  },
  terms: {
    title: "Terms & Conditions",
    body: [
      "Bookings are confirmed only after payment of the 20% advance. The balance is payable after the trip, online or in cash where enabled.",
      "Customers must provide a road-worthy, insured vehicle with valid registration and PUC. Fuel, tolls, parking and permits are borne by the customer.",
      "Fares are calculated from the active tariff at the time of booking and a fare snapshot is saved with your booking. (Full terms to be configured by the business.)",
    ],
  },
  cancellation: {
    title: "Cancellation & Refund Policy",
    body: [
      "Free cancellation up to 2 hours before the scheduled start time — your advance is refunded to the original payment method.",
      "Cancellations within 2 hours of start or customer no-shows may attract the cancellation fee shown in the tariff.",
      "Refunds are reviewed by our finance team and typically processed in 5–7 working days.",
    ],
  },
  "driver-terms": {
    title: "Driver Partner Terms",
    body: [
      "Driver partners must hold a valid driving licence and submit genuine identity documents. False information leads to rejection or suspension.",
      "Partners must follow trip OTP verification, maintain professional conduct and report incidents promptly.",
      "Earnings are calculated per booking from verified backend records and paid out as per the payout schedule.",
    ],
  },
};

export default function InfoPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const cfg = useConfig();
  const p = PAGES[slug ?? ""] ?? { title: "Page", body: ["Not found"] };
  const s = cfg.data?.settings ?? {};
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Header title={p.title} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: insets.bottom + space.xl }}>
        {p.body.map((b, i) => (
          <Txt key={i} v="body" testID={`page-paragraph-${i}`}>
            {b}
          </Txt>
        ))}
        {slug === "faq"
          ? (cfg.data?.faqs ?? []).map((f) => (
              <View key={f.q} style={{ gap: 4 }}>
                <Txt v="h3">{f.q}</Txt>
                <Txt v="body" color={colors.muted}>
                  {f.a}
                </Txt>
              </View>
            ))
          : null}
        {slug === "contact" ? (
          <View style={{ gap: space.md }}>
            <Txt v="bodyBold">{s.legal_name}</Txt>
            <Txt v="body">Phone: {s.support_phone}</Txt>
            <Txt v="body">Email: {s.support_email}</Txt>
            <Txt v="body">Hours: {s.business_hours}</Txt>
            <Row style={{ flexWrap: "wrap" }}>
              <Btn title="WhatsApp" icon="logo-whatsapp" variant="success" testID="contact-whatsapp-button" onPress={() => s.whatsapp_link && Linking.openURL(s.whatsapp_link)} />
              <Btn title="Send enquiry" variant="outline" testID="contact-enquiry-button" onPress={() => Linking.openURL(Linking.createURL("/enquiry?type=contact"))} />
            </Row>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
