import { Alert, Button, Code, CopyButton, Group, List, Paper, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../lib/auth";
import { useEmulator } from "../lib/firebase";

// ingest CLI の login に貼り付けるトークンを表示する。Google アカウントでも CLI から管理者として push できるようにするため
export default function CliLogin() {
  const { user } = useAuth();
  const [shown, setShown] = useState(false);
  const command = `kickstarter-ingest login ${useEmulator ? "--emulator" : window.location.origin}`;
  // リフレッシュトークン。CLI はこれで ID トークンを取り直し、Firestore のルールを通して書き込む
  const token = user?.refreshToken ?? "";

  return (
    <Layout>
      <Title order={1} mb="xs">CLI ログイン</Title>
      <Text c="dimmed" mb="lg">
        ingest CLI から、このアカウント（{user?.email}）の管理者権限で案件を書き込めるようにします。
      </Text>
      <Stack maw={720}>
        <Paper withBorder p="lg">
          <List type="ordered" spacing="sm">
            <List.Item>
              端末で次のコマンドを実行します
              <Code block mt="xs">{command}</Code>
            </List.Item>
            <List.Item>「トークン:」と表示されたら、下のトークンを貼り付けます</List.Item>
          </List>
        </Paper>
        <Alert color="orange" title="トークンは他人に渡さないでください">
          このトークンがあれば、あなたの管理者権限で案件を書き換えられます。CLI 以外に貼り付けず、Claude などのエージェントにも
          入力させないでください。無効にするには、パスワードを変更するか、管理者権限を外してください。
        </Alert>
        {shown ? (
          <>
            <Code block style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}>{token}</Code>
            <Group>
              <CopyButton value={token}>
                {({ copied, copy }) => <Button onClick={copy} color={copied ? "teal" : undefined}>{copied ? "コピーしました" : "コピー"}</Button>}
              </CopyButton>
              <Button variant="default" onClick={() => setShown(false)}>隠す</Button>
            </Group>
          </>
        ) : (
          <Group>
            <Button onClick={() => setShown(true)}>トークンを表示</Button>
          </Group>
        )}
      </Stack>
    </Layout>
  );
}
