import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, istanbulDate, weekStart, weekdayName, validateOps, type PlanOp } from "@cita/core";
import type { StudentContext, WebResult } from "./ai";
import type { ChatReply } from "./ai/schemas";
import { aiProvider } from "./ai";

/** Öğrencinin kendi oturumuyla (RLS) okunan, AI'a giden asgari bağlam. */
export async function loadStudentContext(db: SupabaseClient, studentId: string): Promise<StudentContext> {
  const today = istanbulDate();
  const ws = weekStart(today);
  const [prof, week, mins, target, exams, history] = await Promise.all([
    db.from("profiles").select("full_name, track, yks_field, yks_focus, goal_text, level, weak_subjects, availability").eq("id", studentId).single(),
    db.from("study_plan_items").select("id, plan_date, title, planned_minutes, completed").eq("student_id", studentId)
      .gte("plan_date", ws).lte("plan_date", addDays(ws, 13)).order("plan_date").order("sort_order"),
    db.from("cita_study_minutes").select("minutes").eq("student_id", studentId).gte("day", addDays(today, -6)).lte("day", today),
    db.from("weekly_targets").select("target_minutes").eq("student_id", studentId).eq("week_start", ws).maybeSingle(),
    db.from("exams").select("exam_type, exam_date, exam_results(net)").eq("student_id", studentId).order("exam_date", { ascending: false }).limit(8),
    db.from("chat_messages").select("role, content").eq("student_id", studentId).order("created_at", { ascending: false }).limit(12),
  ]);
  const p = (prof.data ?? {}) as Record<string, unknown>;
  return {
    name: (p.full_name as string) || "",
    track: (p.track as "YKS" | "LGS") ?? "YKS",
    field: (p.yks_field as string) ?? null,
    focus: (p.yks_focus as string) ?? null,
    goal: (p.goal_text as string) ?? "",
    level: (p.level as string) ?? null,
    weakSubjects: (p.weak_subjects as string[]) ?? [],
    availability: (p.availability as number[]) ?? null,
    today,
    todayName: weekdayName(today),
    week: (week.data ?? []).map((r) => ({ id: r.id, date: r.plan_date, title: r.title, minutes: r.planned_minutes, completed: r.completed })),
    minutesLast7: (mins.data ?? []).reduce((s, r) => s + (r.minutes ?? 0), 0),
    weeklyTarget: target.data?.target_minutes ?? null,
    exams: (exams.data ?? []).map((e) => ({
      type: e.exam_type,
      date: e.exam_date,
      net: Math.round(((e.exam_results as { net: number }[]) ?? []).reduce((s, r) => s + Number(r.net), 0) * 100) / 100,
    })),
    history: ((history.data ?? []) as { role: "user" | "assistant"; content: string }[]).reverse(),
  };
}

/**
 * Modelin önerdiği değişikliği güvenli ops'a çevirir: update/remove için
 * `before` değeri modelden DEĞİL veritabanındaki gerçek satırdan alınır;
 * listede olmayan kimlikler ve geçersiz alanlar atılır.
 */
export function toSafeOps(ctx: StudentContext, change: NonNullable<ChatReply["planChange"]>): PlanOp[] | null {
  const byId = new Map(ctx.week.map((w) => [w.id, w]));
  const horizon = addDays(ctx.today, 13);
  const ops: PlanOp[] = [];
  for (const o of change.ops) {
    const minutes = o.minutes === null ? null : Math.max(5, Math.min(240, Math.round(o.minutes)));
    const after = { date: o.date, title: o.title.trim().slice(0, 300), minutes };
    if (o.op === "add") {
      if (o.date < ctx.today || o.date > horizon) continue;
      ops.push({ op: "add", after });
      continue;
    }
    const cur = o.id ? byId.get(o.id) : undefined;
    if (!cur || cur.completed) continue;
    const before = { date: cur.date, title: cur.title, minutes: cur.minutes };
    if (o.op === "remove") ops.push({ op: "remove", id: cur.id, before });
    else if (o.date >= ctx.today && o.date <= horizon) ops.push({ op: "update", id: cur.id, before, after });
  }
  const v = validateOps(ops);
  return v.ok ? v.ops : null;
}

export type ResourceCard = {
  source: "catalog" | "web";
  provider: string;
  items: { title: string; url: string | null; type?: string; level?: string; sourceName?: string; lastChecked?: string }[];
};

/** Önce ekibin onayladığı katalog; uygun eşleşme yoksa sunucu üzerinden web araması. */
export async function findResources(db: SupabaseClient, track: "YKS" | "LGS", query: { subject: string; topic: string | null; level: string | null }): Promise<ResourceCard> {
  let q = db.from("resources").select("title, url, type, level, source_name, last_checked, subject, topic").eq("approved", true).eq("exam", track);
  if (query.subject && query.subject !== "Genel") q = q.in("subject", [query.subject, "Genel"]);
  const { data } = await q.limit(30);
  const rows = (data ?? []).sort((a, b) => {
    const score = (r: typeof a) => (r.subject === query.subject ? 2 : 0) + (query.topic && r.topic === query.topic ? 2 : 0) + (query.level && r.level === query.level ? 1 : 0);
    return score(b) - score(a);
  });
  const specific = rows.filter((r) => r.subject === query.subject);
  if (specific.length) {
    return {
      source: "catalog",
      provider: "catalog",
      items: specific.slice(0, 4).map((r) => ({ title: r.title, url: r.url, type: r.type, level: r.level, sourceName: r.source_name, lastChecked: r.last_checked })),
    };
  }
  const ai = aiProvider();
  let web: WebResult[] = [];
  try {
    web = await ai.webSearch(`${track} ${query.subject}${query.topic ? ` ${query.topic}` : ""} konu anlatımı soru çözümü`);
  } catch {
    web = [];
  }
  return { source: "web", provider: ai.name, items: web.map((w) => ({ title: w.title, url: w.url })) };
}
