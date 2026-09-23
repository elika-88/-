"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, BookOpen, Check, FileText, Link, LoaderCircle, PanelLeft, RotateCcw, Sparkles, Square, Upload } from "lucide-react";
import { Button } from '@/components/ui/button';
import { CustomLanguageSelect } from '@/components/CustomLanguageSelect';
import { HistorySidebar } from "@/components/HistorySidebar";
import { StudyDashboard } from "@/components/StudyDashboard";
import { GenerationClientError, requestGeneration } from "@/lib/client/generationStream";
import { createSession, type StudySession, type SessionTab } from "@/lib/client/sessions";
import { useAuth } from '@/components/auth/AuthProvider';
import { useStudyHistory } from './useStudyHistory';
import { StudySyncStatus } from './StudySyncStatus';
import { useGenerationJob } from './useGenerationJob';
import { GenerationJobStatus } from './GenerationJobStatus';
import { isActiveJob } from '@/lib/client/generation-jobs';
import { AccountMenu } from './auth/AccountMenu';
import { countWords, INPUT_LIMITS, normalizeLectureText, validateGenerationInput } from "@/lib/input";
import type { GenerationStage } from "@/lib/contracts/generation";

const stages: Record<GenerationStage, string> = {
  validating: "Validating lecture", analyzing: "Analyzing lecture", generating: "Generating study materials",
  verifying: "Checking source evidence", correcting: "Refining study materials", complete: "Receiving final result",
};
const emptyDraft: StudySession = { id: "draft", title: "", lecture: "", outputLanguage: "auto", tab: "summary", kit: null, updatedAt: 0, customTitle: false };
type Operation = { controller: AbortController; sessionId: string };

export function StudyWorkspace() {
  const { user, ready, verified, error, recheckIdentity } = useAuth();
  if (!ready || !verified || error) return <main className="workspace-main"><div className="study-sync" role="status"><p>{error ? 'Account verification is unavailable. Your lectures are hidden until your account can be checked.' : 'Checking your account before opening lectures…'}</p><AccountMenu /></div></main>;
  // Remount synchronously on identity changes: no frame can render the old account's data.
  return <AccountWorkspace key={user?.id ?? 'guest'} userId={user?.id ?? null} username={user?.username ?? null} refreshAuth={recheckIdentity} />;
}

function AccountWorkspace({ userId, username, refreshAuth }: { userId: string | null; username: string | null; refreshAuth: () => Promise<void> }) {
  const sync = useStudyHistory(userId, refreshAuth);
  const { history, historyRef, ready, save } = sync;
  const [draft, setDraft] = useState<StudySession>(emptyDraft);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const mobileSidebar = useRef<HTMLDialogElement>(null);
  const editDialog = useRef<HTMLDialogElement>(null);
  const [edit, setEdit] = useState<{ id: string; action: "rename" | "delete" } | null>(null);
  const [rename, setRename] = useState("");
  const [error, setError] = useState<GenerationClientError | null>(null);
  const [pending, setPending] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  
  const [progress, setProgress] = useState("");
  const operation = useRef<Operation | null>(null);
  const extraction = useRef<AbortController | null>(null);
  const lectureInput = useRef<HTMLTextAreaElement>(null);
  const courseFileInput = useRef<HTMLInputElement>(null);
  const active = history.sessions.find((session) => session.id === history.activeId) ?? draft;
  const task = useGenerationJob({ userId, sessionId: active.id, ready, ensureSaved: sync.ensureSaved, refreshCloud: sync.refreshCloud, refreshAuth });
  const backgroundBusy = Boolean(userId && (task.action || task.restoring || isActiveJob(task.job)));
  const submitting = Boolean(task.action === 'saving' || task.action === 'submitting' || task.action === 'retrying');
  const displayedKit = task.result ?? active.kit;
  useEffect(() => {
    if (lectureInput.current) {
      lectureInput.current.style.height = "auto";
      lectureInput.current.style.height = `${Math.min(Math.max(lectureInput.current.scrollHeight, 180), 550)}px`;
    }
  }, [active.lecture]);
  const staleKit = Boolean(displayedKit && displayedKit.source.text !== active.lecture);

  useEffect(() => () => {
    operation.current?.controller.abort(); operation.current = null;
    extraction.current?.abort(); extraction.current = null;
  }, []);

  function cancel(message = "Generation canceled.") {
    operation.current?.controller.abort();
    operation.current = null;
    extraction.current?.abort(); extraction.current = null; setImporting(false);
    setPending(false);
    setProgress(message);
  }

  function updateSession(patch: Partial<Pick<StudySession, "title" | "lecture" | "outputLanguage" | "tab" | "customTitle">>) {
    if (!ready) return;
    setError(null);
    setProgress("");
    const current = historyRef.current.sessions.find((session) => session.id === historyRef.current.activeId) ?? draft;
    let next = { ...current, ...patch, updatedAt: Date.now() };
    if (patch.lecture !== undefined && !next.customTitle && patch.title === undefined) next.title = patch.lecture.trim().split(/\r?\n/)[0].slice(0, INPUT_LIMITS.maxTitleCharacters);
    if (current.id === "draft") {
      if (!next.title.trim() && !next.lecture.trim()) { setDraft(next); return; }
      next = { ...next, id: createSession().id };
      save({ ...historyRef.current, activeId: next.id, sessions: [...historyRef.current.sessions, next] });
    } else {
      save({ ...historyRef.current, sessions: historyRef.current.sessions.map((session) => session.id === next.id ? next : session) });
    }
  }

  async function importCourse(form: FormData) {
    if (!ready || pending || importing || submitting) return;
    const controller = new AbortController(); extraction.current = controller;
    const targetId = historyRef.current.activeId;
    setImportError(null); setError(null); setProgress("Extracting course content"); setImporting(true);
    try {
      const response = await fetch("/api/extract-course", { method: "POST", body: form, signal: controller.signal });
      const responseText = await response.text();
      if (extraction.current !== controller || historyRef.current.activeId !== targetId) return;
      let body: unknown = null;
      if (responseText) {
        try { body = JSON.parse(responseText); }
        catch { throw new Error("The server returned an invalid response while extracting this course. Try again shortly."); }
      }
      const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string" ? body.error.message : "Course content could not be extracted.";
      if (!response.ok) throw new Error(message);
      if (typeof body !== "object" || body === null || !("text" in body) || !("title" in body) || typeof body.text !== "string" || typeof body.title !== "string") throw new Error("The extracted course content was invalid.");
      updateSession({ lecture: body.text, title: active.customTitle ? active.title : body.title });
      setYoutubeUrl("");
      setProgress("Course content imported. Review it, then generate materials.");
      requestAnimationFrame(() => lectureInput.current?.focus());
    } catch (caught) {
      if (extraction.current !== controller) return;
      setProgress("");
      setImportError(caught instanceof Error ? caught.message : "Course content could not be extracted.");
    } finally { if (extraction.current === controller) { extraction.current = null; setImporting(false); } }
  }

  function importFile(file: File | undefined) {
    if (!file) return;
    const form = new FormData(); form.set("file", file);
    void importCourse(form);
  }

  function importYouTube() {
    const sourceUrl = youtubeUrl.trim();
    if (!sourceUrl) { setImportError("Paste a YouTube link first."); return; }
    const form = new FormData(); form.set("youtubeUrl", sourceUrl);
    void importCourse(form);
  }

  function newLecture() {
    if (!ready) return;
    cancel(""); setError(null); setDraft(emptyDraft);
    save({ ...historyRef.current, activeId: null });
    mobileSidebar.current?.close();
    requestAnimationFrame(() => lectureInput.current?.focus());
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
      next = { ...next, sessions: next.sessions.map((session) => session.id === edit.id ? { ...session, title: rename.trim(), customTitle: true, updatedAt: Date.now() } : session) };
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
    if (operation.current || pending || importing || !ready || userId && task.blocked) return;
    const normalizedLecture = normalizeLectureText(active.lecture);
    if (normalizedLecture !== active.lecture) updateSession({ lecture: normalizedLecture });
    const validation = validateGenerationInput({ title: active.title, lecture: normalizedLecture, outputLanguage: active.outputLanguage });
    if (!validation.success) { setError(new GenerationClientError(validation.error.code, validation.error.retryable)); lectureInput.current?.focus(); return; }
    if (userId) { setError(null); setProgress(''); task.create(); return; }
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

  const sidebarProps = { sessions: history.sessions, activeId: history.activeId, onNew: newLecture, onSelect: selectLecture, onEdit: openEdit, onExport: sync.download };
  return <div className={`study-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
    <aside className={`lecture-sidebar ${sidebarCollapsed ? "rail" : ""}`} aria-label="Lecture history"><HistorySidebar {...sidebarProps} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)} onClose={() => setSidebarCollapsed(true)} /></aside>
    <dialog ref={mobileSidebar} className="mobile-sidebar" aria-label="Lecture history"><HistorySidebar {...sidebarProps} collapsed={false} onToggleCollapse={() => mobileSidebar.current?.close()} onClose={() => mobileSidebar.current?.close()} /></dialog>
    <div className="workspace">
      <header className="workspace-header"><div className="header-inner">
        <button className="icon-button open-sidebar" type="button" title="Open sidebar" aria-label="Open sidebar" onClick={() => { if (matchMedia("(max-width: 767px)").matches) mobileSidebar.current?.showModal(); else setSidebarCollapsed(false); }}><PanelLeft aria-hidden="true" /></button>
        <span className="workspace-title">{active.title || "New lecture"}</span>
      </div></header>
      <main className="workspace-main">
        <StudySyncStatus sync={sync} username={username} />
        <section className="input-section" aria-labelledby="input-heading">
          <div className="input-heading-row"><h1 id="input-heading">Build your study materials</h1></div>
          <form onSubmit={submit} noValidate aria-busy={pending || importing || backgroundBusy}>
            <fieldset disabled={!ready || pending || importing || submitting} className="lecture-fields">
              <div><label htmlFor="lecture-title">Lecture title <span className="optional">(optional)</span></label><input className="text-field" id="lecture-title" value={active.title} maxLength={INPUT_LIMITS.maxTitleCharacters} onChange={(event) => updateSession({ title: event.target.value, customTitle: true })} placeholder="Untitled lecture" /></div>
              <div className="course-import" aria-label="Import course source">
                <div className="course-import-heading"><FileText aria-hidden="true" /><div><strong>Import course content</strong><span>PDF, PPTX, DOCX, TXT or Markdown up to 15 MB</span></div></div>
                <div className="course-import-controls">
                  <div className="file-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); importFile(event.dataTransfer.files[0]); }}>
                    <input ref={courseFileInput} id="course-file" type="file" accept=".pdf,.pptx,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" onChange={(event) => { importFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                    <label htmlFor="course-file"><Upload aria-hidden="true" />Drop a course file here or browse</label>
                  </div>
                  <div className="youtube-import"><label className="sr-only" htmlFor="youtube-url">YouTube video link</label><input id="youtube-url" value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="Paste a YouTube link" inputMode="url" /><Button type="button" variant="outline" onClick={importYouTube} title="Import YouTube captions"><Link aria-hidden="true" />Import captions</Button></div>
                </div>
                <p className="course-import-note">YouTube videos must be public and have captions. Save legacy PowerPoint files as .pptx first.</p>
              </div>
              <div><div className="field-heading"><label htmlFor="lecture">Lecture text</label><span id="lecture-count">{countWords(active.lecture).toLocaleString("en-US")} words · {active.lecture.length.toLocaleString("en-US")} / 60,000</span></div>
                <textarea id="lecture" ref={lectureInput} value={active.lecture} onChange={(event) => updateSession({ lecture: event.target.value })} maxLength={INPUT_LIMITS.maxCharacters} aria-describedby={error ? "lecture-count form-error" : "lecture-count"} placeholder="Lecture text" /></div>
            </fieldset>
            <div className="input-toolbar"><CustomLanguageSelect value={active.outputLanguage} disabled={!ready || pending || importing || submitting} onChange={(val) => updateSession({ outputLanguage: val })} />
              <div className="generate-actions">{pending ? <Button type="button" variant="outline" onClick={() => cancel()}><Square aria-hidden="true" />Cancel</Button> : null}<Button type="submit" disabled={!ready || pending || importing || Boolean(userId && task.blocked)}>{pending || importing || backgroundBusy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : displayedKit ? <RotateCcw aria-hidden="true" /> : <Sparkles aria-hidden="true" />}{importing ? "Importing" : task.action === 'saving' ? 'Saving lecture' : task.restoring ? 'Checking tasks' : pending || backgroundBusy ? "Generating" : displayedKit ? "Regenerate materials" : "Generate materials"}</Button></div>
            </div>
            {error && <div id="form-error" className="notice error" role="alert"><AlertCircle aria-hidden="true" /><p>{error.message}{error.retryable && " Your lecture is still here. Try generating again."}</p></div>}
            {importError && <div className="notice error" role="alert"><AlertCircle aria-hidden="true" /><p>{importError}</p></div>}
            <div className="form-footer"><span>{userId ? 'Your lectures sync with your account' : 'Guest workspace · this device only'}</span><span className="processing-status" role="status">{pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : progress && !error ? <Check aria-hidden="true" /> : null}{error ? "" : progress}</span></div>
          </form>
          {userId && <GenerationJobStatus task={task} />}
        </section>
        {staleKit && <div className="notice warning" role="status"><AlertCircle aria-hidden="true" /><p>These materials are from the previous version of this lecture. Regenerate to update them.</p></div>}
        {displayedKit ? <StudyDashboard key={`${active.id}:${displayedKit.runId}`} kit={displayedKit} tab={active.tab} onTabChange={(tab: SessionTab) => updateSession({ tab })} /> : <section className="empty-materials" aria-label="Study materials"><BookOpen aria-hidden="true" /><h2>No study materials yet</h2><div className="empty-tabs"><span>Summary</span><span>Key points</span><span>Quiz</span><span>Flashcards</span></div></section>}
      </main>
    </div>
    <dialog className="history-dialog" ref={editDialog} aria-labelledby="edit-title" onClose={() => setEdit(null)}>
      <form onSubmit={submitEdit}><h2 id="edit-title">{edit?.action === "delete" ? "Delete lecture?" : "Rename lecture"}</h2>
        {edit?.action === "delete" ? <p>{userId ? 'This deletes the lecture and its study materials from your account on all devices. If syncing fails, the deletion remains pending until you retry.' : 'This removes the lecture and its study materials from this device.'}</p> : <><label className="sr-only" htmlFor="rename-title">Lecture title</label><input className="text-field" id="rename-title" value={rename} maxLength={INPUT_LIMITS.maxTitleCharacters} onChange={(event) => setRename(event.target.value)} required /></>}
        <div className="dialog-actions"><Button type="button" variant="outline" onClick={() => editDialog.current?.close()}>Cancel</Button><Button type="submit" disabled={edit?.action === "rename" && !rename.trim()}>{edit?.action === "delete" ? "Delete" : "Save"}</Button></div>
      </form>
    </dialog>
  </div>;
}
