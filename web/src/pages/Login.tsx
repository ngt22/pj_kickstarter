import { Alert, Button, Center, Divider, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import {
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { GoogleIcon } from "../components/icons";
import { useAuth } from "../lib/auth";
import { auth } from "../lib/firebase";

export default function Login() {
  const { user } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ color: string; text: string } | null>(null);

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/";
  if (user?.emailVerified) return <Navigate to={from} replace />;

  const run = async (fn: () => Promise<unknown>) => {
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage({ color: "red", text: e instanceof Error ? e.message : String(e) });
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(() => signInWithEmailAndPassword(auth, email, password));
  };

  return (
    <Center mih="100vh" p="md" bg="var(--ks-canvas)">
      <Paper withBorder shadow="md" p="xl" w="100%" maw={400}>
        <Title order={2} className="ks-brand" mb={4}>
          <span className="ks-brand-mark">K</span>
          Kickstarter
        </Title>
        <Text c="dimmed" size="sm" mb="lg">提案資料の閲覧にはログインが必要です。</Text>

        {user && !user.emailVerified ? (
          <Stack>
            <Text size="sm">{user.email} はメールアドレスの確認が済んでいません。</Text>
            <Button
              onClick={() =>
                run(async () => {
                  await sendEmailVerification(user);
                  setMessage({ color: "green", text: "確認メールを送りました。" });
                })
              }
            >
              確認メールを送る
            </Button>
            <Button variant="default" onClick={() => signOut(auth)}>ログアウト</Button>
          </Stack>
        ) : (
          <>
            <form onSubmit={onSubmit}>
              <Stack>
                <TextInput label="メールアドレス" type="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} required />
                <PasswordInput label="パスワード" value={password} onChange={(e) => setPassword(e.currentTarget.value)} required />
                <Button type="submit" fullWidth>ログイン</Button>
              </Stack>
            </form>
            <Divider label="または" labelPosition="center" my="lg" />
            <Button
              variant="default"
              fullWidth
              leftSection={<GoogleIcon />}
              onClick={() => run(() => signInWithPopup(auth, new GoogleAuthProvider()))}
            >
              Google でログイン
            </Button>
          </>
        )}
        {message && <Alert color={message.color} mt="md">{message.text}</Alert>}
      </Paper>
    </Center>
  );
}
