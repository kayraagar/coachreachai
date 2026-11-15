import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { addDays, BADGES, computeStreak, ERROR_TYPES, istanbulDate, type BadgeKey, type NetSeries, type Pattern } from "@cita/core";
import { Button, Card, Row } from "@/components/ui";
import { Mascot } from "@/components/Mascot";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { thisWeek, useWeek } from "@/lib/data";
import { colors, space, type } from "@/lib/theme";

type Mistake = { id: string; subject: string; topic: string | null; error_type: keyof typeof ERROR_TYPES | null; error_type_confirmed: boolean; next_review_date: string | null };

function Bars({ s }: { s: NetSeries }) {
  const max = Math.max(1, ...s.points.map((p) => p.net));
  return (
    <Card>
      <Row style={{ justifyContent: "space-between" }}>
        <Text style={type.h3}>{s.key}</Text>
        {s.delta !== null ? (
          <Text style={{ color: s.delta >= 0 ? colors.success : colors.danger, fontWeight: "800" }}>{s.delta >= 0 ? "+" : ""}{s.delta} net</Text>
        ) : (
          <Text style={type.small}>Karşılaştırma için 2. deneme gerekli</Text>
        )}
      </Row>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 90, marginTop: space(2) }}>
        {s.points.slice(-8).map((p) => (
          <View key={p.examId} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ color: colors.muted, fontSize: 10 }}>{p.net}</Text>
            <View style={{ width: "70%", height: Math.max(4, (Math.max(0, p.net) / max) * 70), backgroundColor: colors.orange, borderRadius: 4 }} />
            <Text style={{ color: colors.muted, fontSize: 9 }}>{p.date.slice(5)}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

export default function Gelisim() {
  const { tier } = useAuth();
  const week = useWeek(thisWeek());
  const reloadWeek = week.reload;
  const [series, setSeries] = useState<NetSeries[]>([]);
  const [badges, setBadges] = useState<BadgeKey[]>([]);
  const [streak, setStreak] = useState({ current: 0, best: 0 });
  const [notebook, setNotebook] = useState<{ mistakes: Mistake[]; patterns: Pattern[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const today = istanbulDate();
    const [ex, b, items] = await Promise.all([
      api<{ series: NetSeries[] }>("/api/cita/exams").catch(() => ({ series: [] as NetSeries[] })),
      supabase.rpc("cita_refresh_badges"),
      supabase.from("study_plan_items").select("plan_date, completed").gte("plan_date", addDays(today, -60)).lte("plan_date", today),
    ]);
    setSeries(ex.series);
    setBadges(((b.data ?? []) as { badge_key: BadgeKey }[]).map((x) => x.badge_key));
    const byDay = new Map<string, { date: string; planned: number; completed: number }>();
    for (const r of (items.data ?? []) as { plan_date: string; completed: boolean }[]) {
      const d = byDay.get(r.plan_date) ?? { date: r.plan_date, planned: 0, completed: 0 };
      d.planned += 1;
      if (r.completed) d.completed += 1;
      byDay.set(r.plan_date, d);
    }
    setStreak(computeStreak([...byDay.values()], today));
    if (tier !== "free") setNotebook(await api<{ mistakes: Mistake[]; patterns: Pattern[] }>("/api/cita/notebook").catch(() => null));
    setLoading(false);
  }, [tier]);

  useFocusEffect(
    useCallback(() => {
      void load();
      void reloadWeek();
    }, [load, reloadWeek])
  );

  const pct = week.target ? Math.min(100, Math.round((week.minutes / week.target) * 100)) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: space(4), paddingBottom: space(12) }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.orange} />}>
      <Row>
        <Card style={{ flex: 1 }}>
          <Text style={type.label}>Seri</Text>
          <Text style={[type.h1, { color: colors.orange }]}>{streak.current} gün</Text>
          <Text style={type.small}>En iyi: {streak.best} · dinlenme günleri seriyi bozmaz</Text>
        </Card>
        <Card style={{ flex: 1 }}>
          <Text style={type.label}>Haftalık hedef</Text>
          <Text style={type.h1}>%{pct}</Text>
          <Text style={type.small}>{week.minutes}/{week.target ?? "—"} dk</Text>
        </Card>
      </Row>

      <Text style={[type.h2, { marginTop: space(2) }]}>Rozetler</Text>
      <Row>
        {(Object.keys(BADGES) as BadgeKey[]).map((k) => (
          <View key={k} style={{ alignItems: "center", width: 100, opacity: badges.includes(k) ? 1 : 0.35 }}>
            <Mascot size={44} mood={badges.includes(k) ? "happy" : "normal"} />
            <Text style={[type.small, { textAlign: "center", color: colors.text, fontWeight: "700" }]}>{BADGES[k].title}</Text>
            <Text style={[type.small, { textAlign: "center", fontSize: 11 }]}>{BADGES[k].description}</Text>
          </View>
        ))}
      </Row>

      <Row style={{ justifyContent: "space-between", marginTop: space(4) }}>
        <Text style={type.h2}>Denemeler</Text>
        <Button small title="+ Deneme ekle" onPress={() => router.push("/deneme")} />
      </Row>
      {series.length === 0 ? <Card><Text style={type.body}>İlk denemeni ekle; netlerini yalnızca aynı deneme türüyle karşılaştırırım.</Text></Card> : null}
      {series.map((s) => <Bars key={s.key} s={s} />)}

      <Text style={[type.h2, { marginTop: space(4) }]}>Yanlış defteri ve tekrar</Text>
      {tier === "free" ? (
        <Card>
          <Text style={type.body}>Yanlış defteri, tekrarlayan hata analizi ve kişisel tekrar Çita+ ile açılır.</Text>
          <Button small title="Çita+'yı incele" onPress={() => router.push("/plus")} />
        </Card>
      ) : (
        <View>
          {notebook?.patterns.length ? (
            notebook.patterns.map((p) => (
              <Card key={p.label} accent>
                <Text style={type.h3}>Tekrarlayan hata</Text>
                <Text style={type.body}>{p.label}</Text>
                <Text style={type.small}>Dayanak: {p.evidenceIds.length} doğrulanmış kayıt</Text>
              </Card>
            ))
          ) : (
            <Card><Text style={type.small}>Örüntü için aynı hata türünde en az 3 doğrulanmış kayıt gerekiyor. Uydurma bulgu göstermiyorum.</Text></Card>
          )}
          {(notebook?.mistakes ?? []).map((m) => (
            <Pressable key={m.id} onPress={() => router.push({ pathname: "/tekrar/[id]", params: { id: m.id } })}>
              <Card>
                <Text style={type.h3}>{m.subject}{m.topic ? ` · ${m.topic}` : ""}</Text>
                <Text style={type.small}>
                  {m.error_type ? `${ERROR_TYPES[m.error_type]}${m.error_type_confirmed ? "" : " (doğrulanmadı)"}` : "Hata türü belirtilmedi"}
                  {m.next_review_date ? ` · sonraki tekrar ${m.next_review_date}` : ""}
                </Text>
                <Text style={{ color: colors.orangeSoft, fontWeight: "700", marginTop: 4 }}>Kişisel tekrar başlat ›</Text>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
