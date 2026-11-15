import { useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { addDays, istanbulDate, weekdayName } from "@cita/core";
import { Button, Card, Chip, Field, Row } from "@/components/ui";
import { Mascot } from "@/components/Mascot";
import { addStudyTime, startTimer, stopTimer, thisWeek, toggleTask, useWeek, type PlanItem } from "@/lib/data";
import { colors, radius, space, type } from "@/lib/theme";

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return <Text style={[type.h1, { color: colors.orange, fontVariant: ["tabular-nums"] }]}>{mm}:{ss}</Text>;
}

export default function Program() {
  const [start, setStart] = useState(thisWeek());
  const { items, open, minutes, target, loading, error, reload } = useWeek(start);
  const [manual, setManual] = useState("");
  const today = istanbulDate();

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
    } catch (e) {
      Alert.alert("Çita", e instanceof Error ? e.message : "İşlem tamamlanamadı.");
    }
  };

  const openItem = open?.plan_item_id ? items.find((i) => i.id === open.plan_item_id) : null;
  const done = items.filter((i) => i.completed).length;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: space(4), paddingBottom: space(12) }} refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.orange} />}>
      <Row style={{ justifyContent: "space-between" }}>
        <Chip label="‹ Önceki" onPress={() => setStart(addDays(start, -7))} />
        <Text style={type.h3}>{start === thisWeek() ? "Bu hafta" : `${start} haftası`}</Text>
        <Chip label="Sonraki ›" onPress={() => setStart(addDays(start, 7))} />
      </Row>

      <Card style={{ marginTop: space(3) }}>
        <Row style={{ justifyContent: "space-between" }}>
          <View>
            <Text style={type.label}>Haftalık hedef</Text>
            <Text style={type.h2}>{minutes} / {target ?? "—"} dk</Text>
          </View>
          <View>
            <Text style={type.label}>Görev</Text>
            <Text style={type.h2}>{done} / {items.length}</Text>
          </View>
        </Row>
        {target ? (
          <View style={{ height: 8, backgroundColor: colors.bgDeep, borderRadius: radius.pill, marginTop: space(2) }}>
            <View style={{ height: 8, width: `${Math.min(100, Math.round((minutes / target) * 100))}%`, backgroundColor: colors.orange, borderRadius: radius.pill }} />
          </View>
        ) : null}
      </Card>

      {open ? (
        <Card accent>
          <Row>
            <Mascot size={36} mood="focus" />
            <View style={{ flex: 1 }}>
              <Text style={type.small}>Kronometre açık{openItem ? ` · ${openItem.title}` : ""}</Text>
              <Elapsed since={open.started_at} />
            </View>
          </Row>
          <Row>
            {openItem && <Button small title="Bitir ve görevi tamamla" onPress={() => act(() => stopTimer(open.id, true))} />}
            <Button small kind="secondary" title="Bitir" onPress={() => act(() => stopTimer(open.id, false))} />
          </Row>
        </Card>
      ) : (
        <Button small kind="secondary" title="Serbest çalışma kronometresi başlat" onPress={() => act(() => startTimer(null))} />
      )}

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      {!loading && items.length === 0 ? (
        <Card>
          <Text style={type.body}>Bu hafta için program yok. Koç sekmesinde Çita&apos;ya «Bugün 60 dakikam var» gibi yazarak görev önerisi alabilirsin.</Text>
        </Card>
      ) : null}

      {Array.from({ length: 7 }, (_, d) => {
        const date = addDays(start, d);
        const day = items.filter((i) => i.plan_date === date);
        return (
          <View key={date} style={{ marginTop: space(3) }}>
            <Text style={[type.h3, date === today && { color: colors.orange }]}>
              {weekdayName(date)} {date === today ? "· Bugün" : ""}
            </Text>
            {day.length === 0 ? <Text style={type.small}>Dinlenme günü</Text> : null}
            {day.map((item: PlanItem) => (
              <Pressable key={item.id} onPress={() => act(() => toggleTask(item))} accessibilityRole="checkbox" accessibilityState={{ checked: item.completed }}>
                <Card style={{ marginTop: space(2), marginBottom: 0, opacity: item.completed ? 0.6 : 1 }}>
                  <Row>
                    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.orange, backgroundColor: item.completed ? colors.orange : "transparent" }} />
                    <Text style={[type.body, { flex: 1, textDecorationLine: item.completed ? "line-through" : "none" }]}>{item.title}</Text>
                    <Text style={type.small}>
                      {item.actual_minutes ? `${item.actual_minutes}/` : ""}
                      {item.planned_minutes ?? "—"} dk
                    </Text>
                  </Row>
                  {!item.completed && !open ? (
                    <Pressable onPress={() => act(() => startTimer(item))} style={{ marginTop: space(2) }}>
                      <Text style={{ color: colors.orangeSoft, fontWeight: "700" }}>▶ Kronometreyle başla</Text>
                    </Pressable>
                  ) : null}
                </Card>
              </Pressable>
            ))}
          </View>
        );
      })}

      <Card style={{ marginTop: space(4) }}>
        <Text style={type.h3}>Bugün kronometresiz çalıştın mı?</Text>
        <Row>
          <View style={{ flex: 1 }}>
            <Field value={manual} onChangeText={setManual} placeholder="Dakika" keyboardType="number-pad" />
          </View>
          <Button
            small
            title="Ekle"
            disabled={!(Number(manual) > 0 && Number(manual) <= 720)}
            onPress={() => act(async () => {
              await addStudyTime(Math.round(Number(manual)));
              setManual("");
            })}
          />
        </Row>
      </Card>
    </ScrollView>
  );
}
