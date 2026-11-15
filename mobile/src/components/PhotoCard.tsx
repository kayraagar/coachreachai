/**
 * Soru fotoğrafı sonucu: önce ipucu, istenirse "Tam Çözümü Göster" (aynı hak),
 * Çita+ ise "Yanlış defterime kaydet" + hata türü doğrulaması.
 */
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { ERROR_TYPES, type ErrorType, type Tier } from "@cita/core";
import { api, ApiError } from "@/lib/api";
import { colors, space, type } from "@/lib/theme";
import { Button, Card, Chip, Row, TestBadge } from "./ui";

export type PhotoRequestView = {
  id: string;
  status: "hint" | "unreadable" | "failed" | "processing";
  subject: string | null;
  topic: string | null;
  questionText: string | null;
  hint: string | null;
  provider: string | null;
};

type Solution = { steps: string[]; finalAnswer: string; keyIdea: string; likelyErrorTypes: ErrorType[]; clarifyingQuestion: string };

export function PhotoCard({ request, tier, onUpsell }: { request: PhotoRequestView; tier: Tier; onUpsell: () => void }) {
  const [solution, setSolution] = useState<Solution | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  if (request.status !== "hint") {
    return (
      <Card>
        <Text style={type.body}>Bu fotoğrafı okuyamadım{request.hint ? `: ${request.hint}` : "."} Hakkın düşmedi; daha net, düz ve aydınlık çekip tekrar gönder.</Text>
      </Card>
    );
  }

  const showSolution = async () => {
    setBusy(true);
    try {
      const r = await api<{ solution: Solution }>(`/api/cita/photo/${request.id}/solution`, { method: "POST", body: {} });
      setSolution(r.solution);
    } catch (e) {
      Alert.alert("Çita", e instanceof ApiError ? e.message : "Çözüm alınamadı.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (errorType: ErrorType | null) => {
    if (tier === "free") return onUpsell();
    setBusy(true);
    try {
      await api("/api/cita/notebook", {
        body: { photoRequestId: request.id, subject: request.subject ?? "Genel", topic: request.topic, errorType, confirmed: Boolean(errorType) },
      });
      setSaved(errorType ? ERROR_TYPES[errorType] : "kaydedildi");
    } catch (e) {
      Alert.alert("Çita", e instanceof ApiError ? e.message : "Kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card accent>
      {request.provider === "test" ? <TestBadge /> : null}
      <Text style={type.label}>{[request.subject, request.topic].filter(Boolean).join(" · ") || "Soru"}</Text>
      {request.questionText ? <Text style={[type.small, { marginVertical: space(1) }]}>{request.questionText}</Text> : null}
      <Text style={[type.h3, { color: colors.orangeSoft }]}>İpucu</Text>
      <Text style={type.body}>{request.hint}</Text>
      {!solution ? (
        <Button small kind="secondary" title="Tam Çözümü Göster" loading={busy} onPress={showSolution} />
      ) : (
        <View style={{ marginTop: space(2) }}>
          <Text style={type.h3}>Çözüm</Text>
          {solution.steps.map((s, i) => (
            <Text key={i} style={type.body}>
              {i + 1}. {s}
            </Text>
          ))}
          <Text style={[type.body, { fontWeight: "800", marginTop: space(1) }]}>Cevap: {solution.finalAnswer}</Text>
          <Text style={type.small}>Ölçülen beceri: {solution.keyIdea}</Text>
          {saved ? (
            <Text style={{ color: colors.success, marginTop: space(2) }}>Yanlış defterine kaydedildi ({saved}).</Text>
          ) : (
            <View style={{ marginTop: space(2) }}>
              <Text style={type.body}>{solution.clarifyingQuestion}</Text>
              <Row style={{ marginTop: space(1) }}>
                {solution.likelyErrorTypes.slice(0, 3).map((et) => (
                  <Chip key={et} label={ERROR_TYPES[et]} onPress={() => save(et)} />
                ))}
                <Chip label="Emin değilim" onPress={() => save(null)} />
              </Row>
              {tier === "free" ? <Text style={type.small}>Yanlış defteri Çita+ özelliği.</Text> : null}
            </View>
          )}
        </View>
      )}
    </Card>
  );
}
