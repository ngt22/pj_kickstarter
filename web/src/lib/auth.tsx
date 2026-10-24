import { Center, Loader } from "@mantine/core";
import { onIdTokenChanged, type User } from "firebase/auth";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { auth } from "./firebase";

type AuthState = { user: User | null; isAdmin: boolean; loading: boolean };

const AuthContext = createContext<AuthState>({ user: null, isAdmin: false, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, isAdmin: false, loading: true });
  // 管理者はカスタムクレーム admin: true で判定する。クレームは ID トークンに入るので、トークンの更新も拾う
  useEffect(
    () =>
      onIdTokenChanged(auth, async (user) => {
        const isAdmin = user ? (await user.getIdTokenResult()).claims.admin === true : false;
        setState({ user, isAdmin, loading: false });
      }),
    [],
  );
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// メール確認済みのユーザーだけを通す。Firestore のルールも同じ条件で守っている。
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Center h="100vh"><Loader /></Center>;
  if (!user || !user.emailVerified) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

// 管理者だけを通す。Firestore のルールでも access の編集は管理者に限っている。
export function RequireAdmin() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}
