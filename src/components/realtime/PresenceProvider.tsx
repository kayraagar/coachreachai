"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type PresentUser = {
  userId: string;
  name: string;
  role: "coach" | "student";
  at: string;
};

type PresenceValue = {
  users: PresentUser[];
  connected: boolean;
  isOnline: (userId: string) => boolean;
};

const PresenceContext = createContext<PresenceValue>({
  users: [],
  connected: false,
  isOnline: () => false,
});

export function usePresence() {
  return useContext(PresenceContext);
}

/**
 * Koç ve ona bağlı öğrenciler ortak bir presence kanalında buluşur; kim
 * o an panelde açık, her iki taraf da canlı görür.
 */
export function PresenceProvider({
  roomId,
  userId,
  name,
  role,
  children,
}: {
  /** Koçun id'si — oda anahtarı. Öğrencinin koçu yoksa presence kapalıdır. */
  roomId: string | null;
  userId: string;
  name: string;
  role: "coach" | "student";
  children: React.ReactNode;
}) {
  const [users, setUsers] = useState<PresentUser[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!roomId) return;

    const supabase = createClient();
    const channel = supabase.channel(`presence:coach:${roomId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresentUser>();
        const flat = Object.values(state)
          .flat()
          .filter((u): u is PresentUser & { presence_ref: string } => Boolean(u?.userId));
        // Aynı kullanıcı birden fazla sekmede açıksa tek satır göster.
        const unique = new Map<string, PresentUser>();
        flat.forEach((u) => unique.set(u.userId, u));
        setUsers(Array.from(unique.values()));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setConnected(true);
          await channel.track({ userId, name, role, at: new Date().toISOString() });
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setConnected(false);
        }
      });

    return () => {
      setConnected(false);
      supabase.removeChannel(channel);
    };
  }, [roomId, userId, name, role]);

  const value = useMemo<PresenceValue>(
    () => ({
      users,
      connected,
      isOnline: (id: string) => users.some((u) => u.userId === id),
    }),
    [users, connected]
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

/** Belirli bir kullanıcının çevrimiçi olup olmadığını gösteren nokta. */
export function PresenceDot({ userId, label }: { userId: string; label?: string }) {
  const { isOnline } = usePresence();
  const online = isOnline(userId);

  return (
    <span className="inline-flex items-center gap-1.5" title={online ? "Çevrimiçi" : "Çevrimdışı"}>
      <span
        className="relative inline-flex h-2 w-2 rounded-full transition-colors"
        style={{ background: online ? "var(--status-good)" : "var(--baseline)" }}
      >
        {online && (
          <span
            className="absolute inset-0 rounded-full"
            style={{ background: "var(--status-good)", animation: "ping 1.8s var(--ease-out) infinite" }}
          />
        )}
      </span>
      {label && (
        <span className="text-xs" style={{ color: online ? "var(--status-good)" : "var(--text-muted)" }}>
          {online ? label : ""}
        </span>
      )}
    </span>
  );
}

/** Kenar çubuğundaki "şu an çevrimiçi" listesi. */
export function OnlineList({ selfId }: { selfId: string }) {
  const { users, connected } = usePresence();
  const others = users.filter((u) => u.userId !== selfId);

  return (
    <div className="rounded-xl p-3" style={{ background: "var(--surface-2)" }}>
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: connected ? "var(--status-good)" : "var(--baseline)" }}
        />
        <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Çevrimiçi ({others.length})
        </p>
      </div>
      {others.length === 0 ? (
        <p className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
          Şu an başka kimse bağlı değil.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {others.slice(0, 6).map((u) => (
            <li key={u.userId} className="animate-fade flex items-center gap-2">
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.6rem] font-semibold"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                {u.name
                  .split(" ")
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase())
                  .join("")}
              </span>
              <span className="truncate text-xs" style={{ color: "var(--text-primary)" }}>
                {u.name}
              </span>
              <span className="ml-auto text-[0.65rem]" style={{ color: "var(--text-muted)" }}>
                {u.role === "coach" ? "Koç" : "Öğrenci"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
