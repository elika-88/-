"use client";

import { useState } from "react";
import { Ellipsis, HardDrive, PanelLeftClose, Pencil, Search, SquarePen, Trash2 } from "lucide-react";
import type { StudySession } from "@/lib/client/sessions";

type Props = {
  sessions: StudySession[];
  activeId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onEdit: (id: string, action: "rename" | "delete") => void;
  onClose: () => void;
};

export function HistorySidebar({ sessions, activeId, onNew, onSelect, onEdit, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const visible = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((session) => `${session.title}\n${session.lecture}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  return <>
    <div className="sidebar-brand-row"><span className="sidebar-brand">Lumina</span><button className="icon-button" type="button" title="Close sidebar" aria-label="Close sidebar" onClick={onClose}><PanelLeftClose aria-hidden="true" /></button></div>
    <button className="new-lecture" type="button" onClick={() => { setSearch(""); setMenu(null); onNew(); }}><SquarePen aria-hidden="true" />New lecture</button>
    <div className="history-search"><Search aria-hidden="true" /><input type="search" aria-label="Search lectures" placeholder="Search lectures" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
    <div className="history-heading"><span>Lectures</span><span>{sessions.length}</span></div>
    <nav className="history-scroll" aria-label="Saved lectures">
      {visible.length === 0 && <p className="history-empty">{search ? "No matching lectures" : "No saved lectures yet"}</p>}
      <ul className="history-list">{visible.map((session) => <li className={`history-item ${activeId === session.id ? "selected" : ""}`} key={session.id}>
        <div className="history-row"><button className="lecture-link" type="button" aria-current={activeId === session.id ? "page" : undefined} title={session.title || "Untitled lecture"} onClick={() => { setMenu(null); onSelect(session.id); }}><span>{session.title || "Untitled lecture"}</span></button>
          <button className="icon-button history-more" type="button" title="Lecture options" aria-label={`Options for ${session.title || "Untitled lecture"}`} aria-expanded={menu === session.id} onClick={() => setMenu(menu === session.id ? null : session.id)}><Ellipsis aria-hidden="true" /></button></div>
        {menu === session.id && <div className="history-actions"><button type="button" onClick={() => { setMenu(null); onEdit(session.id, "rename"); }}><Pencil aria-hidden="true" />Rename</button><button className="danger" type="button" onClick={() => { setMenu(null); onEdit(session.id, "delete"); }}><Trash2 aria-hidden="true" />Delete</button></div>}
      </li>)}</ul>
    </nav>
    <div className="sidebar-footer"><HardDrive aria-hidden="true" /><span>Saved on this device</span></div>
  </>;
}
