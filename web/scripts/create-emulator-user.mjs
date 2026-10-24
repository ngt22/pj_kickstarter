// Auth エミュレータに、メール確認済みのユーザーを作る（ローカル開発用）
// 使い方: pnpm emu:user [email] [password]
const [email = "you@example.com", password = "password123"] = process.argv.slice(2);
const host = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const project = process.env.GCLOUD_PROJECT ?? "demo-kickstarter";
const base = `http://${host}/identitytoolkit.googleapis.com/v1`;

async function call(path, body, headers = {}) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json.error ?? json));
  return json;
}

try {
  const { localId } = await call("/accounts:signUp?key=demo", { email, password });
  // "Bearer owner" はエミュレータ専用の管理者トークン
  await call(`/projects/${project}/accounts:update`, { localId, emailVerified: true }, { authorization: "Bearer owner" });
  console.log(`作成しました: ${email} / ${password}（メール確認済み）`);
} catch (e) {
  console.error(`作成できませんでした: ${e.message}`);
  console.error("エミュレータが起動しているか、同じメールのユーザーが既にいないか確認してください。");
  process.exit(1);
}
