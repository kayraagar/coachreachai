#!/usr/bin/env node
/**
 * Çita uçtan uca senaryosu (HTTP). GERÇEK bir Supabase GELİŞTİRME projesine ve
 * çalışan Next sunucusuna karşı koşar; canlı/üretim projesinde KOŞMA.
 *
 *   CITA_E2E_SUPABASE_URL, CITA_E2E_ANON_KEY, CITA_E2E_SERVICE_KEY (yalnızca test
 *   kullanıcılarını oluşturmak/temizlemek için), CITA_E2E_API (ör. http://localhost:3000)
 *   Sunucu: CITA_AI_PROVIDER=test, CITA_BILLING_PROVIDER=test
 *
 *   node scripts/e2e-cita.mjs
 *
 * Kapsam: YKS ve LGS hesapsız önizleme → kayıt → aktarım (idempotent), sohbet
 * (idempotent), öneri onayı (ücretsiz atomik), foto kotası (3 hak, tekrar
 * deneme, okunamayan iade), Çita+ denemesi, defter, tekrar, Bire Bir yükseltme
 * (tek yenileme), koç ataması ve koç onayı, veli bağlantısı ve özet, yetkisiz erişim.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const URL_ = process.env.CITA_E2E_SUPABASE_URL;
const ANON = process.env.CITA_E2E_ANON_KEY;
const SERVICE = process.env.CITA_E2E_SERVICE_KEY;
const API = (process.env.CITA_E2E_API ?? "http://localhost:3000").replace(/\/$/, "");
if (!URL_ || !ANON || !SERVICE) {
  console.error("CITA_E2E_SUPABASE_URL / CITA_E2E_ANON_KEY / CITA_E2E_SERVICE_KEY gerekli (geliştirme projesi).");
  process.exit(2);
}
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const run = `e2e${Date.now()}`;
const created = [];
let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; console.log("ok -", msg); };

async function user(role, meta = {}) {
  const email = `${run}-${role}-${created.length}@example.test`;
  const password = `Pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role, ...meta } });
  if (error) throw error;
  created.push(data.user.id);
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  return { id: data.user.id, client, token: s.data.session.access_token };
}

async function call(u, path, { method, body, key, form } = {}) {
  const headers = { Authorization: `Bearer ${u.token}` };
  if (key) headers["Idempotency-Key"] = key;
  if (!form) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, { method: method ?? (body || form ? "POST" : "GET"), headers, body: form ?? (body ? JSON.stringify(body) : undefined) });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

function jpeg(bytes) {
  return new Blob([new Uint8Array(bytes).fill(7)], { type: "image/jpeg" });
}

try {
  // --- YKS öğrenci: önizleme planı → aktarım ---------------------------------
  const { generateWeekPlan, planSummary, suggestedWeeklyTarget, addDays, istanbulDate } = await import("../packages/cita-core/src/index.ts");
  const s = await user("student", { track: "YKS" });
  const profile = { track: "YKS", field: "SAY", focus: "TYT+AYT", goal: "Tıp", level: "orta", weakSubjects: ["Matematik"], availability: [90, 90, 90, 90, 90, 240, 0] };
  const start = addDays(istanbulDate(), 1);
  const plan = generateWeekPlan(profile, start);
  const reqId = randomUUID();
  const args = { p_request_id: reqId, p_start: start, p_profile: profile, p_tasks: plan.tasks.map((t) => ({ date: t.date, subject: t.subject, kind: t.kind, title: t.title, minutes: t.minutes })), p_target_minutes: suggestedWeeklyTarget(planSummary(plan).totalMinutes) };
  const imp1 = await s.client.rpc("cita_import_onboarding", args);
  const imp2 = await s.client.rpc("cita_import_onboarding", args);
  ok(imp1.data.status === "imported" && imp2.data.status === "already_imported", "YKS onboarding import idempotent");

  // --- sohbet + öneri --------------------------------------------------------
  const cid = randomUUID();
  const c1 = await call(s, "/api/cita/chat", { body: { clientId: cid, text: "Bugün 30 dakikam var" } });
  const c2 = await call(s, "/api/cita/chat", { body: { clientId: cid, text: "Bugün 30 dakikam var" } });
  ok(c1.status === 200 && c2.json.replayed && c2.json.reply.id === c1.json.reply.id, "chat retry returns same reply");
  ok(c1.json.reply.provider === "test", "test provider labelled");
  const pid = c1.json.reply.card?.proposalId;
  ok(Boolean(pid), "plan change becomes a proposal card, not a direct write");
  const d = await s.client.rpc("cita_student_decide", { p_proposal: pid, p_approve: true });
  ok(d.data.status === "applied", "free student approval applied");

  // --- foto kotası -----------------------------------------------------------
  const keys = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const up = (k, size) => { const f = new FormData(); f.append("image", jpeg(size), "q.jpg"); return call(s, "/api/cita/photo", { form: f, key: k }); };
  const p1 = await up(keys[0], 5000);
  ok(p1.status === 200 && p1.json.request.status === "hint" && p1.json.quota.used === 1, "photo hint consumes 1");
  const p1b = await up(keys[0], 5000);
  ok(p1b.json.replayed && p1b.json.quota.used === 1, "photo retry does not consume");
  const unread = await up(keys[1], 100);
  ok(unread.json.request.status === "unreadable" && unread.json.quota.used === 1, "unreadable photo refunds");
  const sol = await call(s, `/api/cita/photo/${p1.json.request.id}/solution`, { body: {} });
  const q = await call(s, "/api/cita/photo");
  ok(sol.status === 200 && q.json.quota.used === 1, "full solution uses same allowance");
  await up(keys[2], 5000); await up(keys[3], 5000);
  const over = await up(randomUUID(), 5000);
  ok(over.status === 429, "4th photo blocked for free tier");
  const nb = await call(s, "/api/cita/notebook", { body: { photoRequestId: p1.json.request.id, subject: "Matematik" } });
  ok(nb.status === 402, "notebook requires Çita+");

  // --- Çita+ denemesi, defter, tekrar ---------------------------------------
  const prev = await call(s, "/api/cita/analysis-preview");
  ok(["insufficient", "study_time", "exam_subjects", "mistake_pattern"].includes(prev.json.preview.kind), "analysis preview from own data");
  const intent = await call(s, "/api/cita/billing", { body: { product: "cita_plus_monthly", trial: true } });
  ok(intent.json.terms.length >= 3 && intent.json.displayPrice?.startsWith("TEST"), "terms shown before purchase");
  const tr = await call(s, "/api/cita/billing/test", { body: { intentId: intent.json.intentId, action: "start_trial", eventId: `evt-${randomUUID()}` } });
  ok(tr.json.result.ok, "trial started");
  const nb2 = await call(s, "/api/cita/notebook", { body: { photoRequestId: p1.json.request.id, subject: "Matematik", errorType: "islem", confirmed: true } });
  ok(nb2.status === 200, "plus user saves to notebook");
  const rv = await call(s, "/api/cita/review", { body: { mistakeId: nb2.json.mistake.id }, key: `review-${randomUUID()}` });
  ok(rv.status === 200 && rv.json.session.items.length === 3, "review: original + 2 verified similar");
  ok(!("answer" in rv.json.session.items[1]), "answers hidden until completion");

  // --- Bire Bir yükseltme + koç --------------------------------------------
  const coach = await user("coach");
  const adminU = await user("coach");
  await admin.from("profiles").update({ is_admin: true }).eq("id", adminU.id);
  const up2 = await call(s, "/api/cita/billing", { body: { product: "cita_birebir_monthly" } });
  ok(up2.json.terms.some((t) => t.includes("aynı anda yenilenmez")), "upgrade terms explain single renewal");
  await call(s, "/api/cita/billing/test", { body: { intentId: up2.json.intentId, action: "purchase", eventId: `evt-${randomUUID()}` } });
  const st = await call(s, "/api/cita/billing");
  ok(st.json.tier === "bire_bir" && st.json.subscriptions.filter((x) => x.will_renew).length === 1, "upgrade leaves exactly one renewing subscription");
  const as = await adminU.client.rpc("cita_admin_assign_coach", { p_student: s.id, p_coach: coach.id });
  ok(as.data === "ok", "admin assigns coach");
  const c3 = await call(s, "/api/cita/chat", { body: { clientId: randomUUID(), text: "Bugün 40 dakikam var" } });
  const d2 = await s.client.rpc("cita_student_decide", { p_proposal: c3.json.reply.card.proposalId, p_approve: true });
  ok(d2.data.status === "pending_coach", "bire bir approval goes to coach");
  const d3 = await coach.client.rpc("cita_coach_decide", { p_proposal: d2.data.id, p_decision: "approve" });
  ok(d3.data.status === "applied", "coach approves and plan updates");

  // --- LGS + veli -----------------------------------------------------------
  const l = await user("student", { track: "LGS" });
  const par = await user("parent");
  const other = await user("parent");
  const code = (await l.client.rpc("cita_create_parent_code")).data.code;
  ok((await par.client.rpc("cita_redeem_parent_code", { p_code: code })).data === "ok", "parent links");
  const sum = await par.client.rpc("cita_parent_weekly_summary", { p_student: l.id, p_week_start: (await import("../packages/cita-core/src/index.ts")).weekStart(istanbulDate()) });
  ok(sum.data && !("chat" in sum.data), "parent sees summary only");
  ok((await par.client.from("chat_messages").select("id")).data.length === 0, "parent cannot read chats");
  const pi = await call(par, "/api/cita/billing", { body: { product: "cita_plus_monthly", studentId: l.id } });
  ok(pi.status === 200, "parent can start purchase for linked student");
  const bad = await call(other, "/api/cita/billing", { body: { product: "cita_plus_monthly", studentId: l.id } });
  ok(bad.status === 403, "unlinked parent cannot buy for student");
  const pp = await call(par, "/api/cita/billing/test", { body: { intentId: pi.json.intentId, action: "purchase", eventId: `evt-${randomUUID()}` } });
  ok(pp.json.result.ok, "parent purchase recorded");
  ok((await l.client.rpc("cita_my_tier")).data === "plus", "purchase bound to correct student");

  console.log(`\n${passed} assertions passed`);
} finally {
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => undefined);
}
