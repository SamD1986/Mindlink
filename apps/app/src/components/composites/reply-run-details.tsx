import { AppIcon } from './app-icon.js';
import type { ReplyRunInfo } from './reply-run-cache.js';
import { t } from '../../languages/index.js';

export function elapsedLabel(run: Pick<ReplyRunInfo, 'createdAt' | 'updatedAt'>): string | undefined {
  const elapsed = new Date(run.updatedAt).getTime() - new Date(run.createdAt).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return undefined;
  const seconds = Math.max(1, Math.round(elapsed / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

const statusLabels: Record<ReplyRunInfo['status'], string> = {
  queued: t("等待执行"), running: t("正在处理"), waiting_approval: t("等待授权"), succeeded: t("已完成"),
  failed: t("执行失败"), cancelled: t("已取消"), interrupted: t("执行中断"), result_unknown: t("结果未知"),
};

export function ReplyRunDetails({ run, summary }: { run?: ReplyRunInfo; summary?: string }) {
  return <details className="reply-run-details">
    <summary>{summary
      ? <span className={`reply-run-meta ${run?.status ?? 'cancelled'}`}>{summary}</span>
      : run && <><span className={`reply-run-meta ${run.status}`}>{statusLabels[run.status]}</span>
        {elapsedLabel(run) && <span className="reply-run-duration">{t("· 用时")} {elapsedLabel(run)}</span>}</>}
      <AppIcon name="chevron" /></summary>
    <div className="reply-run-content">
      {run && <div className="reply-run-facts"><span>{t("开始")} {new Date(run.createdAt).toLocaleTimeString('zh-CN')}</span><span>{t("结束")} {new Date(run.updatedAt).toLocaleTimeString('zh-CN')}</span></div>}
      {run && run.events.length > 0 ? <ol>{run.events.map((event) => <li key={event.id}><span>{event.title}</span>{event.detail && <small>{event.detail}</small>}<time>{new Date(event.at).toLocaleTimeString('zh-CN')}</time></li>)}</ol> : <p>{t("没有更详细的运行步骤。")}</p>}
    </div>
  </details>;
}
