/**
 * Program değişikliği kartı: etkilenen görevlerin önceki ve önerilen hâli.
 * Onay sunucuda atomik uygulanır (ücretsiz/Çita+) ya da koç kuyruğuna gider
 * (Bire Bir). Durum ve uygulanan son hâl gösterilir.
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { describeOps, PROPOSAL_STATUS_LABEL, weekdayName, type PlanOp, type ProposalStatus } from "@cita/core";
import { supabase } from "@/lib/supabase";
import { colors, space, type } from "@/lib/theme";
import { Button, Card, Row } from "./ui";

type Proposal = {
  id: string;
  summary: string;
  status: ProposalStatus;
  ops: PlanOp[];
  applied_ops: PlanOp[] | null;
  coach_note: string;
  conflict: string | null;
  source: string;
};

function Line({ v }: { v: { date: string; title: string; minutes: number | null } | null }) {
  if (!v) return <Text style={[type.small, { fontStyle: "italic" }]}>—</Text>;
  return (
    <Text style={type.small}>
      {weekdayName(v.date)} · {v.title} {v.minutes ? `· ${v.minutes} dk` : ""}
    </Text>
  );
}

export function ProposalCard({ proposalId, onChanged }: { proposalId: string; onChanged?: () => void }) {
  const [p, setP] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("plan_proposals")
      .select("id, summary, status, ops, applied_ops, coach_note, conflict, source")
      .eq("id", proposalId)
      .maybeSingle();
    setP(data as Proposal | null);
  }, [proposalId]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`proposal-${proposalId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "plan_proposals", filter: `id=eq.${proposalId}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [proposalId, load]);

  if (!p) return null;
  const decide = async (approve: boolean) => {
    setBusy(true);
    const { error } = await supabase.rpc("cita_student_decide", { p_proposal: p.id, p_approve: approve });
    setBusy(false);
    if (error) Alert.alert("Çita", "Karar kaydedilemedi, tekrar dene. (Tekrar denemek güvenli.)");
    await load();
    onChanged?.();
  };

  const rows = describeOps(p.status === "applied" && p.applied_ops ? p.applied_ops : p.ops);
  return (
    <Card accent={p.status === "pending_student"} style={{ marginTop: space(2) }}>
      <Text style={type.label}>Program önerisi · {PROPOSAL_STATUS_LABEL[p.status]}</Text>
      <Text style={[type.h3, { marginVertical: space(1) }]}>{p.summary}</Text>
      {rows.map((r, i) => (
        <View key={i} style={{ marginBottom: space(2) }}>
          <Text style={{ color: colors.orangeSoft, fontWeight: "700", fontSize: 12 }}>{r.kind}</Text>
          <Row>
            <Text style={type.small}>Önce:</Text>
            <Line v={r.before} />
          </Row>
          <Row>
            <Text style={type.small}>Sonra:</Text>
            <Line v={r.after} />
          </Row>
        </View>
      ))}
      {p.coach_note ? <Text style={type.small}>Koç notu: {p.coach_note}</Text> : null}
      {p.status === "pending_coach" ? <Text style={type.small}>Koçun onaylayana kadar mevcut programın geçerli.</Text> : null}
      {p.status === "stale" ? <Text style={type.small}>Program bu arada değiştiği için uygulanmadı; hiçbir şey değişmedi. Çita'dan yeni öneri iste.</Text> : null}
      {p.status === "pending_student" ? (
        <Row>
          <Button small title="Onayla" loading={busy} onPress={() => decide(true)} />
          <Button small kind="ghost" title="Vazgeç" disabled={busy} onPress={() => decide(false)} />
        </Row>
      ) : null}
    </Card>
  );
}
