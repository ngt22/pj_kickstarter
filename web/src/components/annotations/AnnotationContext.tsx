import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { watchAnnotations, COVER, type Annotation, type ExportContext } from "../../lib/annotations";
import { useAuth } from "../../lib/auth";
import { db } from "../../lib/firebase";

// 案件の画面全体で共有する付箋の状態：付箋モードの on/off、一覧の開閉、案件の付箋、飛び先
type State = {
  projectId: string;
  projectName: string;
  docType: string; // いま見ているページ（表紙は COVER）
  pageTitles: Record<string, string>;
  annotations: Annotation[];
  error: string;
  active: boolean;
  setActive(on: boolean): void;
  listOpen: boolean;
  setListOpen(open: boolean): void;
  // 一覧から選んだ付箋。レイヤーがその位置へスクロールして目立たせたら消す
  focusId: string | null;
  clearFocus(): void;
  jumpTo(a: Annotation): void;
};

const AnnotationContext = createContext<State | null>(null);

// 付箋をプロンプト用に書き出すときの、ページの URL と題名
export function useExportContext(): ExportContext {
  const { projectId, projectName, pageTitles } = useAnnotations();
  return {
    projectName,
    pageTitles,
    pageUrl: (docType) => `${window.location.origin}/projects/${projectId}${docType === COVER ? "" : `/${docType}`}`,
  };
}

export function useAnnotations() {
  const s = useContext(AnnotationContext);
  if (!s) throw new Error("AnnotationProvider の外では使えません");
  return s;
}

export function AnnotationProvider({
  projectId,
  projectName,
  docType,
  pageTitles,
  children,
}: {
  projectId: string;
  projectName: string;
  docType?: string;
  pageTitles: Record<string, string>;
  children: ReactNode;
}) {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [error, setError] = useState("");
  const [active, setActive] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const page = docType || COVER;

  useEffect(() => {
    if (!user) return;
    setError("");
    return watchAnnotations(db, projectId, { uid: user.uid, isAdmin }, setAnnotations, (e) => setError(String(e)));
  }, [projectId, user, isAdmin]);

  const value = useMemo<State>(
    () => ({
      projectId,
      projectName,
      docType: page,
      pageTitles,
      annotations,
      error,
      active,
      setActive,
      listOpen,
      setListOpen,
      focusId,
      clearFocus: () => setFocusId(null),
      jumpTo(a) {
        setActive(true);
        setFocusId(a.id);
        if (a.docType !== page) navigate(`/projects/${projectId}${a.docType === COVER ? "" : `/${a.docType}`}`);
      },
    }),
    [projectId, projectName, page, pageTitles, annotations, error, active, listOpen, focusId, navigate],
  );
  return <AnnotationContext.Provider value={value}>{children}</AnnotationContext.Provider>;
}
