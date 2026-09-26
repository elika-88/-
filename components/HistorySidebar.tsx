"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { Ellipsis, GraduationCap, History, PanelLeft, Pencil, Pin, PinOff, Plus, Search, Settings, Trash2 } from "lucide-react";
import type { StudySession } from "@/lib/client/sessions";
import { togglePinnedLecture, usePinnedLectures } from "@/lib/client/pinned-lectures";
import { useSettings } from "@/lib/i18n/SettingsContext";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { AccountMenu } from "@/components/auth/AccountMenu";

type Props = {
  sessions: StudySession[];
  activeId: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onEdit: (id: string, action: "rename" | "delete") => void;
  onClose: () => void;
  onExport?: () => void;
  prepActive?: boolean;
};

const shortcut = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘B" : "Ctrl+B";
const PEEK_OPEN_DELAY = 180;
const PEEK_CLOSE_DELAY = 220;

/**
 * Lecture sidebar, Claude-style:
 *  - expanded: brand, primary "New lecture", search, Pinned + Recents, account card
 *  - collapsed: a slim icon rail; hovering the Recents icon "peeks" the full panel
 *    as a floating card without changing the layout, clicking pins it open.
 */
export function HistorySidebar({ sessions, activeId, collapsed, onToggleCollapse, onNew, onSelect, onEdit, onExport, prepActive = false }: Props) {
  const { t } = useSettings();
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<number | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const pinnedIds = usePinnedLectures();
  const peeking = collapsed && peek;
  const panelHidden = collapsed && !peek;

  // Close the item menu on outside click or Escape; Escape also dismisses the peek.
  useEffect(() => {
    if (!menu && !peeking) return;
    const onPointer = (event: PointerEvent) => {
      if (menu && (!(event.target instanceof Element) || !event.target.closest(".gpt-chat-item.menu-open"))) setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (menu) setMenu(null); else setPeek(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [menu, peeking]);

  useEffect(() => () => { if (peekTimer.current) window.clearTimeout(peekTimer.current); }, []);

  function schedulePeek(open: boolean, event?: ReactPointerEvent) {
    if (event && event.pointerType !== "mouse") return;
    if (peekTimer.current) window.clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => { setPeek(open); if (!open) setMenu(null); }, open ? PEEK_OPEN_DELAY : PEEK_CLOSE_DELAY);
  }
  function cancelPeekClose() { if (peeking && peekTimer.current) window.clearTimeout(peekTimer.current); }

  const query = search.trim().toLocaleLowerCase();
  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  const visible = query ? sorted.filter((session) => `${session.title}\n${session.lecture}`.toLocaleLowerCase().includes(query)) : sorted;
  const pinned = visible.filter((session) => pinnedIds.includes(session.id));
  const recent = visible.filter((session) => !pinnedIds.includes(session.id));
  const sections = [
    { key: "pinned", label: t.pinned, items: pinned },
    { key: "recent", label: t.recent, items: recent },
  ].filter((section) => section.items.length > 0);

  function expand(focusSearch = false) {
    setPeek(false);
    onToggleCollapse();
    if (focusSearch) window.setTimeout(() => searchInput.current?.focus(), 160);
  }

  return (
    <>
      <div className={`gpt-sidebar-container ${collapsed ? "is-collapsed" : "is-expanded"} ${peeking ? "is-peek" : ""}`}>
        {/* Collapsed rail */}
        <div className="gpt-rail-content" aria-hidden={!collapsed} inert={!collapsed}>
          <button className="gpt-rail-btn brand" type="button" title={`${t.expandSidebar} (${shortcut})`} aria-label={t.expandSidebar} onClick={() => expand()}>
            <Image className="sb-logo" src="/brand/lumina-logo.png" alt="" width={26} height={26} priority />
            <PanelLeft className="sb-expand-icon" size={18} aria-hidden="true" />
          </button>
          <div className="gpt-rail-icons">
            <button className="gpt-rail-btn sb-new" type="button" title={t.newLecture} aria-label={t.newLecture} onClick={onNew}>
              <span className="sb-new-dot"><Plus size={15} strokeWidth={2.4} /></span>
            </button>
            <button className="gpt-rail-btn" type="button" title={t.searchPlaceholder} aria-label={t.searchPlaceholder} onClick={() => expand(true)}>
              <Search size={18} />
            </button>
            <Link href="/prep" className={`gpt-rail-btn ${prepActive ? "is-active" : ""}`} title={t.examPrep} aria-label={t.examPrep} aria-current={prepActive ? "page" : undefined}>
              <GraduationCap size={18} />
            </Link>
            <button className={`gpt-rail-btn ${peeking ? "is-active" : ""}`} type="button" title={t.showRecents} aria-label={t.showRecents} aria-expanded={peeking}
              onPointerEnter={(event) => schedulePeek(true, event)} onPointerLeave={(event) => schedulePeek(false, event)} onClick={() => expand()}>
              <History size={18} />
            </button>
          </div>
          <div className="gpt-rail-footer">
            <button className="gpt-rail-btn" type="button" title={t.settingsTitle} aria-label={t.settingsTitle} onClick={() => setSettingsOpen(true)}>
              <Settings size={18} />
            </button>
            <AccountMenu compact />
          </div>
        </div>

        {/* Full panel (also used as the floating "peek" card while collapsed) */}
        <div className="gpt-expanded-content" aria-hidden={panelHidden} inert={panelHidden}
          onPointerEnter={cancelPeekClose} onPointerLeave={(event) => { if (peeking) schedulePeek(false, event); }}>
          <div className="gpt-brand-row">
            <span className="gpt-brand-lockup">
              <Image src="/brand/lumina-logo.png" alt="" width={24} height={24} priority />
              <span className="gpt-brand-title">Lumina</span>
            </span>
            <button className="gpt-icon-btn" type="button" title={`${peeking ? t.expandSidebar : t.collapseSidebar} (${shortcut})`} aria-label={peeking ? t.expandSidebar : t.close} onClick={() => peeking ? expand() : onToggleCollapse()}>
              <PanelLeft size={18} />
            </button>
          </div>

          <div className="gpt-nav-actions">
            <button className="gpt-nav-item primary" type="button" onClick={() => { setSearch(""); setMenu(null); setPeek(false); onNew(); }}>
              <span className="sb-new-dot"><Plus size={15} strokeWidth={2.4} /></span>
              <span>{t.newLecture}</span>
            </button>
            <label className="gpt-search-wrapper">
              <Search size={17} />
              <input ref={searchInput} type="search" aria-label="Search lectures" placeholder={t.searchPlaceholder} value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Escape" && search) { event.stopPropagation(); setSearch(""); } }} />
            </label>
            <Link href="/prep" className={`gpt-nav-item sb-prep ${prepActive ? "is-active" : ""}`} aria-current={prepActive ? "page" : undefined} onClick={() => setPeek(false)}>
              <GraduationCap size={18} />
              <span>{t.examPrep}</span>
              <span className="sb-badge">SAT · IELTS · TOEFL</span>
            </Link>
          </div>

          <nav className="gpt-history-scroll" aria-label="Saved lectures">
            {visible.length === 0 && <div className="gpt-empty-hint">{search ? t.noMatching : t.noSaved}</div>}
            {sections.map((section) => (
              <section key={section.key} className="gpt-history-group" aria-label={section.label}>
                <div className="gpt-section-label">{section.label}</div>
                <ul className="gpt-chat-list">
                  {section.items.map((session) => {
                    const isPinned = pinnedIds.includes(session.id);
                    return (
                      <li className={`gpt-chat-item ${activeId === session.id && !prepActive ? "active" : ""} ${menu === session.id ? "menu-open" : ""}`} key={session.id}>
                        <button className="gpt-chat-btn" type="button" aria-current={activeId === session.id && !prepActive ? "page" : undefined} title={session.title || t.untitled}
                          onClick={() => { setMenu(null); setPeek(false); onSelect(session.id); }}>
                          <span>{session.title || t.untitled}</span>
                        </button>
                        <button className="gpt-item-more" type="button" title={t.options} aria-label={t.options} aria-haspopup="true" aria-expanded={menu === session.id}
                          onClick={() => setMenu(menu === session.id ? null : session.id)}>
                          <Ellipsis size={15} />
                        </button>
                        {menu === session.id && (
                          <div className="gpt-popover-menu">
                            <button type="button" onClick={() => { setMenu(null); togglePinnedLecture(session.id); }}>
                              {isPinned ? <PinOff size={14} /> : <Pin size={14} />} {isPinned ? t.unpin : t.pin}
                            </button>
                            <button type="button" onClick={() => { setMenu(null); onEdit(session.id, "rename"); }}>
                              <Pencil size={14} /> {t.rename}
                            </button>
                            <button className="danger" type="button" onClick={() => { setMenu(null); onEdit(session.id, "delete"); }}>
                              <Trash2 size={14} /> {t.delete}
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </nav>

          <div className="gpt-sidebar-auth-footer">
            <AccountMenu />
            <div className="gpt-footer-user-row">
              <button className="gpt-nav-item" type="button" title={t.settingsTitle} aria-label={t.settingsTitle} onClick={() => setSettingsOpen(true)}>
                <Settings size={18} />
                <span>{t.settingsTitle}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onExport={onExport} />
    </>
  );
}
