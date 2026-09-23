"use client";

import { AlertCircle, Check, Clock3, LoaderCircle, RotateCcw, Square } from 'lucide-react';
import { Button } from './ui/button';
import { isActiveJob } from '@/lib/client/generation-jobs';
import { useSettings } from '@/lib/i18n/SettingsContext';
import type { useGenerationJob } from './useGenerationJob';

export function GenerationJobStatus({ task }: { task: ReturnType<typeof useGenerationJob> }) {
  const { language } = useSettings();
  const zh = language === 'zh';
  const { job, action, restoring, error } = task;
  if (!job && !action && !restoring && !error) return null;
  const active = isActiveJob(job);
  const busy = Boolean(action) || restoring;
  const labels = zh
    ? { queued: '排队中', running: '生成中', succeeded: '生成成功', failed: '生成失败', cancelled: '已取消' }
    : { queued: 'Queued', running: 'Running', succeeded: 'Succeeded', failed: 'Failed', cancelled: 'Cancelled' };
  const actions = zh
    ? { saving: '正在确认课程已保存到云端…', submitting: '正在提交后台任务…', cancelling: '正在取消任务…', retrying: '正在重试任务…' }
    : { saving: 'Confirming your lecture is saved to the cloud…', submitting: 'Submitting background task…', cancelling: 'Cancelling task…', retrying: 'Retrying task…' };
  const stageLabels = zh
    ? { validating: '校验课程', analyzing: '分析课程', generating: '生成学习材料', verifying: '核对来源证据', correcting: '修正学习材料', complete: '完成' }
    : { validating: 'Validating lecture', analyzing: 'Analyzing lecture', generating: 'Generating study materials', verifying: 'Checking source evidence', correcting: 'Refining study materials', complete: 'Complete' };
  const Icon = busy || active ? job?.status === 'queued' && !busy ? Clock3 : LoaderCircle : job?.status === 'failed' || error ? AlertCircle : job?.status === 'cancelled' ? Square : Check;
  return <section className="generation-job" aria-label={zh ? '后台生成任务' : 'Background generation'} data-testid="generation-job">
    <div className="generation-job-heading" role="status" aria-live="polite" aria-atomic="true">
      <Icon size={18} aria-hidden="true" className={Icon === LoaderCircle ? 'animate-spin' : undefined} />
      <div><strong>{action ? actions[action] : restoring ? (zh ? '正在恢复任务状态…' : 'Checking for existing tasks…') : job ? labels[job.status] : (zh ? '任务连接中断' : 'Task connection interrupted')}</strong>
        {job?.stage && <p data-testid="generation-stage">{stageLabels[job.stage]} <span>({job.stage})</span></p>}
      </div>
    </div>
    {active && <p>{zh ? '任务在后台运行，刷新或离开页面后仍会继续。' : 'Your task continues in the background, even if you refresh or leave this page.'}</p>}
    {job?.status === 'failed' && <p role="alert">{job.error?.message || (zh ? '生成失败，请重试。' : 'Generation failed. Please try again.')}</p>}
    {job?.status === 'cancelled' && <p>{zh ? '任务已取消。你的课程仍保留。' : 'The task was cancelled. Your lecture is still saved.'}</p>}
    {job?.status === 'succeeded' && job.savedSessionId && job.savedSessionId !== job.sessionId && <p>{zh ? '生成期间课程发生变化，结果已另存为副本。云端课程列表已请求刷新。' : 'The lecture changed during generation. The result was saved as a separate copy. The cloud lecture list is being refreshed.'}</p>}
    {job?.status === 'succeeded' && job.saveDisposition === 'result_only' && <p>{zh ? '结果已生成，但未保存为课程。请从下方学习材料导出备份。' : 'The result is ready but could not be saved as a lecture. Export the materials below to keep a copy.'}</p>}
    {error && <p className="generation-job-error" role="alert">{error}</p>}
    <div className="generation-job-actions">
      {active && <Button type="button" variant="outline" disabled={busy} onClick={task.cancel}><Square aria-hidden="true" />{zh ? '取消任务' : 'Cancel task'}</Button>}
      {!active && (job?.status === 'failed' || job?.status === 'cancelled') && !task.uncertain && <Button type="button" variant="outline" disabled={busy} onClick={task.retry}><RotateCcw aria-hidden="true" />{zh ? '重试' : 'Retry task'}</Button>}
      {error && <Button type="button" variant="outline" disabled={busy} onClick={task.reconnect}>{zh ? '重新连接' : 'Check again'}</Button>}
    </div>
    {!active && (job?.status === 'failed' || job?.status === 'cancelled') && <p className="generation-job-note">{zh ? '重试使用原任务的课程版本。如需使用编辑后的内容，请重新生成。' : 'Retry uses the original lecture version. Generate again to use your latest edits.'}</p>}
  </section>;
}
