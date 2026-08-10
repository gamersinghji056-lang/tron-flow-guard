import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/rbac";

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
  role: AppRole | null;
  permissions: string[];
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

const EMPTY: AuthState = {
  loading: false,
  session: null,
  user: null,
  profile: null,
  role: null,
  permissions: [],
  isAdmin: false,
  isSuperAdmin: false,
};

/**
 * Single source of truth for the browser session, the profile and the role.
 * Roles come from `user_roles` (never from the profile row) and are only used
 * for presentation — every privileged action is re-checked server-side.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ ...EMPTY, loading: true });

  useEffect(() => {
    let active = true;

    async function hydrate(session: Session | null) {
      if (!session?.user) {
        if (active) setState({ ...EMPTY });
        return;
      }

      const [{ data: profile }, { data: roles }, { data: perms }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, email, full_name, balance")
          .eq("id", session.user.id)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", session.user.id),
        supabase.from("admin_permissions").select("permission").eq("user_id", session.user.id),
      ]);

      if (!active) return;
      const held = (roles ?? []).map((row) => row.role as AppRole);
      const role: AppRole = held.includes("super_admin")
        ? "super_admin"
        : held.includes("admin")
          ? "admin"
          : "trader";

      setState({
        loading: false,
        session,
        user: session.user,
        profile: profile ? { ...profile, balance: Number(profile.balance) } : null,
        role,
        permissions: (perms ?? []).map((row) => row.permission),
        isAdmin: role === "admin" || role === "super_admin",
        isSuperAdmin: role === "super_admin",
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
