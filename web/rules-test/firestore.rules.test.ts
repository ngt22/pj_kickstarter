import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-kickstarter",
    firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf-8"), host: "127.0.0.1", port: 8080 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "projects/sample"), { id: "sample", members: ["member@example.com"] });
    await setDoc(doc(db, "projects/sample/docs/requirements"), { title: "要件定義書" });
  });
});

afterAll(() => env.cleanup());

const user = (email: string, verified = true) =>
  env.authenticatedContext(email, { email, email_verified: verified }).firestore();

describe("firestore.rules", () => {
  it("メンバーは案件とドキュメントを読める", async () => {
    const db = user("member@example.com");
    await assertSucceeds(getDoc(doc(db, "projects/sample")));
    await assertSucceeds(getDoc(doc(db, "projects/sample/docs/requirements")));
  });

  it("メールの大文字小文字は区別しない", async () => {
    await assertSucceeds(getDoc(doc(user("Member@Example.com"), "projects/sample")));
  });

  it("メンバーは自分の案件一覧をクエリできる", async () => {
    const db = user("member@example.com");
    await assertSucceeds(getDocs(query(collection(db, "projects"), where("members", "array-contains", "member@example.com"))));
  });

  it("メンバー以外は読めない", async () => {
    const db = user("other@example.com");
    await assertFails(getDoc(doc(db, "projects/sample")));
    await assertFails(getDoc(doc(db, "projects/sample/docs/requirements")));
    await assertFails(getDocs(collection(db, "projects")));
  });

  it("メール未確認のメンバーは読めない", async () => {
    await assertFails(getDoc(doc(user("member@example.com", false), "projects/sample")));
  });

  it("未ログインは読めない", async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "projects/sample")));
  });

  it("メンバーでも書き込めない", async () => {
    await assertFails(setDoc(doc(user("member@example.com"), "projects/sample/docs/x"), { title: "x" }));
  });
});
