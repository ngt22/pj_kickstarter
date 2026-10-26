import { createContext } from "react";

// 表示中の案件の画面仕様: 画面ID → ```mock の原稿と、画面仕様のその画面へのリンク。
// ページ遷移図・ユースケース図の画面サムネイルと、クリックで画面仕様へ移動するのに使う
export type ScreenLinks = { mocks: Map<string, string>; href?: (id: string) => string };
export const ScreenLinksContext = createContext<ScreenLinks>({ mocks: new Map() });
