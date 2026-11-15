import { test } from "node:test";
import assert from "node:assert/strict";
import {
  istanbulDate, addDays, isoWeekday, weekStart,
  validateExam, computeNet, netSeries, subjectWeakness, EXAM_RULES,
  generateWeekPlan, parsePlanEdit, applyPlanEdits, subjectPool, validateProfile, type OnboardingProfile,
  computeStreak, evaluateBadges, weeklyTargetStatus,
  effectiveTier, applyBillingEvent, planUpgrade, trialEligible, renewingCount, hasFeature, type Subscription,
  validateOps, checkFresh,
  recurringPatterns, analysisPreview, validateReviewItem, nextReviewDate, type MistakeRecord,
} from "../src/index.ts";

test("Istanbul day boundary: 21:00 UTC is next day in Istanbul (UTC+3)", () => {
  assert.equal(istanbulDate(new Date("2026-11-14T20:59:00Z")), "2026-11-14");
  assert.equal(istanbulDate(new Date("2026-11-14T21:00:00Z")), "2026-11-15");
  assert.equal(isoWeekday("2026-11-16"), 1);
  assert.equal(weekStart("2026-11-15"), "2026-11-09");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("exam question totals match official structure", () => {
  const sum = (t: "YKS" | "LGS", type: string) =>
    EXAM_RULES[t].find((r) => r.type === type)!.subjects.reduce((s, x) => s + x.questions, 0);
  assert.equal(sum("YKS", "TYT"), 120);
  assert.equal(sum("YKS", "AYT"), 160);
  assert.equal(sum("YKS", "YDT"), 80);
  assert.equal(sum("LGS", "LGS"), 90);
});

test("exam validation enforces totals, subjects and penalties", () => {
  const ok = validateExam("YKS", "TYT", [{ subject: "Matematik", correct: 30, wrong: 8 }]);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.rows[0].blank, 2);
    assert.equal(ok.rows[0].net, 28);
  }
  assert.equal(validateExam("YKS", "TYT", [{ subject: "Fizik", correct: 6, wrong: 2 }]).ok, false);
  assert.equal(validateExam("YKS", "TYT", [{ subject: "Edebiyat", correct: 1, wrong: 0 }]).ok, false);
  assert.equal(validateExam("LGS", "Sayısal", [{ subject: "Matematik", correct: 10, wrong: 3, blank: 2 }]).ok, false);
  const lgs = validateExam("LGS", "Sayısal", [{ subject: "Matematik", correct: 15, wrong: 3, blank: 2 }]);
  assert.ok(lgs.ok && lgs.rows[0].net === 14);
  assert.equal(validateExam("YKS", "LGS", []).ok, false);
  assert.equal(validateExam("YKS", "Branş", [{ subject: "Matematik", correct: 20, wrong: 4 }], 40).ok, true);
  assert.equal(validateExam("YKS", "Branş", [{ subject: "Matematik", correct: 20, wrong: 4 }]).ok, false);
  assert.equal(computeNet(10, 3, 3), 9);
  assert.equal(validateExam("YKS", "TYT", [{ subject: "Türkçe", correct: -1, wrong: 0 }]).ok, false);
});

test("net series never mixes exam types; branch compared per subject", () => {
  const mk = (id: string, type: string, date: string, subject: string, c: number, w: number) => ({
    id, exam_type: type, exam_date: date, name: id,
    results: [{ subject, correct: c, wrong: w, blank: 0, net: c - w / 4 }],
  });
  const series = netSeries([
    mk("a", "TYT", "2026-10-01", "Matematik", 20, 4),
    mk("b", "AYT", "2026-10-02", "Matematik (AYT)", 10, 4),
    mk("c", "TYT", "2026-10-08", "Matematik", 24, 4),
    mk("d", "Branş", "2026-10-09", "Fizik", 5, 0),
    mk("e", "Branş", "2026-10-10", "Kimya", 5, 0),
  ]);
  const tyt = series.find((s) => s.key === "TYT")!;
  assert.equal(tyt.points.length, 2);
  assert.equal(tyt.delta, 4);
  assert.equal(series.find((s) => s.key === "AYT")!.delta, null);
  assert.equal(series.filter((s) => s.key.startsWith("Branş")).length, 2);
  const weak = subjectWeakness(
    [mk("a", "TYT", "2026-10-01", "Matematik", 20, 4), mk("c", "TYT", "2026-10-08", "Matematik", 24, 4)],
    "TYT",
  );
  assert.equal(weak[0].level, "subject");
});

const yks: OnboardingProfile = {
  track: "YKS", field: "SAY", focus: "TYT+AYT", goal: "Tıp", level: "orta",
  weakSubjects: ["Matematik"], availability: [120, 120, 90, 120, 60, 240, 0],
};

test("plan generator: deterministic full week, rest days respected, minutes fit availability", () => {
  const a = generateWeekPlan(yks, "2026-11-16");
  const b = generateWeekPlan(yks, "2026-11-16");
  assert.deepEqual(a, b);
  assert.deepEqual(a.restDays, ["2026-11-22"]);
  for (let d = 0; d < 7; d++) {
    const date = addDays("2026-11-16", d);
    const mins = a.tasks.filter((t) => t.date === date).reduce((s, t) => s + t.minutes, 0);
    assert.equal(mins, yks.availability[d], `day ${d}`);
  }
  assert.ok(a.tasks.some((t) => t.kind === "deneme"), "weekly exam on long day");
  assert.ok(a.tasks.every((t) => t.title.length > 0 && t.minutes > 0));
  assert.equal(new Set(a.tasks.map((t) => t.key)).size, a.tasks.length);
});

test("plan generator LGS uses LGS subjects only", () => {
  const p = generateWeekPlan({ track: "LGS", goal: "Fen lisesi", level: "başlangıç", weakSubjects: [], availability: [60, 60, 60, 60, 60, 180, 0] }, "2026-11-16");
  const allowed = new Set(["Matematik", "Fen Bilimleri", "Türkçe", "T.C. İnkılap Tarihi", "Din Kültürü", "Yabancı Dil"]);
  for (const t of p.tasks) if (t.subject) assert.ok(allowed.has(t.subject), t.subject);
  assert.ok(p.tasks.some((t) => t.kind === "deneme" && t.minutes === 155));
});

test("plan edit parser: Turkish day/duration/subject requests", () => {
  const pool = subjectPool(yks);
  assert.deepEqual(parsePlanEdit("Cumartesi çalışamam", pool).edits, [{ type: "set_day_minutes", days: [5], minutes: 0 }]);
  assert.deepEqual(parsePlanEdit("pazar 2 saat çalışabilirim", pool).edits, [{ type: "set_day_minutes", days: [6], minutes: 120 }]);
  assert.deepEqual(parsePlanEdit("pazartesi 1,5 saat", pool).edits, [{ type: "set_day_minutes", days: [0], minutes: 90 }]);
  assert.ok(parsePlanEdit("matematiği artır", pool).edits.some((e) => e.type === "boost_subject" && e.subject === "Matematik"));
  assert.equal(parsePlanEdit("hava güzel", pool).understood, false);
  const plan = generateWeekPlan(applyPlanEdits(yks, parsePlanEdit("Cumartesi çalışamam", pool).edits), "2026-11-16");
  assert.ok(plan.restDays.includes("2026-11-21"));
  assert.equal(plan.tasks.filter((t) => t.date === "2026-11-21").length, 0);
  assert.ok(validateProfile({ ...yks, availability: [0, 0, 0, 0, 0, 0, 0] }).length > 0);
});

test("streak: rest days neutral, today incomplete does not break", () => {
  const days = [
    { date: "2026-11-09", planned: 3, completed: 1 },
    { date: "2026-11-10", planned: 3, completed: 2 },
    { date: "2026-11-11", planned: 0, completed: 0 },
    { date: "2026-11-12", planned: 2, completed: 1 },
    { date: "2026-11-13", planned: 2, completed: 0 },
  ];
  assert.deepEqual(computeStreak(days, "2026-11-13"), { current: 3, best: 3 });
  assert.deepEqual(computeStreak(days, "2026-11-14"), { current: 0, best: 3 });
  assert.deepEqual(computeStreak([], "2026-11-14"), { current: 0, best: 0 });
});

test("badges come from real events with evidence", () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ date: addDays("2026-11-02", i % 7), completed: i < 8 }));
  const targets = ["2026-10-19", "2026-10-26", "2026-11-02"].map((w) => ({ weekStart: w, targetMinutes: 100 }));
  const minutes = targets.map((t) => ({ date: addDays(t.weekStart, 2), minutes: 120 }));
  const awards = evaluateBadges({ today: "2026-11-14", exams: [{ id: "x", exam_date: "2026-11-01" }], firstPlanDate: "2026-11-02", planItems: items, targets, minutes });
  assert.deepEqual(awards.map((a) => a.key).sort(), ["first_exam", "first_week", "three_weekly_goals"]);
  assert.equal(evaluateBadges({ today: "2026-11-05", exams: [], firstPlanDate: "2026-11-02", planItems: items, targets: [], minutes: [] }).length, 0);
  assert.equal(weeklyTargetStatus({ weekStart: "2026-11-09", targetMinutes: 100 }, [{ date: "2026-11-10", minutes: 50 }]).pct, 50);
});

test("entitlements: trial, cancel keeps access to period end, refund revokes, upgrade avoids double renewal", () => {
  const now = new Date("2026-11-14T10:00:00Z");
  let s = applyBillingEvent(null, { type: "trial_started", tier: "plus", at: "2026-11-10T10:00:00Z", days: 14 })!;
  assert.equal(effectiveTier([s], now), "plus");
  assert.equal(trialEligible({ trialUsed: true, subs: [], now }), false);
  assert.equal(trialEligible({ trialUsed: false, subs: [s], now }), false);
  s = applyBillingEvent(s, { type: "cancel_auto_renew", at: "2026-11-12T00:00:00Z" })!;
  assert.equal(effectiveTier([s], now), "plus");
  assert.equal(effectiveTier([s], new Date("2026-11-25T00:00:00Z")), "free");
  assert.equal(effectiveTier([applyBillingEvent(s, { type: "refunded", at: "2026-11-13T00:00:00Z" })!], now), "free");
  const plus: Subscription = { tier: "plus", status: "active", expiresAt: "2026-12-01T00:00:00Z", willRenew: true };
  assert.equal(planUpgrade([plus], "bire_bir", now).kind, "store_upgrade");
  const after = [{ ...plus, willRenew: false, status: "canceled" as const }, { tier: "bire_bir" as const, status: "active" as const, expiresAt: "2026-12-14T00:00:00Z", willRenew: true }];
  assert.equal(renewingCount(after, now), 1);
  assert.equal(effectiveTier(after, now), "bire_bir");
  assert.equal(hasFeature("free", "notebook"), false);
  assert.equal(hasFeature("bire_bir", "notebook"), true);
  const grace = applyBillingEvent(plus, { type: "billing_issue", at: "2026-12-01T00:00:00Z", graceDays: 16 })!;
  assert.equal(effectiveTier([grace], new Date("2026-12-10T00:00:00Z")), "plus");
});

test("proposal ops validation and stale detection", () => {
  const ops = [
    { op: "update", id: "r1", before: { date: "2026-11-16", title: "Mat", minutes: 50 }, after: { date: "2026-11-16", title: "Mat", minutes: 30 } },
    { op: "add", after: { date: "2026-11-16", title: "Yanlış analizi", minutes: 20 } },
  ];
  const v = validateOps(ops);
  assert.ok(v.ok);
  if (!v.ok) return;
  assert.equal(checkFresh([{ id: "r1", date: "2026-11-16", title: "Mat", minutes: 50 }], v.ops).fresh, true);
  assert.equal(checkFresh([{ id: "r1", date: "2026-11-16", title: "Mat", minutes: 40 }], v.ops).fresh, false);
  assert.equal(checkFresh([], v.ops).fresh, false);
  assert.equal(validateOps([{ op: "drop" }]).ok, false);
  assert.equal(validateOps([ops[0], ops[0]]).ok, false);
});

test("mistake patterns need confirmed evidence; preview never fabricates", () => {
  const m = (id: string, et: MistakeRecord["error_type"], confirmed = true, topic: string | null = "Problemler"): MistakeRecord => ({
    id, created_at: "2026-11-10", subject: "Matematik", topic, error_type: et, error_type_confirmed: confirmed,
  });
  assert.equal(recurringPatterns([m("1", "islem"), m("2", "islem"), m("3", "islem", false)]).length, 0);
  const p = recurringPatterns([m("1", "islem"), m("2", "islem"), m("3", "islem", true, "Sayılar")]);
  assert.equal(p.length, 1);
  assert.equal(p[0].topic, null);
  assert.deepEqual(p[0].evidenceIds, ["1", "2", "3"]);
  assert.equal(analysisPreview({ mistakes: [], exams: [], studyMinutes: [] }).kind, "insufficient");
  assert.equal(analysisPreview({ mistakes: [m("1", "islem"), m("2", "islem"), m("4", "islem")], exams: [], studyMinutes: [] }).kind, "mistake_pattern");
  const sm = ["2026-11-10", "2026-11-11", "2026-11-12"].map((date) => ({ date, minutes: 60, subject: "Fizik" }));
  assert.equal(analysisPreview({ mistakes: [], exams: [], studyMinutes: sm }).kind, "study_time");
});

test("review items validated and next review scheduled", () => {
  const good = { kind: "similar" as const, prompt: "2x + 3 = 11 ise x kaçtır?", choices: ["2", "3", "4", "5"], answer: "4", solutionSteps: ["2x = 8", "x = 4"], skill: "birinci dereceden denklem" };
  assert.deepEqual(validateReviewItem(good), []);
  assert.ok(validateReviewItem({ ...good, answer: "7" }).length > 0);
  assert.ok(validateReviewItem({ ...good, solutionSteps: ["x=4"] }).length > 0);
  assert.equal(nextReviewDate("2026-11-14", [0, 1, 2].map((i) => ({ itemIndex: i, correct: true, usedHint: false, independentSteps: 2 }))).intervalDays, 7);
  const some = nextReviewDate("2026-11-14", [
    { itemIndex: 0, correct: true, usedHint: true, independentSteps: 1 },
    { itemIndex: 1, correct: false, usedHint: false, independentSteps: 0 },
    { itemIndex: 2, correct: true, usedHint: false, independentSteps: 2 },
  ]);
  assert.equal(some.intervalDays, 1);
});
