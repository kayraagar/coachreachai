import { Text, View } from "react-native";
import { addDays, weekdayName, type PlanTask } from "@cita/core";
import { colors, space, type } from "@/lib/theme";
import { Card } from "./ui";

const KIND_ICON: Record<string, string> = { konu: "📘", soru: "✏️", tekrar: "🔁", deneme: "⏱️", analiz: "🔎" };

/** Yedi günün tamamı: gün, ders/konu, yapılacak iş, tahmini süre. */
export function PlanWeekView({ startDate, tasks }: { startDate: string; tasks: Pick<PlanTask, "date" | "title" | "minutes" | "kind" | "subject">[] }) {
  return (
    <View>
      {Array.from({ length: 7 }, (_, d) => {
        const date = addDays(startDate, d);
        const day = tasks.filter((t) => t.date === date);
        const total = day.reduce((s, t) => s + t.minutes, 0);
        return (
          <Card key={date} style={{ paddingVertical: space(3) }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: space(1) }}>
              <Text style={type.h3}>{weekdayName(date)}</Text>
              <Text style={type.small}>{day.length ? `${total} dk` : "Dinlenme"}</Text>
            </View>
            {day.length === 0 ? (
              <Text style={type.small}>Planlı dinlenme günü — serin bozulmaz.</Text>
            ) : (
              day.map((t, i) => (
                <View key={i} style={{ flexDirection: "row", gap: space(2), paddingVertical: 3 }}>
                  <Text>{KIND_ICON[t.kind ?? "konu"] ?? "•"}</Text>
                  <Text style={[type.body, { flex: 1 }]}>{t.title}</Text>
                  <Text style={{ color: colors.orangeSoft, fontWeight: "700" }}>{t.minutes} dk</Text>
                </View>
              ))
            )}
          </Card>
        );
      })}
    </View>
  );
}
