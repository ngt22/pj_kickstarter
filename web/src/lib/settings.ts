// サイト共通の設定（Firestore の settings）。管理画面の「提案者と表現チェック」で編集する
import { doc, getDoc, serverTimestamp, setDoc, type Firestore } from "firebase/firestore";

// 表紙に出す提案者。ログインした人なら誰でも読める
export type SiteSettings = { vendor_name: string; contact: string };
// push 時に原稿から探す禁止語（社内のあだ名など）。クライアントに見えないよう管理者だけが読める
export type PrivateSettings = { forbidden_terms: string[] };

export const EMPTY_SITE: SiteSettings = { vendor_name: "", contact: "" };

export async function loadSiteSettings(db: Firestore): Promise<SiteSettings> {
  const snap = await getDoc(doc(db, "settings", "site"));
  return { ...EMPTY_SITE, ...(snap.data() as Partial<SiteSettings> | undefined) };
}

export async function loadPrivateSettings(db: Firestore): Promise<PrivateSettings> {
  const snap = await getDoc(doc(db, "settings", "private"));
  return { forbidden_terms: (snap.data()?.forbidden_terms as string[] | undefined) ?? [] };
}

export async function saveSettings(db: Firestore, site: SiteSettings, priv: PrivateSettings) {
  await Promise.all([
    setDoc(doc(db, "settings", "site"), { vendor_name: site.vendor_name.trim(), contact: site.contact.trim(), updatedAt: serverTimestamp() }),
    setDoc(doc(db, "settings", "private"), { forbidden_terms: priv.forbidden_terms, updatedAt: serverTimestamp() }),
  ]);
}
