"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Ellipsis, PanelLeftClose, PanelLeftOpen, Pencil, Search, SquarePen, Trash2, Settings } from "lucide-react";
import type { StudySession } from "@/lib/client/sessions";
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
};

type Group = { key: "today" | "week" | "earlier"; sessions: StudySession[] };

/** Buckets sessions (already sorted newest first) by calendar day, like chat apps do. */
function groupByDate(sessions: StudySession[], now: number): Group[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const week = today - 6 * 24 * 60 * 60 * 1000;
  const groups: Group[] = [
    { key: "today", sessions: [] },
    { key: "week", sessions: [] },
    { key: "earlier", sessions: [] },
  ];
  for (const session of sessions) {
    groups[session.updatedAt >= today ? 0 : session.updatedAt >= week ? 1 : 2].sessions.push(session);
  }
  return groups.filter((group) => group.sessions.length > 0);
}

const shortcut = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘B" : "Ctrl+B";

export function HistorySidebar({
  sessions,
  activeId,
  collapsed,
  onToggleCollapse,
  onNew,
  onSelect,
  onEdit,
  onExport,
}: Props) {
  const { t } = useSettings();
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  // Captured once per mount; good enough for day buckets and keeps render pure.
  const [now] = useState(() => Date.now());

  // Close the item menu on outside click or Escape.
  useEffect(() => {
    if (!menu) return;
    const onPointer = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".gpt-chat-item.menu-open")) setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(null); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [menu]);

  const query = search.trim().toLocaleLowerCase();
  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  const visible = query ? sorted.filter((session) => `${session.title}\n${session.lecture}`.toLocaleLowerCase().includes(query)) : sorted;
  const groups = groupByDate(visible, now);
  const groupLabel = { today: t.groupToday, week: t.groupWeek, earlier: t.groupEarlier };

  function expandAndSearch() {
    onToggleCollapse();
    // Wait for the expanded panel to become interactive (inert is lifted on the next render).
    window.setTimeout(() => searchInput.current?.focus(), 160);
  }

  return (
    <>
      <div className={`gpt-sidebar-container ${collapsed ? "is-collapsed" : "is-expanded"}`}>
        {/* 1. Collapsed rail: icons sit exactly where they are in the expanded panel. */}
        <div className="gpt-rail-content" aria-hidden={!collapsed} inert={!collapsed}>
          <button className="gpt-rail-btn brand" type="button" title={`${t.expandSidebar} (${shortcut})`} aria-label={t.expandSidebar} onClick={onToggleCollapse}>
            <Image className="sb-logo" src="/brand/lumina-logo.png" alt="" width={26} height={26} priority />
            <PanelLeftOpen className="sb-expand-icon" size={18} aria-hidden="true" />
          </button>
          <div className="gpt-rail-icons">
            <button className="gpt-rail-btn" type="button" title={t.newLecture} aria-label={t.newLecture} onClick={onNew}>
              <SquarePen size={18} />
            </button>
            <button className="gpt-rail-btn" type="button" title={t.searchPlaceholder} aria-label={t.searchPlaceholder} onClick={expandAndSearch}>
              <Search size={18} />
            </button>
          </div>
          <div className="gpt-rail-footer">
            <button className="gpt-rail-btn" type="button" title={t.settingsTitle} aria-label={t.settingsTitle} onClick={() => setSettingsOpen(true)}>
              <Settings size={18} />
            </button>
            <AccountMenu compact />
          </div>
        </div>

        {/* 2. Expanded panel */}
        <div className="gpt-expanded-content" aria-hidden={collapsed} inert={collapsed}>
          <div className="gpt-brand-row">
            <span className="gpt-brand-lockup">
              <Image src="/brand/lumina-logo.png" alt="" width={26} height={26} priority />
              <span className="gpt-brand-title">Lumina</span>
            </span>
            <button className="gpt-icon-btn" type="button" title={`${t.collapseSidebar} (${shortcut})`} aria-label={t.close} onClick={onToggleCollapse}>
              <PanelLeftClose size={18} />
            </button>
          </div>

          <div className="gpt-nav-actions">
            <button className="gpt-nav-item primary" type="button" onClick={() => { setSearch(""); setMenu(null); onNew(); }}>
              <SquarePen size={18} />
              <span>{t.newLecture}</span>
            </button>
          </div>

          <div className="gpt-search-wrapper">
            <Search size={15} />
            <input ref={searchInput} type="search" aria-label="Search lectures" placeholder={t.searchPlaceholder} value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Escape" && search) { event.stopPropagation(); setSearch(""); } }} />
          </div>

          <nav className="gpt-history-scroll" aria-label="Saved lectures">
            {visible.length === 0 && <div className="gpt-empty-hint">{search ? t.noMatching : t.noSaved}</div>}
            {groups.map((group) => (
              <section key={group.key} className="gpt-history-group" aria-label={groupLabel[group.key]}>
                <div className="gpt-section-label">{groupLabel[group.key]}</div>
                <ul className="gpt-chat-list">
                  {group.sessions.map((session) => (
                    <li className={`gpt-chat-item ${activeId === session.id ? "active" : ""} ${menu === session.id ? "menu-open" : ""}`} key={session.id}>
                      <button className="gpt-chat-btn" type="button" aria-current={activeId === session.id ? "page" : undefined} title={session.title || t.untitled}
                        onClick={() => { setMenu(null); onSelect(session.id); }}>
                        <span>{session.title || t.untitled}</span>
                      </button>
                      <button className="gpt-item-more" type="button" title={t.options} aria-label={t.options} aria-haspopup="menu" aria-expanded={menu === session.id}
                        onClick={() => setMenu(menu === session.id ? null : session.id)}>
                        <Ellipsis size={15} />
                      </button>
                      {menu === session.id && (
                        <div className="gpt-popover-menu" role="menu">
                          <button type="button" role="menuitem" onClick={() => { setMenu(null); onEdit(session.id, "rename"); }}>
                            <Pencil size={13} /> {t.rename}
                          </button>
                          <button className="danger" type="button" role="menuitem" onClick={() => { setMenu(null); onEdit(session.id, "delete"); }}>
                            <Trash2 size={13} /> {t.delete}
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
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
