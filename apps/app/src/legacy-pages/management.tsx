import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  ScheduleHistoryRecord,
  ScheduleInput,
  SchedulePrivateContact,
  ScheduleRecord,
  WecomConnectionList,
  WecomConnectionSummary,
} from '@mindlink-agent/protocol';
import { SCHEDULE_CONTRACT_VERSION } from '@mindlink-agent/protocol';

import './management.css';
import { t } from '../languages/index.js';

type EditorMode = 'detail' | 'create' | 'edit';

const previewSchedule: ScheduleRecord = {
  scheduleId: 'preview-daily-summary',
  revision: 1,
  name: t("每日工作摘要"),
  prompt: t("汇总昨日工作进展、关键事项与今日重点。"),
  workspaceId: '/work',
  timing: { kind: 'cron', expression: '0 9 * * *' },
  timeZone: 'Asia/Shanghai',
  enabled: true,
  misfirePolicy: 'coalesce',
  maximumLatenessMs: 86_400_000,
  allowOverlap: false,
  conversationId: 'preview-conversation',
  delivery: { kind: 'desktop' },
  nextTriggerAt: '2026-09-24T01:00:00.000Z',
  createdAt: '2026-09-23T01:00:00.000Z',
  updatedAt: '2026-09-23T01:00:00.000Z',
};

const previewHistory: ScheduleHistoryRecord[] = [{
  triggerKey: 'preview-trigger',
  scheduleId: previewSchedule.scheduleId,
  scheduleRevision: 1,
  scheduledAt: '2026-09-23T01:00:00.000Z',
  triggerStatus: 'submitted',
  runId: 'preview-run',
  runStatus: 'succeeded',
  output: { message: t("已生成今日工作摘要。"), tools: [] },
  deliveryStatus: 'delivered',
  createdAt: '2026-09-23T01:00:00.000Z',
  updatedAt: '2026-09-23T01:00:28.000Z',
}];

function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function timeLabel(value: string | undefined, timeZone: string): string {
  if (!value) return t("尚未安排");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("时间不可用");
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function runLabel(status: ScheduleHistoryRecord['runStatus']): string {
  return ({
    queued: t("排队中"), running: t("执行中"), waiting_approval: t("等待授权"), succeeded: t("执行成功"),
    failed: t("执行失败"), cancelled: t("已取消"), interrupted: t("已中断"), result_unknown: t("结果未知"),
  } as Record<string, string>)[status ?? ''] ?? t("尚未执行");
}

function deliveryLabel(status: ScheduleHistoryRecord['deliveryStatus']): string {
  return ({
    pending: t("等待投递"), delivering: t("投递中"), delivered: t("已送达"), failed: t("投递失败"),
    result_unknown: t("投递结果未知"),
  } as Record<string, string>)[status ?? ''] ?? t("未投递");
}

function draftFromSchedule(schedule: ScheduleRecord): ScheduleInput {
  return {
    contractVersion: SCHEDULE_CONTRACT_VERSION,
    name: schedule.name,
    prompt: schedule.prompt,
    workspaceId: schedule.workspaceId,
    timing: schedule.timing,
    timeZone: schedule.timeZone,
    enabled: schedule.enabled,
    misfirePolicy: schedule.misfirePolicy,
    maximumLatenessMs: schedule.maximumLatenessMs,
    allowOverlap: schedule.allowOverlap,
    conversationId: schedule.conversationId,
    delivery: schedule.delivery,
  };
}

function blankDraft(workspaceId: string): ScheduleInput {
  return {
    contractVersion: SCHEDULE_CONTRACT_VERSION,
    name: '',
    prompt: '',
    workspaceId,
    timing: { kind: 'cron', expression: '0 9 * * *' },
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
    enabled: true,
    delivery: { kind: 'desktop' },
  };
}

function ManagementStatus({ kind, children }: { kind: string; children: ReactNode }) {
  return <span className={`management-status ${kind}`}>{children}</span>;
}

export function ScheduleManagement({
  active,
  requestedScheduleId,
  onOpenRun,
}: {
  active: boolean;
  requestedScheduleId?: string;
  onOpenRun: (runId: string, conversationId: string, scheduleId: string) => void;
}) {
  const desktop = window.mindlink;
  const [schedules, setSchedules] = useState<ScheduleRecord[]>(desktop ? [] : [previewSchedule]);
  const [contacts, setContacts] = useState<SchedulePrivateContact[]>([]);
  const [workspaceId, setWorkspaceId] = useState('/work');
  const [selectedId, setSelectedId] = useState<string>();
  const [mode, setMode] = useState<EditorMode>('detail');
  const [draft, setDraft] = useState<ScheduleInput>(() => blankDraft('/work'));
  const [preview, setPreview] = useState<{ nextTriggerAt?: string; key: string }>();
  const [history, setHistory] = useState<ScheduleHistoryRecord[]>([]);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [detailError, setDetailError] = useState<string>();
  const [editorError, setEditorError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [mobileDetail, setMobileDetail] = useState(false);

  const selected = useMemo(
    () => schedules.find((schedule) => schedule.scheduleId === selectedId) ?? schedules[0],
    [schedules, selectedId],
  );

  async function refresh() {
    setLoading(true);
    setError(undefined);
    try {
      if (desktop) {
        const list = await desktop.listSchedules();
        setSchedules(list);
        setSelectedId((current) => list.some((schedule) => schedule.scheduleId === current)
          ? current : list[0]?.scheduleId);
        const [targets, info] = await Promise.allSettled([
          desktop.listSchedulePrivateContacts(), desktop.runtimeInfo(),
        ]);
        if (targets.status === 'fulfilled') setContacts(targets.value);
        if (info.status === 'fulfilled') setWorkspaceId(info.value.workingDirectory ?? '');
        if (targets.status === 'rejected' || info.status === 'rejected') {
          setError(t("任务已读取，但私聊目标或工作区信息暂不可用。请刷新重试。"));
        }
      } else {
        setSelectedId((current) => current ?? previewSchedule.scheduleId);
      }
      setHistoryRevision((current) => current + 1);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (active) void refresh();
  }, [active, desktop]);

  useEffect(() => {
    if (requestedScheduleId) {
      setSelectedId(requestedScheduleId);
      setMode('detail');
      setMobileDetail(true);
    }
  }, [requestedScheduleId]);

  useEffect(() => {
    if (!active || !selected || mode !== 'detail') return;
    let stale = false;
    setHistoryLoading(true);
    setDetailError(undefined);
    if (!desktop) {
      setHistory(selected.scheduleId === previewSchedule.scheduleId ? previewHistory : []);
      setHistoryLoading(false);
      return;
    }
    void desktop.getScheduleHistory(selected.scheduleId, 30).then(
      (records) => { if (!stale) setHistory(records); },
      (loadError) => { if (!stale) setDetailError(friendlyError(loadError)); },
    ).finally(() => { if (!stale) setHistoryLoading(false); });
    return () => { stale = true; };
  }, [active, selected?.scheduleId, mode, desktop, historyRevision]);

  function beginCreate() {
    setDraft(blankDraft(workspaceId));
    setPreview(undefined);
    setEditorError(undefined);
    setNotice(undefined);
    setMode('create');
    setMobileDetail(true);
  }

  function beginEdit(schedule: ScheduleRecord) {
    setDraft(draftFromSchedule(schedule));
    setPreview(undefined);
    setEditorError(undefined);
    setNotice(undefined);
    setMode('edit');
    setMobileDetail(true);
  }

  function updateDraft(next: ScheduleInput) {
    setDraft(next);
    setPreview(undefined);
    setEditorError(undefined);
  }

  async function checkPreview() {
    setBusy(true);
    setEditorError(undefined);
    try {
      if (!draft.name.trim() || !draft.prompt.trim() || !draft.workspaceId.trim()) {
        throw new Error(t("请填写任务名称、执行指令和工作区。"));
      }
      if (draft.delivery.kind === 'channel' && !draft.delivery.routeId) {
        throw new Error(t("请先绑定并选择一个已观察到的私聊目标。"));
      }
      const value = desktop
        ? await desktop.previewSchedule(draft)
        : { nextTriggerAt: draft.enabled ? previewSchedule.nextTriggerAt : undefined };
      setPreview({ ...value, key: JSON.stringify(draft) });
    } catch (previewError) {
      setEditorError(friendlyError(previewError));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!preview || preview.key !== JSON.stringify(draft) || busy) return;
    setBusy(true);
    setEditorError(undefined);
    try {
      if (!desktop) {
        const record: ScheduleRecord = {
          ...previewSchedule, ...draft,
          scheduleId: mode === 'edit' && selected ? selected.scheduleId : `preview-${Date.now()}`,
          revision: mode === 'edit' && selected ? selected.revision + 1 : 1,
          conversationId: draft.conversationId ?? `preview-conversation-${Date.now()}`,
          nextTriggerAt: preview.nextTriggerAt,
        };
        setSchedules((current) => mode === 'edit'
          ? current.map((schedule) => schedule.scheduleId === record.scheduleId ? record : schedule)
          : [record, ...current]);
        setSelectedId(record.scheduleId);
      } else {
        const record = mode === 'edit' && selected
          ? await desktop.updateSchedule(selected.scheduleId, draft)
          : await desktop.createSchedule(draft);
        setSelectedId(record.scheduleId);
        setSchedules((current) => mode === 'edit'
          ? current.map((item) => item.scheduleId === record.scheduleId ? record : item)
          : [record, ...current]);
        await refresh();
      }
      setMode('detail');
      setNotice(desktop ? t("任务已保存；下次触发时间来自 Runtime。") : t("浏览器演示：任务仅保存在当前页面。"));
    } catch (saveError) {
      setEditorError(friendlyError(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(schedule: ScheduleRecord) {
    setBusy(true);
    setDetailError(undefined);
    try {
      if (desktop) {
        await desktop.setScheduleEnabled(schedule.scheduleId, !schedule.enabled);
        await refresh();
      } else {
        setSchedules((current) => current.map((item) => item.scheduleId === schedule.scheduleId
          ? { ...item, enabled: !item.enabled, nextTriggerAt: item.enabled ? undefined : item.nextTriggerAt }
          : item));
      }
    } catch (toggleError) {
      setDetailError(friendlyError(toggleError));
    } finally {
      setBusy(false);
    }
  }

  async function bindContact(contact: SchedulePrivateContact) {
    setBusy(true);
    setEditorError(undefined);
    try {
      const bound = desktop ? await desktop.bindSchedulePrivateContact(contact.contactId) : { routeId: 'preview-route' };
      setContacts((current) => current.map((item) => item.contactId === contact.contactId
        ? { ...item, boundRouteId: bound.routeId } : item));
      updateDraft({ ...draft, delivery: { kind: 'channel', routeId: bound.routeId } });
    } catch (bindError) {
      setEditorError(friendlyError(bindError));
    } finally {
      setBusy(false);
    }
  }

  const activePreview = preview?.key === JSON.stringify(draft) ? preview : undefined;

  return (
    <section className={`management-panel ${active ? '' : 'view-hidden'}`} aria-hidden={!active}>
      <header className="management-header">
        <div><h1>{t("定时任务")}</h1><p>{t("让 MindLink 按计划执行任务，并分别查看执行与投递结果。")}</p></div>
        <div className="management-header-actions">
          <ManagementStatus kind={desktop ? 'good' : 'muted'}>{desktop ? t("Runtime 数据") : t("浏览器演示数据")}</ManagementStatus>
          <button type="button" className="management-primary" onClick={beginCreate}>{t("＋ 新建任务")}</button>
        </div>
      </header>
      <div className={`management-body ${mobileDetail ? 'mobile-detail-open' : ''}`}>
        <aside className="management-list">
          <div className="management-list-heading"><strong>{t("任务列表")} <span>({schedules.length})</span></strong><button type="button" onClick={() => void refresh()} disabled={loading}>{t("刷新")}</button></div>
          {error && <div className="management-alert" role="alert">{t("读取失败：")}{error}<button type="button" onClick={() => void refresh()}>{t("重试")}</button></div>}
          {loading && schedules.length === 0 && <div className="management-empty">{t("正在读取任务…")}</div>}
          {!loading && !error && schedules.length === 0 && <div className="management-empty"><strong>{t("还没有定时任务")}</strong><span>{t("新建任务后可在此查看下次执行时间和历史结果。")}</span></div>}
          <div className="management-items">
            {schedules.map((schedule) => (
              <button type="button" key={schedule.scheduleId} className={`management-item ${selected?.scheduleId === schedule.scheduleId && mode !== 'create' ? 'selected' : ''}`} onClick={() => { setSelectedId(schedule.scheduleId); setMode('detail'); setNotice(undefined); setMobileDetail(true); }}>
                <span className="management-item-title"><strong>{schedule.name}</strong><ManagementStatus kind={schedule.enabled ? 'good' : 'muted'}>{schedule.enabled ? t("已启用") : t("已停用")}</ManagementStatus></span>
                <span>{schedule.timing.kind === 'cron' ? schedule.timing.expression : t("单次执行")} · {schedule.timeZone}</span>
                <small>{t("下次触发：")}{timeLabel(schedule.nextTriggerAt, schedule.timeZone)}</small>
              </button>
            ))}
          </div>
        </aside>
        <div className="management-detail">
          <button type="button" className="management-mobile-back" onClick={() => setMobileDetail(false)}>{t("← 返回任务列表")}</button>
          {mode === 'detail' && selected && (
            <>
              <div className="management-detail-heading">
                <div><div className="management-title-row"><h2>{selected.name}</h2><ManagementStatus kind={selected.enabled ? 'good' : 'muted'}>{selected.enabled ? t("已启用") : t("已停用")}</ManagementStatus></div><p>{selected.prompt}</p></div>
                <div className="management-actions"><button type="button" onClick={() => beginEdit(selected)}>{t("编辑")}</button><button type="button" onClick={() => void toggle(selected)} disabled={busy}>{busy ? t("处理中…") : selected.enabled ? t("暂停") : t("启用")}</button></div>
              </div>
              {notice && <div className="management-success" role="status">{notice}</div>}
              {detailError && <div className="management-alert" role="alert">{detailError}<button type="button" onClick={() => setDetailError(undefined)}>{t("关闭")}</button></div>}
              <dl className="management-facts">
                <div><dt>{t("执行指令")}</dt><dd>{selected.prompt}</dd></div>
                <div><dt>{t("工作区")}</dt><dd>{selected.workspaceId}</dd></div>
                <div><dt>{t("输出目标")}</dt><dd>{selected.delivery.kind === 'channel' ? t("企业微信私聊") : selected.delivery.kind === 'desktop' ? t("桌面对话") : t("不投递")}</dd></div>
                <div><dt>{t("下次触发")}</dt><dd>{timeLabel(selected.nextTriggerAt, selected.timeZone)}（{selected.timeZone}）</dd></div>
              </dl>
              <div className="management-section-title"><h3>{t("执行记录")}</h3><span>{t("Agent 执行与消息投递分别记录")}</span></div>
              {historyLoading && <div className="management-empty">{t("正在读取执行记录…")}</div>}
              {!historyLoading && history.length === 0 && !detailError && <div className="management-empty">{t("尚无执行记录。任务触发后将在这里显示运行与投递结果。")}</div>}
              <div className="management-history">
                {!historyLoading && history.map((record) => (
                  <article className="management-run" key={record.triggerKey}>
                    <div><time>{timeLabel(record.scheduledAt, selected.timeZone)}</time><small>{record.triggerStatus === 'skipped_misfire' ? t("错过执行") : record.triggerStatus === 'skipped_overlap' ? t("并发跳过") : t("计划触发")}</small></div>
                    <div><span>Agent</span><ManagementStatus kind={record.runStatus === 'succeeded' ? 'good' : record.runStatus === 'failed' || record.runStatus === 'result_unknown' ? 'bad' : 'warn'}>{runLabel(record.runStatus)}</ManagementStatus></div>
                    <div><span>{t("消息投递")}</span><ManagementStatus kind={record.deliveryStatus === 'delivered' ? 'good' : record.deliveryStatus === 'failed' || record.deliveryStatus === 'result_unknown' ? 'bad' : 'muted'}>{deliveryLabel(record.deliveryStatus)}</ManagementStatus></div>
                    {record.runId && <button type="button" onClick={() => onOpenRun(record.runId!, selected.conversationId, selected.scheduleId)}>{t("查看会话 ↗")}</button>}
                    {record.output?.message && <p className="management-run-output">{t("结果：")}{record.output.message}</p>}
                    {record.runFailure && <p role="alert">{t("执行失败：")}{record.runFailure.message}</p>}
                    {record.deliveryError && <p role="alert">{t("投递失败：")}{record.deliveryError}</p>}
                  </article>
                ))}
              </div>
            </>
          )}
          {mode === 'detail' && !selected && <div className="management-empty">{t("请选择或新建一个定时任务。")}</div>}
          {mode !== 'detail' && (
            <div className="management-editor">
              <div className="management-detail-heading"><div><h2>{mode === 'create' ? t("新建任务") : t("编辑 {0}", { 0: selected?.name ?? t("任务") })}</h2><p>{t("先校验并预览下次触发，再保存至 Runtime。")}</p></div><button type="button" onClick={() => setMode('detail')}>{t("取消编辑")}</button></div>
              {editorError && <div className="management-alert" role="alert">{editorError}</div>}
              <div className="management-form">
                <label>{t("任务名称")}<input value={draft.name} maxLength={200} onChange={(event) => updateDraft({ ...draft, name: event.target.value })} placeholder={t("例如：每日工作摘要")} /></label>
                <label>{t("执行指令")}<textarea value={draft.prompt} onChange={(event) => updateDraft({ ...draft, prompt: event.target.value })} placeholder={t("告诉 Agent 要完成什么")} rows={4} /></label>
                <label>{t("工作区")}<input value={draft.workspaceId} onChange={(event) => updateDraft({ ...draft, workspaceId: event.target.value })} /></label>
                <div className="management-form-grid">
                  <label>{t("执行方式")}<select value={draft.timing.kind} onChange={(event) => updateDraft({ ...draft, timing: event.target.value === 'once' ? { kind: 'once', at: '' } : { kind: 'cron', expression: '0 9 * * *' } })}><option value="cron">{t("重复计划")}</option><option value="once">{t("单次执行")}</option></select></label>
                  <label>{t("时区")}<input value={draft.timeZone} onChange={(event) => updateDraft({ ...draft, timeZone: event.target.value })} placeholder="Asia/Shanghai" /></label>
                </div>
                {draft.timing.kind === 'cron'
                  ? <label>{t("Cron 表达式")}<input value={draft.timing.expression} onChange={(event) => updateDraft({ ...draft, timing: { kind: 'cron', expression: event.target.value } })} placeholder="0 9 * * *" /><small>{t("分钟 小时 日 月 星期；按上方时区计算。")}</small></label>
                  : <label>{t("单次执行时间（ISO 8601，含时区偏移）")}<input value={draft.timing.at} onChange={(event) => updateDraft({ ...draft, timing: { kind: 'once', at: event.target.value } })} placeholder="2026-09-25T09:00:00+08:00" /><small>{t("例如 2026-09-25T09:00:00+08:00；上方时区用于展示。")}</small></label>}
                <label>{t("输出目标")}<select value={draft.delivery.kind} onChange={(event) => updateDraft({ ...draft, delivery: event.target.value === 'channel' ? { kind: 'channel' } : { kind: event.target.value as 'desktop' | 'none' } })}><option value="desktop">{t("桌面对话")}</option><option value="channel">{t("企业微信私聊")}</option><option value="none">{t("不投递")}</option></select></label>
                {draft.delivery.kind === 'channel' && <div className="management-targets"><strong>{t("已观察的私聊目标")}</strong>{contacts.length === 0 ? <p>{t("尚无可绑定的私聊目标。请先在已配对的企业微信私聊中发送消息。")}</p> : contacts.map((contact) => <div key={contact.contactId}><span>{t("会话")} {contact.contactId.slice(0, 8)}{t("… · 最后活动")} {timeLabel(contact.lastSeenAt, draft.timeZone)}</span>{contact.boundRouteId ? <button type="button" className={draft.delivery.routeId === contact.boundRouteId ? 'chosen' : ''} onClick={() => updateDraft({ ...draft, delivery: { kind: 'channel', routeId: contact.boundRouteId } })}>{draft.delivery.routeId === contact.boundRouteId ? t("已选择") : t("选择")}</button> : <button type="button" onClick={() => void bindContact(contact)} disabled={busy}>{t("绑定并选择")}</button>}</div>)}</div>}
                <label className="management-check"><input type="checkbox" checked={draft.enabled !== false} onChange={(event) => updateDraft({ ...draft, enabled: event.target.checked })} /> {t("保存后启用")}</label>
              </div>
              {activePreview && <div className="management-preview" role="status">{draft.enabled === false ? t("任务将保持停用，不安排下次触发。") : t("预计下次触发：{0}（{1}）", { 0: timeLabel(activePreview.nextTriggerAt, draft.timeZone), 1: draft.timeZone })}{!desktop && t(" · 演示时间，正式 App 由 Runtime 计算")}</div>}
              <div className="management-editor-actions"><button type="button" onClick={() => void checkPreview()} disabled={busy}>{busy ? t("处理中…") : t("校验并预览")}</button><button type="button" className="management-primary" onClick={() => void save()} disabled={busy || !activePreview}>{busy ? t("保存中…") : t("保存任务")}</button></div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function ConnectionManagement({ active }: { active: boolean }) {
  const desktop = window.mindlink;
  const [data, setData] = useState<WecomConnectionList>(desktop
    ? { status: 'ok', connections: [] }
    : { status: 'ok', connections: [{ connectionId: 'preview-connection', enabled: true, pairedSenderCount: 1, groupEnabled: false, status: 'connected' }] });
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [tested, setTested] = useState<WecomConnectionSummary>();
  const [mobileDetail, setMobileDetail] = useState(false);
  const [mode, setMode] = useState<EditorMode>('detail');
  const [form, setForm] = useState({ connectionId: '', botId: '', enabled: false });
  const [notice, setNotice] = useState<string>();
  const selected = data.connections.find((connection) => connection.connectionId === selectedId) ?? data.connections[0];

  async function refresh() {
    setLoading(true);
    setError(undefined);
    try {
      const next = desktop ? await desktop.listWecomConnections() : data;
      setData(next);
      setSelectedId((current) => next.connections.some((item) => item.connectionId === current)
        ? current : next.connections[0]?.connectionId);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (active) void refresh(); }, [active, desktop]);

  function beginCreate() {
    setMode('create');
    setForm({ connectionId: '', botId: '', enabled: false });
    setError(undefined);
    setNotice(undefined);
    setMobileDetail(true);
  }

  function beginEdit(connection: WecomConnectionSummary) {
    setMode('edit');
    setForm({ connectionId: connection.connectionId, botId: '', enabled: connection.enabled });
    setError(undefined);
    setNotice(undefined);
    setMobileDetail(true);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (!form.connectionId.trim() || (mode === 'create' && !form.botId.trim())) {
        throw new Error(t("请填写连接标识和机器人 Bot ID。"));
      }
      if (desktop) {
        const saved = await desktop.saveWecomConnection({
          connectionId: form.connectionId.trim(),
          enabled: form.enabled,
          ...(mode === 'create' ? { botId: form.botId.trim() } : {}),
        });
        setData((current) => ({ status: 'ok', connections: current.connections.some((item) => item.connectionId === saved.connectionId)
          ? current.connections.map((item) => item.connectionId === saved.connectionId ? saved : item)
          : [...current.connections, saved] }));
        await refresh();
      } else {
        const summary: WecomConnectionSummary = {
          connectionId: form.connectionId.trim(),
          enabled: form.enabled,
          pairedSenderCount: 0,
          groupEnabled: false,
          status: form.enabled ? 'connecting' : 'disabled',
        };
        setData((current) => ({ status: 'ok', connections: mode === 'create'
          ? [...current.connections, summary]
          : current.connections.map((item) => item.connectionId === summary.connectionId ? summary : item) }));
      }
      setSelectedId(form.connectionId.trim());
      setMode('detail');
      setNotice(t("配置已保存；连接状态将从 Runtime 刷新。"));
      setForm({ connectionId: '', botId: '', enabled: false });
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function testConnection(connection: WecomConnectionSummary) {
    setBusy(true);
    setError(undefined);
    setTested(undefined);
    try {
      const result = desktop ? await desktop.testWecomConnection(connection.connectionId) : connection;
      setTested(result);
      await refresh();
    } catch (testError) {
      setError(friendlyError(testError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`management-panel ${active ? '' : 'view-hidden'}`} aria-hidden={!active}>
      <header className="management-header">
        <div><h1>{t("连接")}</h1><p>{t("配置企业微信长连接，查看实际状态与已授权私聊范围。")}</p></div>
        <div className="management-header-actions"><ManagementStatus kind={desktop ? 'good' : 'muted'}>{desktop ? t("Runtime 数据") : t("浏览器演示数据")}</ManagementStatus><button type="button" className="management-primary" onClick={beginCreate}>{t("＋ 添加连接")}</button></div>
      </header>
      <div className={`management-body ${mobileDetail ? 'mobile-detail-open' : ''}`}>
        <aside className="management-list">
          <div className="management-list-heading"><strong>{t("连接列表")} <span>({data.connections.length})</span></strong><button type="button" onClick={() => void refresh()} disabled={loading}>{t("刷新")}</button></div>
          {loading && data.connections.length === 0 && <div className="management-empty">{t("正在读取连接…")}</div>}
          {data.status === 'invalid_configuration' && <div className="management-alert" role="alert">{t("连接配置文件无效。App 仍可使用；请修复本机配置后刷新。")}</div>}
          {!loading && data.connections.length === 0 && data.status === 'ok' && <div className="management-empty">{t("尚未配置企业微信机器人。先绑定系统 Keychain 凭据，再添加连接。")}</div>}
          <div className="management-items">{data.connections.map((connection) => (
            <button type="button" key={connection.connectionId} className={`management-item ${selected?.connectionId === connection.connectionId && mode !== 'create' ? 'selected' : ''}`} onClick={() => { setSelectedId(connection.connectionId); setTested(undefined); setMode('detail'); setMobileDetail(true); }}>
              <span className="management-item-title"><strong>{t("企业微信智能机器人")}</strong><ManagementStatus kind={connection.status === 'connected' ? 'good' : connection.status === 'unavailable' ? 'bad' : 'muted'}>{connection.status === 'connected' ? t("已连接") : connection.status === 'disabled' ? t("已停用") : connection.status === 'connecting' ? t("连接中") : t("不可用")}</ManagementStatus></span>
              <span>{t("连接")} {connection.connectionId}</span><small>{t("已配对")} {connection.pairedSenderCount} {t("位私聊成员")}</small>
            </button>
          ))}</div>
        </aside>
        <div className="management-detail">
          <button type="button" className="management-mobile-back" onClick={() => setMobileDetail(false)}>{t("← 返回连接列表")}</button>
          {error && <div className="management-alert" role="alert">{error}{mode === 'detail' && <button type="button" onClick={() => void refresh()}>{t("重试")}</button>}</div>}
          {mode === 'detail' && selected && <>
            <div className="management-detail-heading"><div><div className="management-title-row"><h2>{t("企业微信智能机器人")}</h2><ManagementStatus kind={selected.status === 'connected' ? 'good' : selected.status === 'unavailable' ? 'bad' : 'muted'}>{selected.status === 'connected' ? t("长连接已鉴权") : selected.status === 'disabled' ? t("连接已停用") : selected.status === 'connecting' ? t("正在连接") : t("连接不可用")}</ManagementStatus></div><p>{t("仅已配对的私聊成员可以触发；群聊保持关闭。")}</p></div><div className="management-actions"><button type="button" onClick={() => beginEdit(selected)}>{t("配置")}</button><button type="button" onClick={() => void testConnection(selected)} disabled={busy}>{busy ? t("检测中…") : t("检测连接")}</button></div></div>
            {notice && <div className="management-success" role="status">{notice}</div>}
            {tested && <div className={tested.status === 'connected' ? 'management-success' : 'management-alert'} role="status">{t("检测结果：")}{tested.status === 'connected' ? t("当前长连接已鉴权并在线。") : tested.status === 'disabled' ? t("连接已停用。") : tested.status === 'connecting' ? t("正在等待鉴权。") : t("当前连接不可用，请检查本机配置与 Keychain 绑定。")}</div>}
            <dl className="management-facts"><div><dt>{t("连接标识")}</dt><dd>{selected.connectionId}</dd></div><div><dt>{t("私聊授权")}</dt><dd>{t("已配对")} {selected.pairedSenderCount} {t("人 · 仅配对成员")}</dd></div><div><dt>{t("群聊")}</dt><dd>{selected.groupEnabled ? t("已启用") : t("未启用")}</dd></div><div><dt>{t("运行状态")}</dt><dd>{selected.diagnostic === 'credential_unavailable' ? t("Keychain 凭据不可用") : selected.diagnostic === 'configuration_invalid' ? t("配置不完整或不安全") : selected.diagnostic === 'authentication_failed' ? t("机器人鉴权失败") : selected.status === 'connected' ? t("已连接") : selected.status === 'connecting' ? t("正在连接") : selected.status === 'disabled' ? t("已停用") : t("连接失败")}</dd></div></dl>
            <div className="management-note">{t("Bot ID 与 Secret 均不会回显。配置仅引用系统 Keychain，保存时会安全重连；连接失败时恢复原配置。")}</div>
          </>}
          {mode === 'detail' && !selected && <div className="management-empty">{t("请选择或添加连接。连接异常不会阻止 App 打开。")}</div>}
          {mode !== 'detail' && <div className="management-editor">
            <div className="management-detail-heading"><div><h2>{mode === 'create' ? t("添加企业微信连接") : t("连接配置")}</h2><p>{t("个人助手默认仅允许已配对私聊，群聊保持关闭。")}</p></div><button type="button" onClick={() => setMode('detail')}>{t("取消编辑")}</button></div>
            <div className="management-form">
              <label>{t("连接标识")}<input value={form.connectionId} disabled={mode === 'edit'} onChange={(event) => setForm({ ...form, connectionId: event.target.value })} placeholder={t("例如 my-assistant")} maxLength={128} /></label>
              {mode === 'create' && <label>{t("机器人 Bot ID")}<input value={form.botId} onChange={(event) => setForm({ ...form, botId: event.target.value })} autoComplete="off" placeholder={t("仅创建时填写，保存后不回显")} /><small>{t("请勿在此填写 Secret。创建后不能更改 Bot ID；更换机器人应使用新连接标识。")}</small></label>}
              <label className="management-check"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> {t("保存后启用长连接")}</label>
            </div>
            <div className="management-note">{t("启用前需已在系统 Keychain 中为此连接绑定 Bot Secret；应用只保存固定的 Keychain 引用，不读取或回显 Secret。保存失败会保留上方输入。")}</div>
            <div className="management-editor-actions"><button type="button" className="management-primary" onClick={() => void save()} disabled={busy}>{busy ? t("保存并重连中…") : t("保存并重连")}</button></div>
          </div>}
        </div>
      </div>
    </section>
  );
}
