/**
 * Veli ekranı (ayrı hesap, kendi cihazı). Öğrencinin verdiği kodla bağlanır;
 * yalnızca haftalık özet görür (planlanan/tamamlanan görev, süre, net trendi).
 * Bağlı öğrenci adına Çita+ / Bire Bir satın alma başlatabilir; satın alma
 * sunucuda doğru öğrenciye bağlanır.
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { addDays, istanbulDate, TIER_LABEL, weekdayName, weekStart, type Tier } from "@cita/core";
import { Mascot } from "@/components/Mascot";
import { PurchaseSheet } from "@/components/PurchaseSheet";
import { Button, Card, Chip, Field, H1, Row, Screen } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { colors, space, type } from "@/lib/theme";

type Student = { student_id: string; full_name: string; track: string; tier: Tier };
type Summary = {
  planned_tasks: number; completed_tasks: number; planned_minutes: number; study_minutes: number;
  days: { date: string; planned: number; completed: number; minutes: number }[];
  exam_trend: { type: string; date: string; net: number }[];
};

export default function Veli() {
  const { signOut } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [week, setWeek] = useState(weekStart(istanbulDate()));
  const [summary, setSummary] = useState<Summary | null>(null);
  const [code, setCode] = useState("");

  const loadStudents = useCallback(async () => {
    const { data } = await supabase.rpc("cita_parent_students");
    const list = (data as Student[]) ?? [];
    setStudents(list);
    setSel((s) => s ?? list[0]?.student_id ?? null);
  }, []);
  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    if (!sel) return;
    supabase.rpc("cita_parent_weekly_summary", { p_student: sel, p_week_start: week }).then(({ data }) => setSummary(data as Summary));
  }, [sel, week]);

  const link = async () => {
    const { data, error } = await supabase.rpc("cita_redeem_parent_code", { p_code: code });
    const msg: Record<string, string> = {
      ok: "Bağlantı kuruldu.", invalid: "Kod geçersiz ya da süresi dolmuş.", rate_limited: "Çok fazla deneme. Bir saat sonra tekrar dene.", not_parent: "Bu hesap veli hesabı değil.",
    };
    Alert.alert("Çita", error ? "Bağlanılamadı." : msg[data as string] ?? "Bağlanılamadı.");
    setCode("");
    await loadStudents();
  };

  const current = students.find((s) => s.student_id === sel);
  return (
    <Screen>
      <Row>
        <Mascot size={48} />
        <H1>Veli paneli</H1>
      </Row>
      <Card>
        <Text style={type.h3}>Öğrenci bağla</Text>
        <Text style={type.small}>Çocuğunun Çita uygulamasında Bire Bir sekmesinden oluşturduğu 8 haneli kodu gir.</Text>
        <Field value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="ÖRN. K7M2QX4P" maxLength={8} />
        <Button small title="Bağla" disabled={code.trim().length !== 8} onPress={link} />
      </Card>

      <Row>
        {students.map((s) => <Chip key={s.student_id} label={s.full_name || "Öğrenci"} selected={s.student_id === sel} onPress={() => setSel(s.student_id)} />)}
      </Row>

      {current && summary ? (
        <View>
          <Row style={{ justifyContent: "space-between", marginTop: space(3) }}>
            <Chip label="‹" onPress={() => setWeek(addDays(week, -7))} />
            <Text style={type.h3}>{week} haftası</Text>
            <Chip label="›" onPress={() => setWeek(addDays(week, 7))} />
          </Row>
          <Card>
            <Text style={type.label}>{TIER_LABEL[current.tier]} · {current.track}</Text>
            <Text style={type.h2}>{summary.completed_tasks}/{summary.planned_tasks} görev tamamlandı</Text>
            <Text style={type.body}>{summary.study_minutes} dk çalışma · planlanan {summary.planned_minutes} dk</Text>
            {summary.days.map((d) => (
              <Text key={d.date} style={type.small}>
                {weekdayName(d.date)}: {d.planned ? `${d.completed}/${d.planned} görev` : "dinlenme"} · {d.minutes} dk
              </Text>
            ))}
          </Card>
          <Card>
            <Text style={type.h3}>Deneme net trendi</Text>
            {summary.exam_trend.length === 0 ? <Text style={type.small}>Henüz deneme kaydı yok.</Text> : null}
            {summary.exam_trend.map((e, i) => <Text key={i} style={type.body}>{e.date} · {e.type}: {e.net} net</Text>)}
          </Card>
          <Text style={[type.small, { color: colors.muted }]}>Sohbetler, soru fotoğrafları ve yanlış defteri öğrencinin özelidir; burada gösterilmez.</Text>
          {current.tier === "free" ? (
            <PurchaseSheet product="cita_plus_monthly" studentId={current.student_id} label={`${current.full_name || "Öğrenci"} için Çita+ al`} onDone={loadStudents} />
          ) : null}
          {current.tier !== "bire_bir" ? (
            <PurchaseSheet product="cita_birebir_monthly" studentId={current.student_id} label={`${current.full_name || "Öğrenci"} için Bire Bir al`} onDone={loadStudents} />
          ) : null}
        </View>
      ) : null}
      <Button kind="ghost" title="Çıkış yap" onPress={signOut} />
    </Screen>
  );
}
