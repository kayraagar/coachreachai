/**
 * Hesapsız 7 günlük program önizlemesi. Öğrenci «Cumartesi çalışamam» gibi
 * isteklerle taslağı düzeltebilir; sonra kaydedip başlar (hesap açarak ya da
 * mevcut hesabına girerek).
 */
import { useEffect, useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";
import { router } from "expo-router";
import { applyPlanEdits, parsePlanEdit, planSummary, subjectPool, validateProfile } from "@cita/core";
import { Mascot } from "@/components/Mascot";
import { PlanWeekView } from "@/components/PlanWeekView";
import { Button, Card, Field, H1, Loading, P, Row, Screen } from "@/components/ui";
import { draftPlan, loadDraft, saveDraft, type Draft } from "@/lib/draft";
import { colors, space, type } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { importPendingDraft } from "@/lib/afterAuth";

export default function Onizleme() {
  const { session } = useAuth();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState("");
  const [reply, setReply] = useState<string | null>(null);

  useEffect(() => {
    loadDraft().then((d) => (d ? setDraft(d) : router.replace("/tanisma")));
  }, []);

  const plan = useMemo(() => (draft ? draftPlan(draft) : null), [draft]);
  if (!draft || !plan) return <Loading />;
  const sum = planSummary(plan);

  const edit = async () => {
    const parsed = parsePlanEdit(text, subjectPool(draft.profile));
    if (!parsed.understood) {
      setReply(parsed.reply);
      return;
    }
    const next = applyPlanEdits(draft.profile, parsed.edits);
    const errors = validateProfile(next);
    if (errors.length) {
      setReply(`Bunu yapamam: ${errors.join(" ")}`);
      return;
    }
    setDraft(await saveDraft(next, draft.startDate));
    setReply(parsed.reply);
    setText("");
  };

  return (
    <Screen>
      <Row style={{ marginBottom: space(2) }}>
        <Mascot size={48} mood="happy" />
        <View style={{ flex: 1 }}>
          <H1>Haftan hazır</H1>
        </View>
      </Row>
      <Card accent>
        <Text style={type.h3}>{draft.profile.goal || "Hedefin"}</Text>
        <P muted>
          {sum.studyDays} çalışma günü · toplam {Math.round(sum.totalMinutes / 6) / 10} saat ·{" "}
          {sum.bySubject.slice(0, 3).map(([s]) => s).join(", ")} ağırlıklı
        </P>
      </Card>

      <Card>
        <Text style={type.h3}>Değiştirmek istediğin bir şey var mı?</Text>
        <P muted>Örn. «Cumartesi çalışamam», «Pazar 2 saat», «Matematiği artır», «Deneme olmasın».</P>
        <Field value={text} onChangeText={setText} placeholder="İsteğini yaz…" onSubmitEditing={edit} returnKeyType="send" />
        <Button small kind="secondary" title="Programı güncelle" disabled={!text.trim()} onPress={edit} />
        {reply ? (
          <Row style={{ marginTop: space(2) }}>
            <Mascot size={26} />
            <Text style={[type.body, { flex: 1, color: colors.orangeSoft }]}>{reply}</Text>
          </Row>
        ) : null}
      </Card>

      <PlanWeekView startDate={plan.startDate} tasks={plan.tasks} />

      <Button
        title="Programı Kaydet ve Başla"
        onPress={async () => {
          if (!session) return router.push("/kayit");
          const { message } = await importPendingDraft();
          if (message) Alert.alert("Çita", message);
          router.replace("/");
        }}
      />
      {!session && <Button kind="ghost" title="Hesabım var, giriş yap" onPress={() => router.push("/giris")} />}
      <P muted>İlk programını kaydetmek ve başlamak ücretsiz. Koç kodu gerekmez.</P>
    </Screen>
  );
}
