import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addAnnotation, updateAnnotation, type NewAnnotation } from "../src/lib/annotations";
import { createProject, type TemplateDoc } from "../src/lib/createProject";
import { deleteProject } from "../src/lib/deleteProject";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-kickstarter",
    firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf-8"), host: "127.0.0.1", port: 8080 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "projects/sample"), { id: "sample" });
    await setDoc(doc(db, "projects/sample/docs/requirements"), { title: "要件定義書" });
    await setDoc(doc(db, "projects/secret"), { id: "secret" });
    await setDoc(doc(db, "access/member@example.com"), { projects: ["sample"] });
    await setDoc(doc(db, "access/peer@example.com"), { projects: ["sample"] });
  });
});

afterAll(() => env.cleanup());

const user = (email: string, { verified = true, admin = false } = {}) =>
  env.authenticatedContext(email, { email, email_verified: verified, ...(admin ? { admin: true } : {}) }).firestore();

describe("案件の閲覧", () => {
  it("権限のあるクライアントは案件とドキュメントを読める", async () => {
    const db = user("member@example.com");
    await assertSucceeds(getDoc(doc(db, "projects/sample")));
    await assertSucceeds(getDoc(doc(db, "projects/sample/docs/requirements")));
  });

  it("メールの大文字小文字は区別しない", async () => {
    await assertSucceeds(getDoc(doc(user("Member@Example.com"), "projects/sample")));
  });

  it("権限のない案件は読めず、全件の一覧も取れない", async () => {
    const db = user("member@example.com");
    await assertFails(getDoc(doc(db, "projects/secret")));
    await assertFails(getDocs(collection(db, "projects")));
  });

  it("権限のないユーザーは読めない", async () => {
    const db = user("other@example.com");
    await assertFails(getDoc(doc(db, "projects/sample")));
    await assertFails(getDoc(doc(db, "projects/sample/docs/requirements")));
  });

  it("メール未確認のユーザーは読めない", async () => {
    await assertFails(getDoc(doc(user("member@example.com", { verified: false }), "projects/sample")));
  });

  it("未ログインは読めない", async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "projects/sample")));
  });

  it("管理者は全案件を一覧・閲覧できる", async () => {
    const db = user("admin@example.com", { admin: true });
    await assertSucceeds(getDocs(collection(db, "projects")));
    await assertSucceeds(getDoc(doc(db, "projects/secret")));
    await assertSucceeds(getDoc(doc(db, "projects/sample/docs/requirements")));
  });

  it("メール未確認の管理者は読めない", async () => {
    await assertFails(getDoc(doc(user("admin@example.com", { verified: false, admin: true }), "projects/sample")));
  });

});

describe("原稿の書き込み", () => {
  const project = { id: "new", name: "新案件", summary: "", status: "draft", client: "", proposed_at: "", version: "", color: "brand", updatedAt: serverTimestamp() };
  const page = { type: "requirements", title: "要件定義書", order: 3, format: "markdown", body: "## 目的", updatedAt: serverTimestamp() };

  it("管理者は案件とドキュメントを作成・更新・削除できる", async () => {
    const db = user("admin@example.com", { admin: true });
    await assertSucceeds(setDoc(doc(db, "projects/new"), project));
    await assertSucceeds(setDoc(doc(db, "projects/new/docs/requirements"), page));
    await assertSucceeds(setDoc(doc(db, "projects/new/docs/requirements"), { ...page, body: "## 目的（改）" }));
    await assertSucceeds(deleteDoc(doc(db, "projects/new/docs/requirements")));
  });

  it("クライアントや未確認の管理者は書き込めない", async () => {
    await assertFails(setDoc(doc(user("member@example.com"), "projects/sample/docs/requirements"), page));
    await assertFails(setDoc(doc(user("member@example.com"), "projects/sample"), { ...project, id: "sample" }));
    await assertFails(deleteDoc(doc(user("member@example.com"), "projects/sample/docs/requirements")));
    await assertFails(setDoc(doc(user("admin@example.com", { verified: false, admin: true }), "projects/new"), project));
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), "projects/new"), project));
  });

  it("管理者でも不正な形の原稿は書けない", async () => {
    const db = user("admin@example.com", { admin: true });
    await assertFails(setDoc(doc(db, "projects/other"), project)); // id がドキュメントIDと違う
    await assertFails(setDoc(doc(db, "projects/new"), { ...project, members: ["a@example.com"] })); // 閲覧者は access に持つ
    await assertFails(setDoc(doc(db, "projects/new"), { ...project, status: "done" }));
    await assertFails(setDoc(doc(db, "projects/New_1"), { ...project, id: "New_1" })); // 英小文字・数字・ハイフン以外
    await assertFails(setDoc(doc(db, "projects/new/docs/risks"), page)); // type がドキュメントIDと違う
    await assertFails(setDoc(doc(db, "projects/new/docs/requirements"), { ...page, format: "html" }));
    await assertFails(setDoc(doc(db, "projects/new/docs/requirements"), { ...page, order: "3" }));
  });
});

describe("閲覧権限（access）", () => {
  it("クライアントは自分の権限だけ読める", async () => {
    const db = user("member@example.com");
    await assertSucceeds(getDoc(doc(db, "access/member@example.com")));
    await assertFails(getDoc(doc(db, "access/peer@example.com")));
    await assertFails(getDocs(query(collection(db, "access"), where("projects", "array-contains", "sample"))));
  });

  it("クライアントは自分の権限を書き換えられない", async () => {
    const db = user("member@example.com");
    await assertFails(setDoc(doc(db, "access/member@example.com"), { projects: ["sample", "secret"] }));
  });

  it("管理者は権限を一覧・追加・削除できる", async () => {
    const db = user("admin@example.com", { admin: true });
    await assertSucceeds(getDocs(collection(db, "access")));
    await assertSucceeds(setDoc(doc(db, "access/new@example.com"), { projects: arrayUnion("secret") }, { merge: true }));
    await assertSucceeds(deleteDoc(doc(db, "access/new@example.com")));
  });

  it("管理者でも不正な形の権限は書けない", async () => {
    const db = user("admin@example.com", { admin: true });
    await assertFails(setDoc(doc(db, "access/New@example.com"), { projects: ["sample"] }));
    await assertFails(setDoc(doc(db, "access/x@example.com"), { projects: "sample" }));
    await assertFails(setDoc(doc(db, "access/x@example.com"), { projects: ["sample"], admin: true }));
  });
});

describe("サイト設定（settings）", () => {
  const site = { vendor_name: "<自社名>", contact: "永田", updatedAt: serverTimestamp() };
  const priv = { forbidden_terms: ["あだ名"], updatedAt: serverTimestamp() };

  it("管理者は提案者と禁止語を書ける", async () => {
    const db = user("admin@example.com", { admin: true });
    await assertSucceeds(setDoc(doc(db, "settings/site"), site));
    await assertSucceeds(setDoc(doc(db, "settings/private"), priv));
    await assertSucceeds(getDoc(doc(db, "settings/private")));
  });

  it("クライアントは提案者を読めるが、禁止語は読めず、どちらも書けない", async () => {
    const db = user("member@example.com");
    await assertSucceeds(getDoc(doc(db, "settings/site")));
    await assertFails(getDoc(doc(db, "settings/private")));
    await assertFails(setDoc(doc(db, "settings/site"), site));
    await assertFails(setDoc(doc(db, "settings/private"), priv));
  });

  it("未ログインは提案者も読めない", async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "settings/site")));
  });

  it("管理者でも不正な形の設定は書けない", async () => {
    const db = user("admin@example.com", { admin: true });
    await assertFails(setDoc(doc(db, "settings/site"), { ...site, extra: 1 }));
    await assertFails(setDoc(doc(db, "settings/private"), { forbidden_terms: "あだ名" }));
    await assertFails(setDoc(doc(db, "settings/other"), { x: 1 }));
  });
});

describe("案件の削除", () => {
  beforeAll(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "projects/trial"), { id: "trial" });
      await setDoc(doc(db, "projects/trial/docs/requirements"), { title: "要件定義書" });
      await setDoc(doc(db, "projects/trial/docs/roadmap"), { title: "開発計画" });
      await setDoc(doc(db, "projects/trial/annotations/n1"), { authorUid: "a@example.com" });
      await setDoc(doc(db, "access/a@example.com"), { projects: ["trial", "sample"] });
      await setDoc(doc(db, "access/b@example.com"), { projects: ["trial"] });
    });
  });

  it("クライアントや未確認の管理者は案件を削除できない", async () => {
    await assertFails(deleteProject(user("a@example.com"), "trial"));
    await assertFails(deleteDoc(doc(user("a@example.com"), "projects/trial")));
    await assertFails(deleteDoc(doc(user("admin@example.com", { verified: false, admin: true }), "projects/trial")));
    await assertFails(deleteDoc(doc(env.unauthenticatedContext().firestore(), "projects/trial")));
  });

  it("管理者は案件を原稿と閲覧権限ごと削除できる", async () => {
    const db = user("admin@example.com", { admin: true });
    expect(await assertSucceeds(deleteProject(db, "trial"))).toEqual({ docs: 2, viewers: 2, annotations: 1 });
    expect((await getDoc(doc(db, "projects/trial"))).exists()).toBe(false);
    expect((await getDocs(collection(db, "projects/trial/docs"))).size).toBe(0);
    expect((await getDocs(collection(db, "projects/trial/annotations"))).size).toBe(0);
    expect((await getDoc(doc(db, "access/a@example.com"))).data()?.projects).toEqual(["sample"]);
    expect((await getDoc(doc(db, "access/b@example.com"))).data()?.projects).toEqual([]);
  });
});

describe("案件の作成（管理画面）", () => {
  const meta = { id: "fresh", name: "新しい案件", summary: "", client: "", proposed_at: "" };
  const docs: TemplateDoc[] = [
    { type: "requirements", title: "要件定義書", order: 3, format: "markdown", body: "---\ntitle: 要件定義書\norder: 3\n---\n" },
    { type: "risks", title: "リスク管理表", order: 11, format: "yaml", body: "title: リスク管理表\norder: 11\nrisks: []\n" },
  ];

  it("クライアントは案件を作成できない", async () => {
    await assertFails(createProject(user("member@example.com"), meta, docs));
  });

  it("管理者は雛形の原稿ごと案件を作成できる", async () => {
    const db = user("admin@example.com", { admin: true });
    await assertSucceeds(createProject(db, meta, docs));
    expect((await getDoc(doc(db, "projects/fresh"))).data()).toMatchObject({ ...meta, status: "draft", color: "brand" });
    expect((await getDocs(collection(db, "projects/fresh/docs"))).size).toBe(2);
  });

  it("同じIDの案件があれば上書きしない", async () => {
    const db = user("admin@example.com", { admin: true });
    await expect(createProject(db, { ...meta, name: "別の案件" }, docs)).rejects.toThrow("すでに使われています");
    expect((await getDoc(doc(db, "projects/fresh"))).data()?.name).toBe("新しい案件");
  });
});

describe("付箋（annotations）", () => {
  // authenticatedContext の uid はメールアドレスにしている
  const note = (email: string): NewAnnotation => ({
    docType: "requirements",
    authorUid: email,
    authorName: email,
    authorEmail: email,
    items: [{ kind: "box", color: "red", x: 10, y: 20, w: 100, h: 40, text: "ここの文言を直してください" }],
    comment: "",
    tags: ["文言"],
    anchor: { path: [0, 1], left: 0, top: 12 },
    width: 800,
  });
  const notes = (db: ReturnType<typeof user>) => collection(db, "projects/sample/annotations");

  it("閲覧権限のある人は自分の付箋を貼って、状態とハッシュタグを変えられる", async () => {
    const db = user("member@example.com");
    const id = await assertSucceeds(addAnnotation(db, "sample", note("member@example.com")));
    await assertSucceeds(updateAnnotation(db, "sample", id, { status: "close", tags: ["#文言", "済"] }));
    expect((await getDoc(doc(notes(db), id))).data()).toMatchObject({ status: "close", tags: ["文言", "済"] });
    await assertSucceeds(deleteDoc(doc(notes(db), id)));
  });

  it("ほかの人になりすまして貼れず、閲覧権限のない案件にも貼れない", async () => {
    await assertFails(addAnnotation(user("member@example.com"), "sample", note("peer@example.com")));
    await assertFails(addAnnotation(user("other@example.com"), "sample", note("other@example.com")));
    await assertFails(addAnnotation(user("member@example.com"), "secret", note("member@example.com")));
    await assertFails(addAnnotation(user("member@example.com", { verified: false }), "sample", note("member@example.com")));
  });

  it("クライアントはほかの人の付箋を読めず、触れない", async () => {
    const id = await addAnnotation(user("peer@example.com"), "sample", note("peer@example.com"));
    const db = user("member@example.com");
    await assertFails(getDoc(doc(notes(db), id)));
    await assertFails(getDocs(notes(db))); // 自分の分に絞らない一覧は取れない
    await assertSucceeds(getDocs(query(notes(db), where("authorUid", "==", "member@example.com"))));
    await assertFails(updateAnnotation(db, "sample", id, { status: "close" }));
    await assertFails(deleteDoc(doc(notes(db), id)));
  });

  it("管理者はすべての付箋を読めて、close にしたり削除したりできる", async () => {
    const id = await addAnnotation(user("peer@example.com"), "sample", note("peer@example.com"));
    const db = user("admin@example.com", { admin: true });
    await assertSucceeds(getDocs(notes(db)));
    await assertSucceeds(updateAnnotation(db, "sample", id, { status: "close" }));
    await assertSucceeds(deleteDoc(doc(notes(db), id)));
  });

  it("書いた人・書いた内容・位置はあとから変えられない", async () => {
    const db = user("member@example.com");
    const id = await addAnnotation(db, "sample", note("member@example.com"));
    const ref = doc(notes(db), id);
    await assertFails(updateDoc(ref, { authorUid: "peer@example.com", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { items: [], updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(notes(user("admin@example.com", { admin: true })), id), { authorName: "管理者", updatedAt: serverTimestamp() }));
  });

  it("不正な形の付箋は貼れない", async () => {
    const db = user("member@example.com");
    const base = { ...note("member@example.com"), status: "open", createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(notes(db), "ok"), base));
    await assertFails(setDoc(doc(notes(db), "n1"), { ...base, status: "done" }));
    await assertFails(setDoc(doc(notes(db), "n2"), { ...base, status: "close" })); // 最初は open
    await assertFails(setDoc(doc(notes(db), "n3"), { ...base, items: [] }));
    await assertFails(setDoc(doc(notes(db), "n4"), { ...base, extra: 1 }));
    await assertFails(setDoc(doc(notes(db), "n5"), { ...base, createdAt: new Date(2020, 0, 1) }));
  });
});
