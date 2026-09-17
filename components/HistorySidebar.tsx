"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Ellipsis, PanelLeftClose, Pencil, Search, SquarePen, Trash2, User, LogOut, Sparkles, MessageSquare, Settings } from "lucide-react";
import type { StudySession } from "@/lib/client/sessions";
import { getStoredUser, clearUser, type UserProfile } from "@/lib/client/auth";
import { useSettings } from "@/lib/i18n/SettingsContext";
import { SettingsModal } from "@/components/settings/SettingsModal";

type Props = {
  sessions: StudySession[];
  activeId: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onEdit: (id: string, action: "rename" | "delete") => void;
  onClose: () => void;
};

export function HistorySidebar({
  sessions,
  activeId,
  collapsed,
  onToggleCollapse,
  onNew,
  onSelect,
  onEdit,
}: Props) {
  const { t } = useSettings();
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(getStoredUser());
  }, []);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const visible = [...sessions]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((session) =>
      `${session.title}\n${session.lecture}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase())
    );

  const handleLogout = () => {
    clearUser();
    setUser(null);
    setUserMenuOpen(false);
  };

  return (
    <>
      <div className={`gpt-sidebar-container ${collapsed ? "is-collapsed" : "is-expanded"}`}>
        {/* 1. Standby Rail View */}
        <div className="gpt-rail-content" aria-hidden={!collapsed}>
          <button
            className="gpt-rail-btn brand"
            type="button"
            title="Expand sidebar"
            aria-label="Expand sidebar"
            onClick={onToggleCollapse}
          >
            <Sparkles size={20} />
          </button>

          <div className="gpt-rail-icons">
            <button
              className="gpt-rail-btn"
              type="button"
              title={t.newLecture}
              aria-label={t.newLecture}
              onClick={onNew}
            >
              <SquarePen size={18} />
            </button>
            <button
              className="gpt-rail-btn"
              type="button"
              title={t.searchPlaceholder}
              aria-label={t.searchPlaceholder}
              onClick={onToggleCollapse}
            >
              <Search size={18} />
            </button>
            <button
              className="gpt-rail-btn"
              type="button"
              title={t.recent}
              aria-label={t.recent}
              onClick={onToggleCollapse}
            >
              <MessageSquare size={18} />
            </button>
            <button
              className="gpt-rail-btn"
              type="button"
              title={t.settingsTitle}
              aria-label={t.settingsTitle}
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={18} />
            </button>
          </div>

          <div className="gpt-rail-bottom">
            <Link
              href={user ? "#" : "/login"}
              className="gpt-rail-avatar-link"
              title={user ? user.name : t.guestUser}
              onClick={(e) => {
                if (user) {
                  e.preventDefault();
                  onToggleCollapse();
                }
              }}
            >
              <div className="gpt-user-avatar guest small">
                <User size={15} />
              </div>
            </Link>
          </div>
        </div>

        {/* 2. Full Expanded Sidebar View */}
        <div className="gpt-expanded-content" aria-hidden={collapsed}>
          <div className="gpt-brand-row">
            <span className="gpt-brand-title">Lumina</span>
            <div className="gpt-brand-icons">
              <button
                className="gpt-icon-btn"
                type="button"
                title={t.close}
                aria-label={t.close}
                onClick={onToggleCollapse}
              >
                <PanelLeftClose size={18} />
              </button>
            </div>
          </div>

          <div className="gpt-nav-actions">
            <button
              className="gpt-nav-item primary"
              type="button"
              onClick={() => {
                setSearch("");
                setMenu(null);
                onNew();
              }}
            >
              <SquarePen size={18} />
              <span>{t.newLecture}</span>
            </button>
          </div>

          <div className="gpt-search-wrapper">
            <Search size={15} />
            <input
              type="search"
              aria-label="Search lectures"
              placeholder={t.searchPlaceholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="gpt-section-label">{t.recent}</div>
          <nav className="gpt-history-scroll" aria-label="Saved lectures">
            {visible.length === 0 && (
              <div className="gpt-empty-hint">
                {search ? t.noMatching : t.noSaved}
              </div>
            )}
            <ul className="gpt-chat-list">
              {visible.map((session) => (
                <li
                  className={`gpt-chat-item ${activeId === session.id ? "active" : ""}`}
                  key={session.id}
                >
                  <button
                    className="gpt-chat-btn"
                    type="button"
                    title={session.title || t.untitled}
                    onClick={() => {
                      setMenu(null);
                      onSelect(session.id);
                    }}
                  >
                    <span>{session.title || t.untitled}</span>
                  </button>
                  <button
                    className="gpt-item-more"
                    type="button"
                    title={t.options}
                    aria-expanded={menu === session.id}
                    onClick={() => setMenu(menu === session.id ? null : session.id)}
                  >
                    <Ellipsis size={15} />
                  </button>
                  {menu === session.id && (
                    <div className="gpt-popover-menu">
                      <button
                        type="button"
                        onClick={() => {
                          setMenu(null);
                          onEdit(session.id, "rename");
                        }}
                      >
                        <Pencil size={13} /> {t.rename}
                      </button>
                      <button
                        className="danger"
                        type="button"
                        onClick={() => {
                          setMenu(null);
                          onEdit(session.id, "delete");
                        }}
                      >
                        <Trash2 size={13} /> {t.delete}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          {/* Footer: User Account + Settings Gear Button */}
          <div className="gpt-sidebar-auth-footer">
            <div className="gpt-footer-user-row">
              {user ? (
                <div className="gpt-user-item-wrapper" style={{ flex: 1 }}>
                  <button
                    className="gpt-user-footer-btn"
                    type="button"
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                  >
                    <div className="gpt-user-avatar">
                      <User size={16} />
                    </div>
                    <div className="gpt-user-info">
                      <span className="gpt-username">{user.name}</span>
                      <span className="gpt-plan">{user.id}</span>
                    </div>
                  </button>

                  {userMenuOpen && (
                    <div className="gpt-user-dropdown">
                      <button type="button" onClick={handleLogout}>
                        <LogOut size={14} /> Log out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link href="/login" className="gpt-user-footer-btn" style={{ flex: 1 }}>
                  <div className="gpt-user-avatar guest">
                    <User size={16} />
                  </div>
                  <div className="gpt-user-info">
                    <span className="gpt-username">{t.guestUser}</span>
                    <span className="gpt-plan">{t.signInOrRegister}</span>
                  </div>
                </Link>
              )}

              {/* Setting Gear Button */}
              <button
                className="gpt-gear-btn"
                type="button"
                title={t.settingsTitle}
                aria-label={t.settingsTitle}
                onClick={() => setSettingsOpen(true)}
              >
                <Settings size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal Component */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
