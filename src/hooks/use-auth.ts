import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface ProfileRecord {
  id: string;
  email: string | null;
  full_name: string | null;
  balance: number;
}

export interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: ProfileRecord | null;
  isAdmin: boolean;
}

/**
 * Single source of truth for the browser session, the trader profile and the
 * role flag. Roles are read from `user_roles` (never from the profile row).
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    loading: true,
    session: null,
    user: null,
    profile: null,
    isAdmin: false,
  });

  useEffect(() => {
    let active = true;

    async function hydrate(session: Session | null) {
      if (!session?.user) {
        if (active) setState({ loading: false, session: null, user: null, profile: null, isAdmin: false });
        return;
      }

      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, email, full_name, balance")
          .eq("id", session.user.id)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", session.user.id),
      ]);

      if (!active) return;
      setState({
        loading: false,
        session,
        user: session.user,
        profile: profile
          ? { ...profile, balance: Number(profile.balance) }
          : null,
        isAdmin: (roles ?? []).some((row) => row.role === "admin"),
      });
    }

    supabase.auth.getSession().then(({ data }) => hydrate(data.session));

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void hydrate(session);
      }
    });

    // Keep the balance live while the listener credits deposits.
    const channel = supabase
      .channel("auth-profile-balance")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => {
        const next = payload.new as ProfileRecord;
        setState((prev) =>
          prev.user && next.id === prev.user.id
            ? { ...prev, profile: { ...next, balance: Number(next.balance) } }
            : prev,
        );
      })
      .subscribe();

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, []);

  return state;
}
