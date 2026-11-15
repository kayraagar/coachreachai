/**
 * Kişisel tekrar: eski yanlış + doğrulanmış iki benzer soru. Her soru için
 * bağımsız doğru, ipucu kullanımı ve bağımsız adım sayısı kaydedilir. Bitince
 * sonraki tekrar programa ÖNERİ olarak gelir (onay akışı).
 */
import { useEffect, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { Button, Card, Chip, H1, Loading, P, Row, Screen, TestBadge } from "@/components/ui";
import { ProposalCard } from "@/components/ProposalCard";
import { api, ApiError } from "@/lib/api";
import { colors, space, type } from "@/lib/theme";

type Item = { kind: "original" | "similar"; prompt: string; choices: string[] | null; skill: string };
type Session = { id: string; items: Item[]; status: string; provider: string };
type Answer = { itemIndex: number; choice: string | null; usedHint: boolean; independentSteps: number };
type Done = { summary: string; nextReviewDate: string; proposalId: string; solutions: { answer: string; solutionSteps: string[] }[] };

export default function Tekrar() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(`review-${randomUUID()}`);

  useEffect(() => {
    api<{ session: Session; notice: string | null }>("/api/cita/review", { body: { mistakeId: id }, idempotencyKey: key.current })
      .then((r) => {
        setSession(r.session);
        setNotice(r.notice ?? null);
        setAnswers(r.session.items.map((_, i) => ({ itemIndex: i, choice: null, usedHint: false, independentSteps: 0 })));
      })
      .catch((e) => Alert.alert("Çita", e instanceof ApiError ? e.message : "Tekrar hazırlanamadı."));
  }, [id]);

  if (!session) return <Loading />;
  const upd = (i: number, patch: Partial<Answer>) => setAnswers((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const finish = async () => {
    setBusy(true);
    try {
      setDone(await api<Done>(`/api/cita/review/${session.id}/complete`, { body: { answers } }));
    } catch (e) {
      Alert.alert("Çita", e instanceof ApiError ? e.message : "Kaydedilemedi; tekrar denemek güvenli.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <H1>Kişisel tekrar</H1>
      {session.provider === "test" ? <TestBadge /> : null}
      {notice ? <P muted>{notice}</P> : null}
      {session.items.map((it, i) => (
        <Card key={i} accent={it.kind === "original"}>
          <Text style={type.label}>{it.kind === "original" ? "Eski yanlışın" : `Benzer soru ${i}`} · {it.skill}</Text>
          <Text style={[type.body, { marginVertical: space(2) }]}>{it.prompt}</Text>
          {it.choices ? (
            <Row>
              {it.choices.map((c) => <Chip key={c} label={c} selected={answers[i]?.choice === c} onPress={() => !done && upd(i, { choice: c })} />)}
            </Row>
          ) : (
            <Row>
              <Chip label="Doğru çözdüm" selected={answers[i]?.choice === "dogru"} onPress={() => !done && upd(i, { choice: "dogru" })} />
              <Chip label="Çözemedim" selected={answers[i]?.choice === "yanlis"} onPress={() => !done && upd(i, { choice: "yanlis" })} />
            </Row>
          )}
          <Row style={{ marginTop: space(2) }}>
            <Chip label={answers[i]?.usedHint ? "İpucu kullandım ✓" : "İpucu kullandım"} selected={answers[i]?.usedHint} onPress={() => !done && upd(i, { usedHint: !answers[i].usedHint })} />
            <Chip label="− adım" onPress={() => !done && upd(i, { independentSteps: Math.max(0, answers[i].independentSteps - 1) })} />
            <Text style={type.small}>{answers[i]?.independentSteps ?? 0} bağımsız adım</Text>
            <Chip label="+ adım" onPress={() => !done && upd(i, { independentSteps: answers[i].independentSteps + 1 })} />
          </Row>
          {done ? (
            <View style={{ marginTop: space(2) }}>
              <Text style={{ color: colors.success, fontWeight: "800" }}>Cevap: {done.solutions[i]?.answer || "—"}</Text>
              {(done.solutions[i]?.solutionSteps ?? []).map((s, j) => <Text key={j} style={type.small}>{j + 1}. {s}</Text>)}
            </View>
          ) : null}
        </Card>
      ))}
      {!done ? (
        <Button title="Tekrarı bitir" loading={busy} disabled={answers.some((a) => a.choice === null)} onPress={finish} />
      ) : (
        <View>
          <Card><Text style={type.body}>{done.summary}</Text></Card>
          <ProposalCard proposalId={done.proposalId} />
        </View>
      )}
    </Screen>
  );
}
