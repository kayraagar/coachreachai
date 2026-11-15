import type { ChatReply, PhotoHint, PhotoSolution, ReviewItems } from "./schemas";

export type StudentContext = {
  name: string;
  track: "YKS" | "LGS";
  field: string | null;
  focus: string | null;
  goal: string;
  level: string | null;
  weakSubjects: string[];
  availability: number[] | null;
  today: string;
  todayName: string;
  week: { id: string; date: string; title: string; minutes: number | null; completed: boolean }[];
  minutesLast7: number;
  weeklyTarget: number | null;
  exams: { type: string; date: string; net: number }[];
  history: { role: "user" | "assistant"; content: string }[];
};

export type Image = { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };

export type WebResult = { title: string; url: string };

export interface AiProvider {
  readonly name: "anthropic" | "test";
  chat(ctx: StudentContext, message: string): Promise<ChatReply>;
  photoHint(ctx: Pick<StudentContext, "track" | "focus">, image: Image): Promise<PhotoHint>;
  photoSolution(ctx: Pick<StudentContext, "track" | "focus">, image: Image | null, questionText: string): Promise<PhotoSolution>;
  similarItems(input: { track: string; subject: string; topic: string | null; questionText: string; skill: string; errorType: string | null }): Promise<ReviewItems>;
  /** Üretilen soruları bağımsız çözer (cevap kontrolü için). */
  solveIndependently(items: { prompt: string; choices: string[] }[]): Promise<string[]>;
  webSearch(query: string): Promise<WebResult[]>;
}
