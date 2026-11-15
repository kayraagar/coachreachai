/**
 * Deneme girişi: sınav türü seçilir, yalnızca o türün dersleri ve soru
 * sayıları gösterilir; D/Y/B ve net kurala göre anlık doğrulanır.
 * Kayıt sabit clientId ile gider (tekrar deneme çift deneme üretmez).
 */
import { useRef, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { randomUUID } from "expo-crypto";
import { EXAM_RULES, istanbulDate, validateExam, type ExamEntry } from "@cita/core";
import { Button, Card, Chip, ErrorText, Field, H1, Row, Screen } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, radius, space, type } from "@/lib/theme";

type Counts = Record<string, { c: string; w: string; b: string }>;

function Num({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={type.small}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9]/g, "").slice(0, 3))}
        keyboardType="number-pad"
        style={{ width: 54, textAlign: "center", color: colors.text, backgroundColor: colors.bgDeep, borderRadius: radius.sm, paddingVertical: 6, borderWidth: 1, borderColor: colors.line }}
      />
    </View>
  );
}

export default function Deneme() {
  const { profile } = useAuth();
  const track = profile?.track ?? "YKS";
  const rules = EXAM_RULES[track];
  const [examType, setExamType] = useState(rules[0].type as string);
  const [name, setName] = useState("");
  const [date, setDate] = useState(istanbulDate());
  const [branchSubject, setBranchSubject] = useState<string | null>(null);
  const [branchQ, setBranchQ] = useState("20");
  const [counts, setCounts] = useState<Counts>({});
  const [busy, setBusy] = useState(false);
  const clientId = useRef(randomUUID());

  const rule = rules.find((r) => r.type === examType)!;
  const subjects = rule.type === "Branş" ? rule.subjects.filter((s) => s.subject === branchSubject) : rule.subjects;
  const entries: ExamEntry[] = subjects
    .filter((s) => counts[s.subject] && (counts[s.subject].c || counts[s.subject].w || counts[s.subject].b))
    .map((s) => ({
      subject: s.subject,
      correct: Number(counts[s.subject].c || 0),
      wrong: Number(counts[s.subject].w || 0),
      blank: counts[s.subject].b === "" ? null : Number(counts[s.subject].b),
    }));
  const v = validateExam(track, examType, entries, rule.type === "Branş" ? Number(branchQ) : undefined);

  const set = (subject: string, k: "c" | "w" | "b", val: string) =>
    setCounts((p) => ({ ...p, [subject]: { ...(p[subject] ?? { c: "", w: "", b: "" }), [k]: val } }));

  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ status: string; totalNet: number }>("/api/cita/exams", {
        body: { clientId: clientId.current, examType, name, date, entries, branchQuestions: rule.type === "Branş" ? Number(branchQ) : undefined },
      });
      Alert.alert("Çita", `Kaydedildi. Toplam net: ${r.totalNet}`);
      router.back();
    } catch (e) {
      Alert.alert("Çita", e instanceof ApiError ? e.message : "Kaydedilemedi; tekrar denersen çift kayıt oluşmaz.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <H1>Deneme ekle</H1>
      <Row>
        {rules.map((r) => (
          <Chip key={r.type} label={r.label} selected={examType === r.type} onPress={() => { setExamType(r.type); setCounts({}); }} />
        ))}
      </Row>
      <Text style={[type.small, { marginTop: space(2) }]}>Net = Doğru − Yanlış / {rule.penalty}. Boş bırakırsan kalan sorular boş sayılır.</Text>
      <Field label="Deneme adı" value={name} onChangeText={setName} placeholder="Örn. Yayınevi TYT-3" />
      <Field label="Tarih (YYYY-AA-GG)" value={date} onChangeText={setDate} />
      {rule.type === "Branş" ? (
        <Card>
          <Text style={type.label}>Ders</Text>
          <Row>
            {rule.subjects.map((s) => <Chip key={s.subject} label={s.subject} selected={branchSubject === s.subject} onPress={() => setBranchSubject(s.subject)} />)}
          </Row>
          <Field label="Soru sayısı" value={branchQ} onChangeText={setBranchQ} keyboardType="number-pad" />
        </Card>
      ) : null}
      {subjects.map((s) => (
        <Card key={s.subject} style={{ paddingVertical: space(3) }}>
          <Row style={{ justifyContent: "space-between" }}>
            <View>
              <Text style={type.h3}>{s.subject}</Text>
              <Text style={type.small}>{rule.type === "Branş" ? branchQ : s.questions} soru</Text>
            </View>
            <Row>
              <Num label="D" value={counts[s.subject]?.c ?? ""} onChange={(x) => set(s.subject, "c", x)} />
              <Num label="Y" value={counts[s.subject]?.w ?? ""} onChange={(x) => set(s.subject, "w", x)} />
              <Num label="B" value={counts[s.subject]?.b ?? ""} onChange={(x) => set(s.subject, "b", x)} />
            </Row>
          </Row>
        </Card>
      ))}
      {entries.length ? (v.ok ? <Text style={[type.h3, { color: colors.success }]}>Toplam net: {v.totalNet}</Text> : <ErrorText>{v.errors.join(" ")}</ErrorText>) : null}
      <Button title="Kaydet" loading={busy} disabled={!entries.length || !v.ok} onPress={save} />
    </Screen>
  );
}
