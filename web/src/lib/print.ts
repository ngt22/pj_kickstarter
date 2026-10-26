import { createContext, useContext } from "react";

// 全資料を PDF 用に 1 ページへ並べている間は true。
// 図は操作部品（拡大・絞り込み・目盛りの切り替えなど）を出さず、紙の幅に収まる形で描く
export const PrintContext = createContext(false);

export const usePrint = () => useContext(PrintContext);

// 図が描き終わる前に印刷しないよう、描画中の要素に付ける目印（data-print-pending）
export const PENDING = { "data-print-pending": "" } as const;
