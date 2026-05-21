import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";

export type User = {
  id: string;
  name: string;
  role: "Autista" | "Capoturno" | "Soccorritore";
  is_admin: boolean;
};

type UserContextType = {
  currentUser: User | null;
  users: User[];
  loading: boolean;
  initialized: boolean;
  selectUser: (user: User) => Promise<void>;
  clearUser: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  refreshStatus: () => Promise<void>;
};

const UserContext = createContext<UserContextType | undefined>(undefined);

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const refreshUsers = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/users`);
      const data = await res.json();
      setUsers(data);
    } catch (e) {
      console.error("Failed to load users", e);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/setup/status`);
      const data = await res.json();
      setInitialized(!!data.initialized);
    } catch (e) {
      console.error("Failed to check status", e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const statusRes = await fetch(`${API}/api/setup/status`);
        const status = await statusRes.json();
        setInitialized(!!status.initialized);
        if (status.initialized) {
          const usersRes = await fetch(`${API}/api/users`);
          const usersData = await usersRes.json();
          setUsers(usersData);
          const savedId = await storage.getItem<string>("current_user_id", "");
          if (savedId) {
            const fresh = usersData.find((u: User) => u.id === savedId);
            if (fresh) setCurrentUser(fresh);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectUser = async (user: User) => {
    setCurrentUser(user);
    await storage.setItem("current_user_id", user.id);
  };

  const clearUser = async () => {
    setCurrentUser(null);
    await storage.removeItem("current_user_id");
  };

  return (
    <UserContext.Provider value={{ currentUser, users, loading, initialized, selectUser, clearUser, refreshUsers, refreshStatus }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used inside UserProvider");
  return ctx;
}
