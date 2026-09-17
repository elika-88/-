"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from 'next/link';
import { AlertCircle, BookOpen, Check, Languages, LoaderCircle, PanelLeft, RotateCcw, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HistorySidebar } from "@/components/HistorySidebar";
import { ProviderSettings } from "@/components/ProviderSettings";
import { StudyDashboard } from "@/components/StudyDashboard";
import { GenerationClientError, requestGeneration } from "@/lib/client/generationStream";
import { createSession, emptyHistory, parseHistory, serializeHistory, STORAGE_KEY, type SessionHistory, type StudySession, type SessionTab } from "@/lib/client/sessions";
import { countWords, INPUT_LIMITS, OutputLanguageSchema, validateGenerationInput } from "@/lib/input";
import { DEFAULT_API_BASE_URL, DEFAULT_MODEL, type ProviderConfig } from "@/lib/provider";
import type { GenerationStage } from "@/lib/contracts/generation";

const stages: Record<GenerationStage, string> = {
  validating: "Validating lecture", analyzing: "Analyzing lecture", generating: "Generating study materials",
  verifying: "Checking source evidence", correcting: "Refining study materials", complete: "Receiving final result",
};
const defaultProvider = (): ProviderConfig => ({ baseURL: DEFAULT_API_BASE_URL, apiKey: "", model: DEFAULT_MODEL });
const emptyDraft: StudySession = { id: "draft", title: "", lecture: "", outputLanguage: "auto", tab: "summary", kit: null, updatedAt: 0, customTitle: false };
type Operation = { controller: AbortController; sessionId: string };

export function StudyWorkspace() {
  const [history, setHistory] = useState<SessionHistory>(emptyHistory);
  const historyRef = useRef(history);
  const [draft, setDraft] = useState<StudySession>(emptyDraft);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const storageBlocked = useRef(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const mobileSidebar = useRef<HTMLDialogElement>(null);
  const editDialog = useRef<HTMLDialogElement>(null);
  const [edit, setEdit] = useState<{ id: string; action: "rename" | "delete" } | null>(null);
  const [rename, setRename] = useState("");
  const [customApi, setCustomApi] = useState(false);
  const [provider, setProvider] = useState(defaultProvider);
  const [error, setError] = useState<GenerationClientError | null>(null);
  const [pending, setPending] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const operation = useRef<Operation | null>(null);
  const lectureInput = useRef<HTMLTextAreaElement>(null);
  const active = history.sessions.find((session) => session.id === history.activeId) ?? draft;
  const staleKit = Boolean(active.kit && active.kit.source.text !== active.lecture);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        const restored = saved ? parseHistory(saved) : emptyHistory();
        historyRef.current = restored;
        setHistory(restored);
      } catch {
        storageBlocked.current = true;
        setStorageError("Saved history could not be opened. This session will stay in memory; existing saved data has not been overwritten.");
      }
      setReady(true);
    });
    return () => { cancelAnimationFrame(frame); operation.current?.controller.abort(); operation.current = null; };
  }, []);

  function save(next: SessionHistory) {
    historyRef.current = next;
    setHistory(next);
    if (storageBlocked.current) return;
    try { localStorage.setItem(STORAGE_KEY, serializeHistory(next)); setStorageError(null); }
    catch { setStorageError("Changes could not be saved on this device. Keep this page open to retain this session."); }
  }

  function cancel(message = "Generation canceled.") {
    operation.current?.controller.abort();
    operation.current = null;
    setPending(false);
    setProgress(message);
  }

  function updateSession(patch: Partial<Pick<StudySession, "title" | "lecture" | "outputLanguage" | "tab" | "customTitle">>) {
    if (!ready) return;
    setError(null);
    setProgress("");
    const current = historyRef.current.sessions.find((session) => session.id === historyRef.current.activeId) ?? draft;
    let next = { ...current, ...patch, updatedAt: Date.now() };
    if (patch.lecture !== undefined && !next.customTitle) next.title = patch.lecture.trim().split(/\r?\n/)[0].slice(0, INPUT_LIMITS.maxTitleCharacters);
    if (current.id === "draft") {
      if (!next.title.trim() && !next.lecture.trim()) { setDraft(next); return; }
      next = { ...next, id: createSession().id };
      save({ ...historyRef.current, activeId: next.id, sessions: [...historyRef.current.sessions, next] });
    } else {
      save({ ...historyRef.current, sessions: historyRef.current.sessions.map((session) => session.id === next.id ? next : session) });
    }
  }

  function newLecture() {
    if (!ready) return;
    cancel(""); setError(null); setDraft(emptyDraft);
    save({ ...historyRef.current, activeId: null });
    mobileSidebar.current?.close();
    requestAnimationFrame(() => lectureInput.current?.focus());
  }

  async function loadDemo() {
    if (!ready || pending || demoLoading) return;
    setDemoLoading(true); setError(null);
    try {
      const response = await fetch('/demo/research-methods.txt');
      if (!response.ok) throw new Error('Demo source unavailable');
      const lecture = await response.text();
      const session = { ...createSession(), title: 'How Evidence Becomes Knowledge', customTitle: true, lecture };
      save({ ...historyRef.current, activeId: session.id, sessions: [...historyRef.current.sessions, session] });
      setProgress('Demo lecture loaded. Generate to create fresh materials.');
    } catch { setError(new GenerationClientError('NETWORK_ERROR', true)); }
    finally { setDemoLoading(false); }
  }

  function selectLecture(id: string) {
    if (!ready) return;
    cancel(""); setError(null);
    save({ ...historyRef.current, activeId: id });
    mobileSidebar.current?.close();
  }

  function openEdit(id: string, action: "rename" | "delete") {
    if (!ready) return;
    const session = historyRef.current.sessions.find((item) => item.id === id);
    if (!session) return;
    setEdit({ id, action }); setRename(session.title);
    editDialog.current?.showModal();
  }

  function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!edit || (edit.action === "rename" && !rename.trim())) return;
    let next = historyRef.current;
    if (edit.action === "rename") {
      next = { ...next, sessions: next.sessions.map((session) => session.id === edit.id ? { ...session, title: rename.trim(), customTitle: true } : session) };
    } else {
      if (operation.current?.sessionId === edit.id) cancel("");
      const remaining = next.sessions.filter((session) => session.id !== edit.id);
      next = { ...next, sessions: remaining, activeId: next.activeId === edit.id ? [...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? null : next.activeId };
      setDraft(emptyDraft); setError(null);
    }
    save(next); editDialog.current?.close(); setEdit(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || demoLoading || !ready) return;
    const validation = validateGenerationInput({ title: active.title, lecture: active.lecture, outputLanguage: active.outputLanguage, ...(customApi ? { provider } : {}) });
    if (!validation.success) { setError(new GenerationClientError(validation.error.code, validation.error.retryable)); lectureInput.current?.focus(); return; }
    setError(null); setPending(true); setProgress("Sending lecture");
    const current: Operation = { controller: new AbortController(), sessionId: active.id };
    operation.current = current;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; current.controller.abort(); }, 270_000);
    try {
      const kit = await requestGeneration(validation.data, {
        signal: current.controller.signal,
        onEvent: (event) => {
          if (operation.current !== current) return;
          if (event.type === "stage") setProgress(stages[event.stage]);
          if (event.type === "retry") setProgress(`${stages[event.stage]}: attempt ${event.attempt} of ${event.maxAttempts}`);
        },
      });
      if (operation.current !== current) return;
      if (kit.source.text !== validation.data.lecture) throw new GenerationClientError("INVALID_RESPONSE", false);
      const latest = historyRef.current;
      save({ ...latest, sessions: latest.sessions.map((session) => session.id === current.sessionId ? { ...session, kit, tab: "summary", updatedAt: Date.now() } : session) });
      setProgress("Study materials ready.");
    } catch (caught) {
      if (operation.current !== current) return;
      if (timedOut) setError(new GenerationClientError("TIMEOUT", true));
      else if (caught instanceof Error && caught.name === "AbortError") setProgress("Generation canceled.");
      else setError(caught instanceof GenerationClientError ? caught : new GenerationClientError("NETWORK_ERROR", true));
    } finally {
      clearTimeout(timeout);
      if (operation.current === current) { operation.current = null; setPending(false); }
    }
  }

  const sidebarProps = { sessions: history.sessions, activeId: history.activeId, onNew: newLecture, onSelect: selectLecture, onEdit: openEdit };
  return <div className={`study-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
    {!sidebarCollapsed && <aside className="lecture-sidebar" aria-label="Lecture history"><HistorySidebar {...sidebarProps} onClose={() => setSidebarCollapsed(true)} /></aside>}
    <dialog ref={mobileSidebar} className="mobile-sidebar" aria-label="Lecture history"><HistorySidebar {...sidebarProps} onClose={() => mobileSidebar.current?.close()} /></dialog>
    <div className="workspace">
      <header className="workspace-header"><div className="header-inner">
        <button className="icon-button open-sidebar" type="button" title="Open sidebar" aria-label="Open sidebar" onClick={() => { if (matchMedia("(max-width: 767px)").matches) mobileSidebar.current?.showModal(); else setSidebarCollapsed(false); }}><PanelLeft aria-hidden="true" /></button>
        <div className="logo"><span className="logo-mark" aria-hidden="true" />Lumina</div><span className="workspace-title">{active.title || "New lecture"}</span>
      </div></header>
      <main className="workspace-main">
        <nav aria-label="Administration" style={{ textAlign: 'right', marginBottom: 12 }}><Link href="/admin" className="text-sm text-muted-foreground">Administration</Link></nav>
        {storageError && <div className="notice warning" role="alert"><AlertCircle aria-hidden="true" /><p>{storageError}</p></div>}
        <section className="input-section" aria-labelledby="input-heading">
          <div className="input-heading-row"><h1 id="input-heading">Build your study materials</h1><Button type="button" variant="ghost" disabled={!ready || pending || demoLoading} onClick={loadDemo}>{demoLoading ? 'Loading lecture…' : 'Load demo lecture'}</Button></div>
          <form onSubmit={submit} noValidate aria-busy={pending}>
            <fieldset disabled={!ready || pending || demoLoading} className="lecture-fields">
              <div><label htmlFor="lecture-title">Lecture title <span className="optional">(optional)</span></label><input className="text-field" id="lecture-title" value={active.title} maxLength={INPUT_LIMITS.maxTitleCharacters} onChange={(event) => updateSession({ title: event.target.value, customTitle: true })} placeholder="Untitled lecture" /></div>
              <div><div className="field-heading"><label htmlFor="lecture">Lecture text</label><span id="lecture-count">{countWords(active.lecture).toLocaleString("en-US")} words · {active.lecture.length.toLocaleString("en-US")} / 60,000</span></div>
                <textarea id="lecture" ref={lectureInput} value={active.lecture} onChange={(event) => updateSession({ lecture: event.target.value })} maxLength={INPUT_LIMITS.maxCharacters} aria-describedby={error ? "lecture-count form-error" : "lecture-count"} placeholder="Lecture text" /></div>
              <details className="api-options"><summary>API settings</summary><div className="api-settings-body"><ProviderSettings enabled={customApi} value={provider} disabled={pending} onEnabledChange={(enabled) => { setCustomApi(enabled); setProvider((value) => ({ ...value, apiKey: "" })); setError(null); }} onChange={(value) => { setProvider(value); setError(null); }} onReset={() => { setCustomApi(false); setProvider(defaultProvider()); setError(null); }} /></div></details>
            </fieldset>
            <div className="input-toolbar"><div className="language-field"><label htmlFor="language"><Languages aria-hidden="true" />Output language</label><select id="language" disabled={!ready || pending} value={active.outputLanguage} onChange={(event) => updateSession({ outputLanguage: OutputLanguageSchema.parse(event.target.value) })}><option value="auto">Match lecture</option><option value="en">English</option><option value="ru">Русский</option><option value="zh">中文</option></select></div>
              <div className="generate-actions">{pending ? <Button type="button" variant="outline" onClick={() => cancel()}><Square aria-hidden="true" />Cancel</Button> : null}<Button type="submit" disabled={!ready || pending}>{pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : active.kit ? <RotateCcw aria-hidden="true" /> : <Sparkles aria-hidden="true" />}{pending ? "Generating" : active.kit ? "Regenerate materials" : "Generate materials"}</Button></div>
            </div>
            {error && <div id="form-error" className="notice error" role="alert"><AlertCircle aria-hidden="true" /><p>{error.message}{error.retryable && " Your lecture is still here. Try generating again."}</p></div>}
            <div className="form-footer"><span className={storageError ? "save-failed" : ""}>{!ready ? "Opening workspace" : storageError ? "Not saved" : history.activeId ? "Saved on this device" : "Draft"}</span><span className="processing-status" role="status">{pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : progress && !error ? <Check aria-hidden="true" /> : null}{error ? "" : progress}</span></div>
          </form>
        </section>
        {staleKit && <div className="notice warning" role="status"><AlertCircle aria-hidden="true" /><p>These materials are from the previous version of this lecture. Regenerate to update them.</p></div>}
        {active.kit ? <StudyDashboard key={`${active.id}:${active.kit.runId}`} kit={active.kit} tab={active.tab} onTabChange={(tab: SessionTab) => updateSession({ tab })} /> : <section className="empty-materials" aria-label="Study materials"><BookOpen aria-hidden="true" /><h2>No study materials yet</h2><div className="empty-tabs"><span>Summary</span><span>Key points</span><span>Quiz</span><span>Flashcards</span></div></section>}
      </main>
    </div>
    <dialog className="history-dialog" ref={editDialog} aria-labelledby="edit-title" onClose={() => setEdit(null)}>
      <form onSubmit={submitEdit}><h2 id="edit-title">{edit?.action === "delete" ? "Delete lecture?" : "Rename lecture"}</h2>
        {edit?.action === "delete" ? <p>This removes the lecture and its study materials from this device.</p> : <><label className="sr-only" htmlFor="rename-title">Lecture title</label><input className="text-field" id="rename-title" value={rename} maxLength={INPUT_LIMITS.maxTitleCharacters} onChange={(event) => setRename(event.target.value)} required /></>}
        <div className="dialog-actions"><Button type="button" variant="outline" onClick={() => editDialog.current?.close()}>Cancel</Button><Button type="submit" disabled={edit?.action === "rename" && !rename.trim()}>{edit?.action === "delete" ? "Delete" : "Save"}</Button></div>
      </form>
    </dialog>
  </div>;
}
