import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { api } from "@/src/api";
import { radius, space, useTheme } from "@/src/theme";
import { Btn, Card, Chip, Field, Row, Txt, useToast } from "@/src/ui";

export type Contact = { name: string; phone: string; relation: string };
const RELATIONS = ["Parent", "Spouse", "Sibling", "Child", "Friend"];

export const useContacts = (enabled = true) =>
  useQuery({ queryKey: ["trusted-contacts"], queryFn: () => api<{ contacts: Contact[] }>("/me/contacts"), enabled });

/** Customer profile: up to 5 family/friends who get trip links and SOS alerts via WhatsApp. */
export function TrustedContacts() {
  const { colors } = useTheme();
  const toast = useToast();
  const q = useContacts();
  const list = q.data?.contacts ?? [];
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (contacts: Contact[], msg: string) => {
    setBusy(true);
    try {
      await api("/me/contacts", { method: "PUT", body: { contacts } });
      await q.refetch();
      toast(msg);
      return true;
    } catch (e: any) {
      toast(e.message, "err");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const add = async () => {
    if (await save([...list, { name, phone, relation }], `${name} added`)) {
      setAdding(false);
      setName("");
      setPhone("");
      setRelation("");
    }
  };

  return (
    <Card testID="trusted-contacts-card" style={{ gap: space.md }}>
      <Row>
        <Ionicons name="people" size={20} color={colors.success} />
        <Txt v="h3" style={{ flex: 1 }}>Trusted contacts</Txt>
        <Txt v="caption">{list.length}/5</Txt>
      </Row>
      <Txt v="caption">Send them your live trip link or an SOS alert on WhatsApp in one tap.</Txt>
      {q.isLoading ? <Txt v="caption">Loading contacts…</Txt> : null}
      {q.error ? <Btn small variant="outline" title="Couldn't load contacts · Retry" onPress={() => q.refetch()} testID="contacts-retry" /> : null}
      {list.map((c, i) => (
        <Row key={c.phone} testID={`trusted-contact-${i}`} style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: space.md }}>
          <View style={{ flex: 1 }}>
            <Txt v="bodyBold">{c.name}{c.relation ? ` · ${c.relation}` : ""}</Txt>
            <Txt v="caption">{c.phone}</Txt>
          </View>
          <Pressable
            hitSlop={10}
            accessibilityLabel={`Remove ${c.name}`}
            testID={`trusted-contact-remove-${i}`}
            onPress={() => save(list.filter((x) => x.phone !== c.phone), `${c.name} removed`)}
            style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </Pressable>
        </Row>
      ))}
      {adding ? (
        <View style={{ gap: space.sm }}>
          <Field label="Name" value={name} onChangeText={setName} testID="contact-name-input" />
          <Field label="WhatsApp number" keyboardType="phone-pad" placeholder="10-digit mobile" value={phone} onChangeText={setPhone} testID="contact-phone-input" />
          <Row style={{ flexWrap: "wrap" }}>
            {RELATIONS.map((r) => <Chip key={r} label={r} selected={relation === r} onPress={() => setRelation(relation === r ? "" : r)} testID={`contact-relation-${r}`} />)}
          </Row>
          <Row>
            <Btn style={{ flex: 1 }} variant="ghost" title="Cancel" onPress={() => setAdding(false)} testID="contact-cancel" />
            <Btn style={{ flex: 1 }} title="Save contact" disabled={!name.trim() || phone.replace(/\D/g, "").length < 10} loading={busy} onPress={add} testID="contact-save" />
          </Row>
        </View>
      ) : q.isSuccess && list.length < 5 ? (
        <Btn variant="outline" icon="person-add" title="Add trusted contact" onPress={() => setAdding(true)} testID="add-trusted-contact" />
      ) : null}
    </Card>
  );
}
