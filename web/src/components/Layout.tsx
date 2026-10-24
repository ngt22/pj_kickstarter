import { signOut } from "firebase/auth";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { auth } from "../lib/firebase";

export default function Layout({ children, sidebar }: { children: ReactNode; sidebar?: ReactNode }) {
  const { user } = useAuth();
  return (
    <div className="layout">
      <header>
        <Link to="/" className="brand">Kickstarter</Link>
        <span className="muted">{user?.email}</span>
        <button className="secondary" onClick={() => signOut(auth)}>ログアウト</button>
      </header>
      <div className="body">
        {sidebar && <nav className="sidebar">{sidebar}</nav>}
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
