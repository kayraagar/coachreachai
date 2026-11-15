import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Tier } from "@cita/core";
import { supabase } from "./supabase";

export type Profile = {
  id: string;
  role: "student" | "coach" | "parent";
  full_name: string;
  email: string;
  track: "YKS" | "LGS";
  coach_id: string | null;
  yks_field: string | null;
  yks_focus: string | null;
  goal_text: string;
  availability: number[] | null;
  onboarded_at: string | null;
};

type AuthState = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  tier: Tier;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tier, setTier] = useState<Tier>("free");

  const load = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) {
      setProfile(null);
      setTier("free");
      return;
    }
    const [{ data: p }, { data: t }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, role, full_name, email, track, coach_id, yks_field, yks_focus, goal_text, availability, onboarded_at")
        .eq("id", s.user.id)
        .maybeSingle(),
      supabase.rpc("cita_my_tier"),
    ]);
    setProfile((p as Profile) ?? null);
    setTier(((t as Tier) ?? "free") as Tier);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => load(data.session).finally(() => setReady(true)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      void load(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      session,
      profile,
      tier,
      refresh: async () => {
        const { data } = await supabase.auth.getSession();
        await load(data.session);
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [ready, session, profile, tier, load]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider eksik");
  return v;
}
