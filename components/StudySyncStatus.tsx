"use client";

import { Cloud, HardDrive, LoaderCircle } from 'lucide-react';
import { Button } from './ui/button';
import { useSettings } from '@/lib/i18n/SettingsContext';
import type { useStudyHistory } from './useStudyHistory';

type Props = { sync: ReturnType<typeof useStudyHistory>; username: string | null };
export function StudySyncStatus({ sync, username }: Props) {
  const { language } = useSettings();
  const zh = language === 'zh';
  const status = !sync.ready ? (zh ? '正在打开课程' : 'Opening lectures')
    : sync.conflicts.length ? (zh ? '需要处理版本冲突' : 'Resolve sync conflict')
    : sync.error ? (zh ? '未同步，请重试' : 'Not synced — retry needed')
    : sync.pending ? (zh ? '正在保存到云端' : 'Saving to cloud')
    : username ? (zh ? '已保存到云端' : 'Saved to cloud') : (zh ? '仅保存在此设备' : 'Saved on this device');
  return <section className="study-sync" aria-label={zh ? '课程同步' : 'Lecture sync'}>
    <div className="study-sync-heading">
      <div>{!sync.ready || sync.pending && !sync.error && !sync.conflicts.length ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : username ? <Cloud size={17} aria-hidden="true" /> : <HardDrive size={17} aria-hidden="true" />}<span data-testid="sync-status" role="status">{status}</span>{username && <span className="study-sync-owner">· {username}</span>}</div>
      {username && <Button type="button" variant="ghost" disabled={sync.busy} onClick={sync.retry}>{zh ? '刷新云端' : 'Refresh cloud'}</Button>}
    </div>
    {sync.error && <div className="study-sync-message" role="alert"><p>{sync.error.message}</p><div className="study-sync-actions"><Button variant="outline" onClick={sync.retry} disabled={sync.busy}>{zh ? '重试同步' : 'Retry sync'}</Button>{(sync.pending > 0 || sync.history.sessions.length > 0) && <Button variant="ghost" onClick={sync.download}>{zh ? '下载编辑备份' : 'Download edits'}</Button>}</div></div>}
    {sync.warning && <div className="study-sync-message" role="alert"><p>{sync.warning}</p><Button variant="outline" onClick={sync.download}>{zh ? '下载编辑备份' : 'Download edits'}</Button></div>}
    {username && sync.ready && sync.guestCount > 0 && <div className="study-sync-message">
      <p>{zh ? `此设备有 ${sync.guestCount} 份访客课程。是否将其复制到 ${username} 的账号？本机原件将保留。` : `${sync.guestCount} guest lectures are on this device. Copy them into ${username}'s account? The originals will stay on this device.`}</p>
      <Button variant="outline" onClick={sync.importGuests} disabled={sync.importing || sync.busy || Boolean(sync.error)}>{zh ? '导入访客课程' : 'Import guest lectures'}</Button>
    </div>}
    {sync.importMessage && <p role="status" className="study-sync-message">{sync.importMessage}</p>}
    {sync.conflicts.map(conflict => <div key={conflict.id} className="study-sync-message" role="alert">
      <strong>{zh ? '版本冲突：' : 'Sync conflict: '}{conflict.local.title || (zh ? '未命名课程' : 'Untitled lecture')}</strong>
      <p>{conflict.remote ? (zh ? '另一台设备已修改这份课程。你的编辑尚未覆盖云端版本。' : 'This lecture changed on another device. Your edits have not overwritten the cloud version.') : (zh ? '这份课程已在云端删除。可以将本地内容另存为一份新课程。' : 'This lecture was deleted in the cloud. You can keep your local content as a new lecture.')}</p>
      {conflict.deletedLocally && <p>{zh ? '本次删除尚未同步，云端版本仍保留。' : 'Your deletion has not been synced; the cloud version is preserved.'}</p>}
      <div className="study-sync-actions"><Button variant="outline" disabled={sync.busy} onClick={() => sync.resolveConflict(conflict.id, true)}>{zh ? '保留本地副本' : 'Keep local copy'}</Button><Button variant="ghost" disabled={sync.busy} onClick={() => { if (window.confirm(zh ? '放弃这份课程的本地更改，并使用云端状态？' : 'Discard local changes to this lecture and use the cloud state?')) sync.resolveConflict(conflict.id, false); }}>{zh ? '使用云端版本' : 'Use cloud version'}</Button></div>
    </div>)}
  </section>;
}
