import {
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { auth } from "../lib/firebase";

export default function Login() {
  const { user } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/";
  if (user?.emailVerified) return <Navigate to={from} replace />;

  const run = async (fn: () => Promise<unknown>) => {
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(() => signInWithEmailAndPassword(auth, email, password));
  };

  return (
    <main className="login">
      <h1>Kickstarter</h1>
      <p className="muted">提案資料の閲覧にはログインが必要です。</p>

      {user && !user.emailVerified ? (
        <section className="card">
          <p>{user.email} はメールアドレスの確認が済んでいません。</p>
          <button onClick={() => run(async () => { await sendEmailVerification(user); setMessage("確認メールを送りました。"); })}>
            確認メールを送る
          </button>
          <button className="secondary" onClick={() => signOut(auth)}>ログアウト</button>
        </section>
      ) : (
        <section className="card">
          <form onSubmit={onSubmit}>
            <label>
              メールアドレス
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              パスワード
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <button type="submit">ログイン</button>
          </form>
          <hr />
          <button className="secondary" onClick={() => run(() => signInWithPopup(auth, new GoogleAuthProvider()))}>
            Google でログイン
          </button>
        </section>
      )}
      {message && <p className="error">{message}</p>}
    </main>
  );
}
