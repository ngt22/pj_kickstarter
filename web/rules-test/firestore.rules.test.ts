import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

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

  it("管理者でも原稿は書き込めない", async () => {
    await assertFails(setDoc(doc(user("admin@example.com", { admin: true }), "projects/sample/docs/x"), { title: "x" }));
    await assertFails(setDoc(doc(user("member@example.com"), "projects/sample/docs/x"), { title: "x" }));
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
