"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, BookOpen, Check, CircleHelp, FileText, Layers, Link, ListChecks, LoaderCircle, PanelLeft, RotateCcw, Sparkles, Square, Upload } from "lucide-react";
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
import { displayedStudyKit } from '@/lib/client/displayed-study-kit';
import { AccountMenu } from './auth/AccountMenu';
import { useRouter } from 'next/navigation';
import { PrepArea } from './prep/PrepArea';
import { PricingArea } from './billing/PricingArea';
import { UsageHint } from './billing/UsageHint';
import { refreshBilling } from '@/lib/client/billing';
import NextLink from 'next/link';
import type { ExamId } from '@/lib/prep/exams';
import { GenerationSteps, MaterialsSkeleton } from './GenerationProgress';
import { countWords, INPUT_LIMITS, normalizeLectureText, validateGenerationInput } from "@/lib/input";
import type { GenerationStage } from "@/lib/contracts/generation";
import { generationErrorText, useWorkspaceCopy, type WorkspaceCopy } from "@/lib/i18n/workspace";

const emptyDraft: StudySession = { id: "draft", title: "", lecture: "", outputLanguage: "auto", tab: "summary", kit: null, updatedAt: 0, customTitle: false };
type Operation = { controller: AbortController; sessionId: string };
const SIDEBAR_KEY = "lumina.sidebar.collapsed";

export type PrepRoute = { exam: ExamId | null };

/**
 * `backgroundJobs` comes from the server switch. When it is off, signed-in users
 * generate in this tab (like guests) and the result is saved to their account.
 */
export function StudyWorkspace({ prep, pricing = false, backgroundJobs = false }: { prep?: PrepRoute; pricing?: boolean; backgroundJobs?: boolean } = {}) {
  const { user, ready, verified, error, recheckIdentity } = useAuth();
  const w = useWorkspaceCopy();
  if (!ready || !verified || error) return <main className="workspace-main"><div className="study-sync" role="status"><p>{error ? w.verifyUnavailable : w.verifyChecking}</p><AccountMenu /></div></main>;
  // Remount synchronously on identity changes: no frame can render the old account's data.
  return <AccountWorkspace key={user?.id ?? 'guest'} userId={user?.id ?? null} username={user?.username ?? null} refreshAuth={recheckIdentity} prep={prep} pricing={pricing} backgroundJobs={backgroundJobs} />;
}

function AccountWorkspace({ userId, username, refreshAuth, prep, pricing, backgroundJobs }: { userId: string | null; username: string | null; refreshAuth: () => Promise<void>; prep?: PrepRoute; pricing: boolean; backgroundJobs: boolean }) {
  const otherView = Boolean(prep || pricing);
  const w = useWorkspaceCopy();
  // Progress messages are stored as keys so they follow a language change made mid-task.
  const wRef = useRef<WorkspaceCopy>(w);
  useEffect(() => { wRef.current = w; });
  const jobUserId = backgroundJobs ? userId : null;
  const router = useRouter();
  const sync = useStudyHistory(userId, refreshAuth);
  const { history, historyRef, ready, save } = sync;
  const [draft, setDraft] = useState<StudySession>(emptyDraft);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return typeof window !== "undefined" && window.localStorage.getItem(SIDEBAR_KEY) === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? "1" : "0"); } catch { /* storage unavailable */ }
  }, [sidebarCollapsed]);
  const mobileSidebar = useRef<HTMLDialogElement>(null);
  const editDialog = useRef<HTMLDialogElement>(null);
  const [edit, setEdit] = useState<{ id: string; action: "rename" | "delete" } | null>(null);
  const [rename, setRename] = useState("");
  const [error, setError] = useState<GenerationClientError | null>(null);
  const [pending, setPending] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  
  const [progressText, setProgress] = useState<string | ((copy: WorkspaceCopy) => string)>("");
  const progress = typeof progressText === "function" ? progressText(w) : progressText;
  const [liveStage, setLiveStage] = useState<{ stage: GenerationStage | null; startedAt: number; done?: boolean } | null>(null);
  // Keep the finished checklist visible briefly so the user sees every step ticked off.
  useEffect(() => {
    if (!liveStage?.done) return;
    const timer = window.setTimeout(() => setLiveStage((value) => value?.done ? null : value), 6000);
    return () => window.clearTimeout(timer);
  }, [liveStage?.done]);
  const [dragging, setDragging] = useState(false);
  const operation = useRef<Operation | null>(null);
  const extraction = useRef<AbortController | null>(null);
  const lectureInput = useRef<HTMLTextAreaElement>(null);
  const courseFileInput = useRef<HTMLInputElement>(null);
  const active = history.sessions.find((session) => session.id === history.activeId) ?? draft;
  const task = useGenerationJob({ userId: jobUserId, sessionId: active.id, ready, ensureSaved: sync.ensureSaved, refreshCloud: sync.refreshCloud, refreshAuth });
  const backgroundBusy = Boolean(jobUserId && (task.action || task.restoring || isActiveJob(task.job)));
  const submitting = Boolean(task.action === 'saving' || task.action === 'submitting' || task.action === 'retrying');
  const displayedKit = displayedStudyKit(active, sync.revisionFor(active.id), task.job, task.result);
  useEffect(() => {
    if (lectureInput.current) {
      lectureInput.current.style.height = "auto";
      lectureInput.current.style.height = `${Math.min(Math.max(lectureInput.current.scrollHeight, 180), 550)}px`;
    }
  }, [active.lecture]);
  const staleKit = Boolean(displayedKit && displayedKit.source.text !== active.lecture);

  // Ctrl/⌘+B toggles the sidebar (opens the drawer on small screens).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "b") return;
      event.preventDefault();
      if (matchMedia("(max-width: 767px)").matches) {
        if (mobileSidebar.current?.open) mobileSidebar.current.close(); else mobileSidebar.current?.showModal();
      } else setSidebarCollapsed((value) => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => {
    operation.current?.controller.abort(); operation.current = null;
    extraction.current?.abort(); extraction.current = null;
  }, []);

  function cancel(message: string | ((copy: WorkspaceCopy) => string) = (copy) => copy.canceled) {
    operation.current?.controller.abort();
    operation.current = null;
    extraction.current?.abort(); extraction.current = null; setImporting(false);
    setPending(false); setLiveStage(null);
    setProgress(() => message);
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
    setImportError(null); setError(null); setProgress(() => (copy: WorkspaceCopy) => copy.extracting); setImporting(true);
    try {
      const response = await fetch("/api/extract-course", { method: "POST", body: form, signal: controller.signal });
      const responseText = await response.text();
      if (extraction.current !== controller || historyRef.current.activeId !== targetId) return;
      let body: unknown = null;
      if (responseText) {
        try { body = JSON.parse(responseText); }
        catch { throw new Error(wRef.current.extractInvalidResponse); }
      }
      const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string" ? body.error.message : wRef.current.extractFailed;
      if (!response.ok) throw new Error(message);
      if (typeof body !== "object" || body === null || !("text" in body) || !("title" in body) || typeof body.text !== "string" || typeof body.title !== "string") throw new Error(wRef.current.extractInvalid);
      updateSession({ lecture: body.text, title: active.customTitle ? active.title : body.title });
      setYoutubeUrl("");
      setProgress(() => (copy: WorkspaceCopy) => copy.imported);
      requestAnimationFrame(() => lectureInput.current?.focus());
    } catch (caught) {
      if (extraction.current !== controller) return;
      setProgress("");
      setImportError(caught instanceof Error ? caught.message : wRef.current.extractFailed);
    } finally { if (extraction.current === controller) { extraction.current = null; setImporting(false); } }
  }

  function importFile(file: File | undefined) {
    if (!file) return;
    const form = new FormData(); form.set("file", file);
    void importCourse(form);
  }

  function importYouTube() {
    const sourceUrl = youtubeUrl.trim();
    if (!sourceUrl) { setImportError(w.pasteYoutubeFirst); return; }
    const form = new FormData(); form.set("youtubeUrl", sourceUrl);
    void importCourse(form);
  }

  function newLecture() {
    if (!ready) return;
    cancel(""); setError(null); setDraft(emptyDraft);
    save({ ...historyRef.current, activeId: null });
    mobileSidebar.current?.close();
    if (otherView) { router.push("/"); return; }
    requestAnimationFrame(() => lectureInput.current?.focus());
  }

  

  function selectLecture(id: string) {
    if (!ready) return;
    cancel(""); setError(null);
    save({ ...historyRef.current, activeId: id });
    mobileSidebar.current?.close();
    if (otherView) router.push("/");
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
    if (operation.current || pending || importing || !ready || jobUserId && task.blocked) return;
    const normalizedLecture = normalizeLectureText(active.lecture);
    if (normalizedLecture !== active.lecture) updateSession({ lecture: normalizedLecture });
    const validation = validateGenerationInput({ title: active.title, lecture: normalizedLecture, outputLanguage: active.outputLanguage });
    if (!validation.success) { setError(new GenerationClientError(validation.error.code, validation.error.retryable)); lectureInput.current?.focus(); return; }
    if (jobUserId) { setError(null); setProgress(''); task.create(); return; }
    setError(null); setPending(true); setProgress(() => (copy: WorkspaceCopy) => copy.sending); setLiveStage({ stage: null, startedAt: Date.now() });
    const current: Operation = { controller: new AbortController(), sessionId: active.id };
    operation.current = current;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; current.controller.abort(); }, 270_000);
    try {
      const kit = await requestGeneration(validation.data, {
        signal: current.controller.signal,
        onEvent: (event) => {
          if (operation.current !== current) return;
          if (event.type === "stage") { const stage = event.stage; setProgress(() => (copy: WorkspaceCopy) => copy.stages[stage]); setLiveStage((value) => value && { ...value, stage: event.stage }); }
          if (event.type === "retry") { const { stage, attempt, maxAttempts } = event; setProgress(() => (copy: WorkspaceCopy) => copy.attempt(copy.stages[stage], attempt, maxAttempts)); setLiveStage((value) => value && { ...value, stage: event.stage }); }
        },
      });
      if (operation.current !== current) return;
      if (kit.source.text !== validation.data.lecture) throw new GenerationClientError("INVALID_RESPONSE", false);
      const latest = historyRef.current;
      save({ ...latest, sessions: latest.sessions.map((session) => session.id === current.sessionId ? { ...session, kit, tab: "summary", updatedAt: Date.now() } : session) });
      setProgress(() => (copy: WorkspaceCopy) => copy.ready);
      void refreshBilling();
      setLiveStage((value) => value && { ...value, stage: "complete", done: true });
    } catch (caught) {
      if (operation.current !== current) return;
      if (timedOut) setError(new GenerationClientError("TIMEOUT", true));
      else if (caught instanceof Error && caught.name === "AbortError") setProgress(() => (copy: WorkspaceCopy) => copy.canceled);
      else setError(caught instanceof GenerationClientError ? caught : new GenerationClientError("NETWORK_ERROR", true));
    } finally {
      clearTimeout(timeout);
      if (operation.current === current) { operation.current = null; setPending(false); setLiveStage((value) => value?.done ? value : null); }
    }
  }

  const sidebarProps = { sessions: history.sessions, activeId: history.activeId, onNew: newLecture, onSelect: selectLecture, onEdit: openEdit, onExport: sync.download, prepActive: Boolean(prep), pricingActive: pricing };
  return <div className={`study-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
    <aside className={`lecture-sidebar ${sidebarCollapsed ? "rail" : ""}`} aria-label={w.lectureHistory}><HistorySidebar {...sidebarProps} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)} onClose={() => setSidebarCollapsed(true)} /></aside>
    <dialog ref={mobileSidebar} className="mobile-sidebar" aria-label={w.lectureHistory}><HistorySidebar {...sidebarProps} collapsed={false} onToggleCollapse={() => mobileSidebar.current?.close()} onClose={() => mobileSidebar.current?.close()} /></dialog>
    <div className="workspace">
      <header className="workspace-header"><div className="header-inner">
        <button className="icon-button open-sidebar" type="button" title={w.openSidebar} aria-label={w.openSidebar} onClick={() => { if (matchMedia("(max-width: 767px)").matches) mobileSidebar.current?.showModal(); else setSidebarCollapsed(false); }}><PanelLeft aria-hidden="true" /></button>
        <span className="workspace-title">{prep ? w.examPrep : pricing ? w.plans : active.title || w.newLecture}</span>
      </div></header>
      {prep ? <main className="workspace-main prep-main"><PrepArea exam={prep.exam} /></main> : pricing ? <main className="workspace-main prep-main"><PricingArea /></main> : <main className="workspace-main">
        <StudySyncStatus sync={sync} username={username} />
        <section className="input-section composer" aria-labelledby="input-heading">
          <div className="composer-intro">
            <h1 id="input-heading">{w.heading}</h1>
            <p>{w.intro}</p>
          </div>
          <form onSubmit={submit} noValidate aria-busy={pending || importing || backgroundBusy}>
            <div className="lecture-fields">
              <div className="composer-box" data-dragging={dragging || undefined}
                onDragEnter={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }}
                onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
                onDrop={(event) => { if (!event.dataTransfer.files.length) return; event.preventDefault(); setDragging(false); importFile(event.dataTransfer.files[0]); }}>
                <fieldset className="composer-fields" disabled={!ready || pending || importing || submitting}>
                <label className="sr-only" htmlFor="lecture-title">{w.titleLabel}</label>
                <input className="composer-title" id="lecture-title" value={active.title} maxLength={INPUT_LIMITS.maxTitleCharacters} onChange={(event) => updateSession({ title: event.target.value, customTitle: true })} placeholder={w.titlePlaceholder} />
                <label className="sr-only" htmlFor="lecture">{w.textLabel}</label>
                <textarea id="lecture" ref={lectureInput} value={active.lecture} onChange={(event) => updateSession({ lecture: event.target.value })} maxLength={INPUT_LIMITS.maxCharacters} aria-describedby={error ? "lecture-count form-error" : "lecture-count"} placeholder={w.textPlaceholder} />
                </fieldset>
                <div className="composer-bar">
                  <span id="lecture-count" className="composer-count">{w.count(countWords(active.lecture).toLocaleString(w.numberLocale), active.lecture.length.toLocaleString(w.numberLocale), INPUT_LIMITS.maxCharacters.toLocaleString(w.numberLocale))}</span>
                  <div className="composer-actions">
                    <CustomLanguageSelect value={active.outputLanguage} disabled={!ready || pending || importing || submitting} onChange={(val) => updateSession({ outputLanguage: val })} />
                    {pending ? <Button type="button" variant="outline" onClick={() => cancel()}><Square aria-hidden="true" />{w.cancel}</Button> : null}
                    <Button type="submit" className="composer-submit" disabled={!ready || pending || importing || Boolean(jobUserId && task.blocked)}>{pending || importing || backgroundBusy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : displayedKit ? <RotateCcw aria-hidden="true" /> : <Sparkles aria-hidden="true" />}{importing ? w.importing : task.action === 'saving' ? w.savingLecture : task.restoring ? w.checkingTasks : pending || backgroundBusy ? w.generating : displayedKit ? w.regenerate : w.generate}</Button>
                  </div>
                </div>
                {dragging && <div className="composer-drop" aria-hidden="true"><Upload />{w.dropToImport}</div>}
              </div>
              <fieldset className="course-import" aria-label={w.importSource} disabled={!ready || pending || importing || submitting}>
                <span className="course-import-label">{w.orImportFrom}</span>
                <div className="file-dropzone">
                  <input ref={courseFileInput} id="course-file" type="file" accept=".pdf,.pptx,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" onChange={(event) => { importFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                  <label htmlFor="course-file"><FileText aria-hidden="true" />{w.aFile} <span>PDF, PPTX, DOCX, TXT, MD · 15 MB</span></label>
                </div>
                <div className="youtube-import"><label className="sr-only" htmlFor="youtube-url">{w.youtubeLabel}</label><Link aria-hidden="true" /><input id="youtube-url" value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); importYouTube(); } }} placeholder={w.youtubePlaceholder} inputMode="url" /><Button type="button" variant="ghost" onClick={importYouTube} title={w.importCaptionsTitle}>{w.importCaptions}</Button></div>
              </fieldset>
            </div>
            {error && <div id="form-error" className="notice error" role="alert"><AlertCircle aria-hidden="true" /><p>{generationErrorText(w, error)}{error.retryable && w.stillHere}{error.code === 'LOGIN_REQUIRED' && <> <NextLink className="notice-link" href="/login">{w.signInOrCreate}</NextLink></>}{(error.code === "PLAN_LIMIT" || error.code === "PRO_REQUIRED") && <> <NextLink className="notice-link" href="/pricing">{w.seePlans}</NextLink></>}</p></div>}
            {importError && <div className="notice error" role="alert"><AlertCircle aria-hidden="true" /><p>{importError}</p></div>}
            <div className="form-footer"><span>{userId ? w.syncAccount : w.guestWorkspace}<UsageHint /></span><span className="processing-status" role="status">{pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : progress && !error ? <Check aria-hidden="true" /> : null}<span className={pending && !error ? "shimmer-text" : undefined}>{error ? "" : progress}</span></span></div>
            {liveStage && (pending || liveStage.done) && <div className="gen-progress"><GenerationSteps stage={liveStage.stage} startedAt={liveStage.startedAt} running={!liveStage.done} /></div>}
          </form>
          {jobUserId && <GenerationJobStatus task={task} />}
        </section>
        {staleKit && <div className="notice warning" role="status"><AlertCircle aria-hidden="true" /><p>{w.stale}</p></div>}
        {displayedKit ? <StudyDashboard key={`${active.id}:${displayedKit.runId}`} kit={displayedKit} tab={active.tab} onTabChange={(tab: SessionTab) => updateSession({ tab })} /> : pending || (jobUserId && isActiveJob(task.job)) ? <MaterialsSkeleton /> : <section className="empty-materials" aria-labelledby="empty-heading"><h2 id="empty-heading">{w.emptyTitle}</h2><p className="empty-lead">{w.emptyLead}</p><ul className="empty-grid">
          <li><BookOpen aria-hidden="true" /><strong>{w.emptyItems.summary[0]}</strong><span>{w.emptyItems.summary[1]}</span></li>
          <li><ListChecks aria-hidden="true" /><strong>{w.emptyItems.keyPoints[0]}</strong><span>{w.emptyItems.keyPoints[1]}</span></li>
          <li><CircleHelp aria-hidden="true" /><strong>{w.emptyItems.quiz[0]}</strong><span>{w.emptyItems.quiz[1]}</span></li>
          <li><Layers aria-hidden="true" /><strong>{w.emptyItems.flashcards[0]}</strong><span>{w.emptyItems.flashcards[1]}</span></li>
        </ul><p className="empty-foot">{w.emptyFoot}</p></section>}
      </main>}
    </div>
    <dialog className="history-dialog" ref={editDialog} aria-labelledby="edit-title" onClose={() => setEdit(null)}>
      <form onSubmit={submitEdit}><h2 id="edit-title">{edit?.action === "delete" ? w.deleteTitle : w.renameTitle}</h2>
        {edit?.action === "delete" ? <p>{userId ? w.deleteAccount : w.deleteDevice}</p> : <><label className="sr-only" htmlFor="rename-title">{w.titleLabelPlain}</label><input className="text-field" id="rename-title" value={rename} maxLength={INPUT_LIMITS.maxTitleCharacters} onChange={(event) => setRename(event.target.value)} required /></>}
        <div className="dialog-actions"><Button type="button" variant="outline" onClick={() => editDialog.current?.close()}>{w.cancel}</Button><Button type="submit" disabled={edit?.action === "rename" && !rename.trim()}>{edit?.action === "delete" ? w.delete : w.save}</Button></div>
      </form>
    </dialog>
  </div>;
}
