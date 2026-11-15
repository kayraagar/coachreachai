/**
 * Maskotla hesapsız tanışma sohbeti: sınav → (YKS: alan, odak) → hedef →
 * seviye / son deneme (isteğe bağlı) → zorlanılan dersler → müsaitlik.
 * Sonunda deterministik 7 günlük plan üretilir ve önizlemeye geçilir.
 */
import { useMemo, useRef, useState, type ComponentRef } from "react";
import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { subjectPool, WEEKDAY_NAMES, type Level, type OnboardingProfile, type YksField, type YksFocus } from "@cita/core";
import { Mascot } from "@/components/Mascot";
import { Button, Chip, Field, Row } from "@/components/ui";
import { colors, radius, space, type } from "@/lib/theme";
import { defaultStartDate, saveDraft } from "@/lib/draft";

type Step = "track" | "field" | "focus" | "goal" | "level" | "net" | "weak" | "availability" | "custom";
type Msg = { from: "cita" | "me"; text: string };

const PRESETS: { label: string; value: number[] }[] = [
  { label: "Hafta içi 1 sa, hafta sonu 3 sa", value: [60, 60, 60, 60, 60, 180, 180] },
  { label: "Hafta içi 2 sa, Cmt 4 sa, Pazar dinlenme", value: [120, 120, 120, 120, 120, 240, 0] },
  { label: "Her gün 90 dk, Pazar dinlenme", value: [90, 90, 90, 90, 90, 90, 0] },
  { label: "Hafta içi 3 sa, hafta sonu 5 sa", value: [180, 180, 180, 180, 180, 300, 300] },
];

const QUESTIONS: Record<Step, string> = {
  track: "Selam, ben Çita! Hangi sınava hazırlanıyorsun?",
  field: "Alanın hangisi?",
  focus: "Şu an hangi oturuma odaklanalım?",
  goal: "Hedefin ne? Kısa yaz: «Fen lisesi», «İTÜ Bilgisayar», «TYT 100 net» gibi.",
  level: "Kendini şu an nerede görüyorsun?",
  net: "Son deneme netin var mı? Yoksa geçebilirsin, sorun değil.",
  weak: "Seni en çok hangi dersler zorluyor? Birden fazla seçebilirsin.",
  availability: "Haftada ne kadar vaktin var? Dinlenme günü de planın parçası.",
  custom: "Gün gün ayarla. 0 dakika = dinlenme günü.",
};

export default function Tanisma() {
  const [step, setStep] = useState<Step>("track");
  const [msgs, setMsgs] = useState<Msg[]>([{ from: "cita", text: QUESTIONS.track }]);
  const [p, setP] = useState<OnboardingProfile>({ track: "YKS", goal: "", level: "orta", weakSubjects: [], availability: [60, 60, 60, 60, 60, 180, 180] });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const say = (me: string, next: Step | null, patch: Partial<OnboardingProfile> = {}, extra?: string) => {
    const np = { ...p, ...patch };
    setP(np);
    const add: Msg[] = [{ from: "me", text: me }];
    if (extra) add.push({ from: "cita", text: extra });
    if (next) add.push({ from: "cita", text: QUESTIONS[next] });
    setMsgs((m) => [...m, ...add]);
    if (next) setStep(next);
    setText("");
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return np;
  };

  const pool = useMemo(() => [...new Set(subjectPool({ ...p, weakSubjects: [] }).map((w) => w.subject))], [p]);

  const finish = async (profile: OnboardingProfile) => {
    setBusy(true);
    try {
      await saveDraft(profile, defaultStartDate());
      router.replace("/onizleme");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: space(4), paddingBottom: space(6) }}>
        {msgs.map((m, i) =>
          m.from === "cita" ? (
            <View key={i} style={{ flexDirection: "row", gap: space(2), marginBottom: space(3), alignItems: "flex-end" }}>
              <Mascot size={34} />
              <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, padding: space(3), maxWidth: "82%" }}>
                <Text style={type.body}>{m.text}</Text>
              </View>
            </View>
          ) : (
            <View key={i} style={{ alignSelf: "flex-end", backgroundColor: colors.orange, borderRadius: radius.lg, padding: space(3), marginBottom: space(3), maxWidth: "82%" }}>
              <Text style={[type.body, { color: colors.orangeInk, fontWeight: "600" }]}>{m.text}</Text>
            </View>
          )
        )}
      </ScrollView>

      <View style={{ padding: space(4), borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.bgDeep }}>
        {step === "track" && (
          <Row>
            <Chip label="YKS" onPress={() => say("YKS", "field", { track: "YKS" })} />
            <Chip label="LGS" onPress={() => say("LGS", "goal", { track: "LGS", field: null, focus: null })} />
          </Row>
        )}
        {step === "field" && (
          <Row>
            {(["SAY", "EA", "SÖZ", "DİL"] as YksField[]).map((f) => (
              <Chip key={f} label={f} onPress={() => say(f, "focus", { field: f })} />
            ))}
          </Row>
        )}
        {step === "focus" && (
          <Row>
            {(p.field === "DİL" ? (["YDT", "TYT"] as YksFocus[]) : (["TYT+AYT", "TYT", "AYT"] as YksFocus[])).map((f) => (
              <Chip key={f} label={f} onPress={() => say(f, "goal", { focus: f })} />
            ))}
          </Row>
        )}
        {step === "goal" && (
          <View>
            <Field value={text} onChangeText={setText} placeholder="Hedefim…" maxLength={200} autoFocus />
            <Button title="Gönder" disabled={text.trim().length < 2} onPress={() => say(text.trim(), "level", { goal: text.trim() })} />
          </View>
        )}
        {step === "level" && (
          <Row>
            {(["başlangıç", "orta", "iyi"] as Level[]).map((l) => (
              <Chip key={l} label={l[0].toLocaleUpperCase("tr-TR") + l.slice(1)} onPress={() => say(l, "net", { level: l })} />
            ))}
          </Row>
        )}
        {step === "net" && (
          <View>
            <Field value={text} onChangeText={setText} placeholder="Örn. 62,5" keyboardType="decimal-pad" />
            <Row>
              <Button
                small
                title="Kaydet"
                disabled={!Number.isFinite(Number(text.replace(",", "."))) || text.trim() === ""}
                onPress={() => say(`${text} net`, "weak", { lastExamNet: Number(text.replace(",", ".")) })}
              />
              <Button small kind="ghost" title="Deneme bilgim yok, geç" onPress={() => say("Geç", "weak", { lastExamNet: null }, "Sorun değil, ilk denemende birlikte bakarız.")} />
            </Row>
          </View>
        )}
        {step === "weak" && (
          <View>
            <Row style={{ marginBottom: space(2) }}>
              {pool.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  selected={p.weakSubjects.includes(s)}
                  onPress={() =>
                    setP({ ...p, weakSubjects: p.weakSubjects.includes(s) ? p.weakSubjects.filter((x) => x !== s) : [...p.weakSubjects, s] })
                  }
                />
              ))}
            </Row>
            <Button
              title={p.weakSubjects.length ? "Devam" : "Belirgin bir zorluk yok"}
              onPress={() => say(p.weakSubjects.length ? p.weakSubjects.join(", ") : "Belirgin bir zorluk yok", "availability")}
            />
          </View>
        )}
        {step === "availability" && (
          <View>
            {PRESETS.map((pr) => (
              <Button key={pr.label} kind="secondary" small title={pr.label} loading={busy} onPress={() => finish(say(pr.label, null, { availability: pr.value }, "Harika. Programını hazırladım, bir bakalım."))} />
            ))}
            <Button small kind="ghost" title="Kendim ayarlayacağım" onPress={() => say("Kendim ayarlayacağım", "custom")} />
          </View>
        )}
        {step === "custom" && (
          <View>
            {WEEKDAY_NAMES.map((d, i) => (
              <Row key={d} style={{ justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={[type.body, { width: 100 }]}>{d}</Text>
                <Row>
                  <Chip label="−30" onPress={() => setP({ ...p, availability: p.availability.map((m, j) => (j === i ? Math.max(0, m - 30) : m)) })} />
                  <Text style={[type.h3, { width: 70, textAlign: "center" }]}>{p.availability[i] ? `${p.availability[i]} dk` : "Dinlen"}</Text>
                  <Chip label="+30" onPress={() => setP({ ...p, availability: p.availability.map((m, j) => (j === i ? Math.min(600, m + 30) : m)) })} />
                </Row>
              </Row>
            ))}
            <Button
              title="Programımı çıkar"
              loading={busy}
              disabled={p.availability.every((m) => m === 0)}
              onPress={() => finish(say("Hazır", null, {}, "Harika. Programını hazırladım, bir bakalım."))}
            />
          </View>
        )}
      </View>
    </View>
  );
}
