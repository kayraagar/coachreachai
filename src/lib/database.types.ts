// Elle yazılmış, şemayı (supabase/schema.sql) yansıtan tip tanımları.
// Supabase CLI kurulursa `supabase gen types typescript` ile otomatik
// üretilenle değiştirilebilir; işlevsel olarak eşdeğerdir.

export type Role = "coach" | "student";
export type ExamType = "TYT" | "AYT" | "Branş";
export type GoalType =
  | "daily_questions"
  | "weekly_questions"
  | "exam_net"
  | "subject_net";
export type Period = "daily" | "weekly" | "monthly";
export type Mood = "great" | "good" | "neutral" | "bad" | "struggling";

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  email: string;
  coach_id: string | null;
  target_exam_date: string | null;
  created_at: string;
}

export interface Subject {
  id: string;
  name: string;
  category: "TYT" | "AYT";
  sort_order: number;
}

export interface Topic {
  id: string;
  subject_id: string;
  name: string;
  sort_order: number;
}

export interface DailyLog {
  id: string;
  student_id: string;
  log_date: string;
  subject_id: string;
  topic_id: string | null;
  correct_count: number;
  wrong_count: number;
  blank_count: number;
  duration_minutes: number | null;
  created_at: string;
}

export interface Exam {
  id: string;
  student_id: string;
  exam_date: string;
  name: string;
  exam_type: ExamType;
  created_at: string;
}

export interface ExamResult {
  id: string;
  exam_id: string;
  subject_id: string;
  correct_count: number;
  wrong_count: number;
  blank_count: number;
  net: number;
}

export interface Goal {
  id: string;
  student_id: string;
  created_by: string;
  goal_type: GoalType;
  subject_id: string | null;
  target_value: number;
  period: Period;
  start_date: string;
  end_date: string | null;
  active: boolean;
  created_at: string;
}

export interface StudyPlanItem {
  id: string;
  student_id: string;
  plan_date: string;
  subject_id: string | null;
  topic_id: string | null;
  title: string;
  planned_minutes: number | null;
  completed: boolean;
  actual_minutes: number | null;
  created_at: string;
}

export interface Note {
  id: string;
  student_id: string;
  author_id: string;
  note_date: string;
  mood: Mood | null;
  content: string;
  created_at: string;
}

export type RoutineStatus = "good" | "ok" | "bad";
export type SessionStatus = "draft" | "shared";
export type ActionCategory = "genel" | "okul" | "ortam" | "rutin" | "ders" | "deneme";

/** Haftalık Görüşme Ajandası — form maddeleriyle birebir eşleşir. */
export interface WeeklySession {
  id: string;
  student_id: string;
  coach_id: string;
  week_no: number;
  meeting_date: string;
  duration_minutes: number | null;

  // 1) Geçen hafta değerlendirmesi
  total_questions: number | null;
  total_study_minutes: number | null;
  adherence_pct: number | null;
  adherence_note: string;

  // 2) Net ve performans analizi
  tyt_net: number | null;
  ayt_net: number | null;
  net_note: string;
  weak_topics: string;
  slow_question_types: string;

  // 3) Artı / eksi
  positives: string;
  negatives: string;

  // 4) Uzun vadeli planlama
  missing_areas: string;
  recommendations: string;
  target_net_range: string;
  roadmap: string;

  // 5) Okul ve çalışma ortamı aksiyonları
  school_action: string;
  conflict_action: string;
  environment_action: string;
  other_action: string;

  // 6) Genel rutinler
  sleep_status: RoutineStatus | null;
  screen_status: RoutineStatus | null;
  nutrition_status: RoutineStatus | null;
  break_status: RoutineStatus | null;
  routines_note: string;

  // 7) Sonraki hafta planı
  main_focus: string;
  planned_exams: string;

  // 8) Motivasyon ve genel notlar
  mood: Mood | null;
  coach_feedback: string;
  open_item: string;

  status: SessionStatus;
  created_at: string;
  updated_at: string;
}

export interface SessionAction {
  id: string;
  session_id: string;
  student_id: string;
  title: string;
  category: ActionCategory;
  done: boolean;
  done_at: string | null;
  sort_order: number;
  created_at: string;
}

export interface StudySession {
  id: string;
  student_id: string;
  subject_id: string | null;
  topic_id: string | null;
  started_at: string;
  ended_at: string | null;
  minutes: number | null;
  note: string;
  created_at: string;
}

export interface DailyRoutine {
  id: string;
  student_id: string;
  log_date: string;
  sleep_hours: number | null;
  screen_minutes: number | null;
  nutrition_ok: boolean;
  breaks_ok: boolean;
  mood: Mood | null;
  note: string;
  created_at: string;
}

type TableDef<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
};

export interface Database {
  public: {
    Tables: {
      profiles: TableDef<
        Profile,
        Partial<Profile> & { id: string; role: Role; email: string }
      >;
      subjects: TableDef<Subject, Partial<Subject> & { name: string; category: "TYT" | "AYT" }>;
      topics: TableDef<Topic, Partial<Topic> & { subject_id: string; name: string }>;
      daily_logs: TableDef<
        DailyLog,
        Omit<DailyLog, "id" | "created_at"> & { id?: string }
      >;
      exams: TableDef<Exam, Omit<Exam, "id" | "created_at"> & { id?: string }>;
      exam_results: TableDef<
        ExamResult,
        Omit<ExamResult, "id" | "net"> & { id?: string }
      >;
      goals: TableDef<Goal, Omit<Goal, "id" | "created_at"> & { id?: string }>;
      study_plan_items: TableDef<
        StudyPlanItem,
        Omit<StudyPlanItem, "id" | "created_at"> & { id?: string }
      >;
      notes: TableDef<Note, Omit<Note, "id" | "created_at"> & { id?: string }>;
      weekly_sessions: TableDef<
        WeeklySession,
        Partial<Omit<WeeklySession, "id" | "created_at" | "updated_at">> & {
          student_id: string;
          coach_id: string;
          week_no: number;
          meeting_date: string;
        }
      >;
      session_actions: TableDef<
        SessionAction,
        Omit<SessionAction, "id" | "created_at" | "done_at"> & {
          id?: string;
          done_at?: string | null;
        }
      >;
      study_sessions: TableDef<
        StudySession,
        Omit<StudySession, "id" | "created_at"> & { id?: string }
      >;
      daily_routines: TableDef<
        DailyRoutine,
        Omit<DailyRoutine, "id" | "created_at"> & { id?: string }
      >;
    };
  };
}
