import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";
import {
  ApiError,
  apiErrorMessage,
  apiRequest,
  AUTH_TOKEN_KEY,
  removeAuthToken,
  saveAuthToken,
} from "@/src/api";

export type User = {
  id: string;
  name: string;
  role: "Autista" | "Capoturno" | "Soccorritore" | "Volontario";
  is_admin: boolean;
};

export type AuthResponse = { token: string; user: User };
type SetupStatus = {
  initialized: boolean;
  user_count: number;
  pin_setup_required: boolean;
  pin_setup_available: boolean;
};

type UserContextType = {
  currentUser: User | null;
  users: User[];
  loading: boolean;
  initialized: boolean;
  pinSetupRequired: boolean;
  error: string | null;
  login: (user: User, pin: string) => Promise<void>;
  acceptSession: (auth: AuthResponse) => Promise<void>;
  replaceSessionToken: (token: string) => Promise<void>;
  clearUser: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  retry: () => Promise<void>;
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [pinSetupRequired, setPinSetupRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshUsers = useCallback(async () => {
    try {
      const token = await storage.secureGet<string>(AUTH_TOKEN_KEY, "");
      const data = await apiRequest<User[]>(token ? "/api/users" : "/api/auth/users");
      setUsers(data);
      setCurrentUser((selected) => selected ? data.find((user) => user.id === selected.id) || null : null);
      setError(null);
    } catch (e) {
      setError(apiErrorMessage(e, "Impossibile caricare gli utenti"));
      throw e;
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await apiRequest<SetupStatus>("/api/setup/status");
      setInitialized(!!data.initialized);
      setPinSetupRequired(!!data.pin_setup_required);
      setError(null);
    } catch (e) {
      setError(apiErrorMessage(e, "Impossibile verificare la configurazione"));
      throw e;
    }
  }, []);

  const acceptSession = useCallback(async (auth: AuthResponse) => {
    await saveAuthToken(auth.token);
    await storage.setItem("current_user_id", auth.user.id);
    setCurrentUser(auth.user);
    setPinSetupRequired(false);
    setError(null);
    setUsers(await apiRequest<User[]>("/api/users"));
  }, []);

  const replaceSessionToken = useCallback(async (token: string) => {
    await saveAuthToken(token);
  }, []);

  const login = useCallback(async (user: User, pin: string) => {
    const auth = await apiRequest<AuthResponse>("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id, pin }),
    });
    await acceptSession(auth);
  }, [acceptSession]);

  const clearLocalSession = useCallback(async () => {
    setCurrentUser(null);
    await Promise.all([
      storage.removeItem("current_user_id"),
      removeAuthToken(),
    ]);
  }, []);

  const clearUser = useCallback(async () => {
    try {
      const token = await storage.secureGet<string>(AUTH_TOKEN_KEY, "");
      if (token) await apiRequest("/api/auth/logout", { method: "POST" });
    } catch {
      // Local logout must still succeed if the server is offline or the token expired.
    }
    await clearLocalSession();
  }, [clearLocalSession]);

  const retry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await apiRequest<SetupStatus>("/api/setup/status");
      setInitialized(!!status.initialized);
      setPinSetupRequired(!!status.pin_setup_required);
      if (!status.initialized) {
        setUsers([]);
        await clearLocalSession();
        return;
      }

      const publicUsers = await apiRequest<User[]>("/api/auth/users");
      setUsers(publicUsers);
      if (status.pin_setup_required) {
        await clearLocalSession();
        return;
      }

      const token = await storage.secureGet<string>(AUTH_TOKEN_KEY, "");
      if (!token) {
        setCurrentUser(null);
        return;
      }
      try {
        const me = await apiRequest<User>("/api/auth/me");
        setCurrentUser(me);
        await storage.setItem("current_user_id", me.id);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          await clearLocalSession();
        } else {
          throw e;
        }
      }
    } catch (e) {
      setError(apiErrorMessage(e, "Impossibile collegarsi al server"));
    } finally {
      setLoading(false);
    }
  }, [clearLocalSession]);

  useEffect(() => { retry(); }, [retry]);

  return (
    <UserContext.Provider value={{
      currentUser,
      users,
      loading,
      initialized,
      pinSetupRequired,
      error,
      login,
      acceptSession,
      replaceSessionToken,
      clearUser,
      refreshUsers,
      refreshStatus,
      retry,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used inside UserProvider");
  return ctx;
}
