import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { AgentRunRecord, AssistantDelegationRecord, AssistantEvidenceRef, AssistantLinkStatus,
  AssistantReviewJudgment, AssistantSourceRevocationReceipt, ScheduleRecord } from '@mindlink-agent/protocol';
import { AppIcon } from '../../components/composites/app-icon.js';
import { MessageContent } from '../../components/composites/message-content.js';
import { readSavedContent, removeSavedContent, savedContentEvent } from '../../components/composites/saved-content.js';
import { AssistantCompanion } from '../../components/composites/assistant-companion.js';
import type { AssistantActivity } from '../../components/composites/assistant-activity.js';
import './assistant-home.css';
import { t } from '../../languages/index.js';

const tabs = [t("今日"), t("任务"), t("记忆"), t("连接")] as const;
type Tab = typeof tabs[number];
const runLabels: Record<AgentRunRecord['status'], string> = {
  queued: t("等待执行"), running: t("正在执行"), waiting_approval: t("等待授权"), succeeded: t("已完成"),
  failed: t("执行失败"), cancelled: t("已取消"), interrupted: t("执行中断"), result_unknown: t("结果未知"),
};
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const dateTime = (at: string) => new Date(at).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const reviewLabels: Record<AssistantReviewJudgment, string> = {
  supported: t("有证据支持"), partial: t("部分完成"), failed: t("未完成"), unverified: t("待核实"),
};
const deliveryLabels = { not_requested: t("仅在助理收件箱"), accepted: t("企业微信已接收，未确认已读"),
  failed: t("企微投递失败"), unknown: t("企微投递结果未知") } as const;
const delegationLabels: Record<AssistantDelegationRecord['status'], string> = {
  accepted: t("已接受"), running: t("执行中"), waiting_approval: t("等待授权"),
  completed: t("子任务已完成，待核对证据"), failed: t("执行失败"), cancelled: t("已取消"), unknown: t("结果未知"),
};

export function AssistantHome({ active, link, linkLoading, linkError, retryLink, run, activity,
  archiveOpen, onToggleArchive, onOpenWorkConversation }: {
  active: boolean;
  link?: AssistantLinkStatus;
  linkLoading: boolean;
  linkError: unknown;
  retryLink: () => void;
  run?: AgentRunRecord;
  activity: AssistantActivity;
  archiveOpen: boolean;
  onToggleArchive: () => void;
  onOpenWorkConversation: (conversationId: string) => void;
}) {
  const desktop = window.mindlink;
  const navigate = useNavigate();
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>(t("今日"));
  const [selectedSchedule, setSelectedSchedule] = useState<string>();
  const [selectedMemory, setSelectedMemory] = useState<string>();
  const [selectedSaved, setSelectedSaved] = useState<string>();
  const [selectedSuggestion, setSelectedSuggestion] = useState<string>();
  const [selectedReview, setSelectedReview] = useState<string>();
  const [selectedDelegation, setSelectedDelegation] = useState<string>();
  const [selectedSource, setSelectedSource] = useState<string>();
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [sourceReceipt, setSourceReceipt] = useState<AssistantSourceRevocationReceipt>();
  const [memoryDraft, setMemoryDraft] = useState('');
  const [editingMemory, setEditingMemory] = useState(false);
  const [forgetConfirm, setForgetConfirm] = useState(false);
  const [delegationDraft, setDelegationDraft] = useState('');
  const [memoryLimit, setMemoryLimit] = useState(100);
  const [memories, setMemories] = useState(readSavedContent);
  const [memoryError, setMemoryError] = useState('');
  const [taskKind, setTaskKind] = useState<'reviews' | 'delegations' | 'runs' | 'schedules'>('reviews');
  const scroll = useRef<HTMLDivElement>(null);
  const correctionRequest = useRef<{ id: string; version: number; text: string;
    revisionId: string } | undefined>(undefined);
  const positions = useRef<Partial<Record<Tab, number>>>({});
  const schedules = useQuery({
    queryKey: ['assistant', 'schedules'], queryFn: () => desktop!.listSchedules(),
    enabled: active && Boolean(desktop), refetchInterval: active ? 10000 : false,
  });
  const workspace = useQuery({ queryKey: ['assistant', 'workspace', memoryLimit],
    queryFn: () => desktop!.getAssistantWorkspace(memoryLimit), enabled: active && Boolean(desktop),
    refetchInterval: active ? 5000 : false });
  const suggestions = useQuery({ queryKey: ['assistant', 'suggestions'],
    queryFn: () => desktop!.listAssistantSuggestions(), enabled: active && Boolean(desktop),
    refetchInterval: active ? 5000 : false });
  const refreshWorkspace = () => void client.invalidateQueries({ queryKey: ['assistant', 'workspace'] });
  const refreshSuggestions = () => void client.invalidateQueries({ queryKey: ['assistant', 'suggestions'] });
  const suggestionFeedback = useMutation({ mutationFn: (input: { id: string;
    action: 'ignored' | 'snoozed' | 'accepted'; until?: string }) =>
    desktop!.feedbackAssistantSuggestion(input.id, input.action, input.until),
    onSuccess: refreshSuggestions });
  const suggestionRead = useMutation({ mutationFn: (id: string) => desktop!.markAssistantSuggestionRead(id),
    onSuccess: refreshSuggestions });
  const pauseSuggestions = useMutation({ mutationFn: (until?: string) =>
    desktop!.setAssistantSuggestionsPaused(until), onSuccess: refreshSuggestions });
  const correctMemory = useMutation({ mutationFn: (input: { id: string; version: number;
    text: string; revisionId: string }) =>
    desktop!.correctAssistantMemory(input.id, input.version, input.text, input.revisionId),
    onSuccess: () => { correctionRequest.current = undefined; setEditingMemory(false); refreshWorkspace(); } });
  const forgetMemory = useMutation({ mutationFn: (id: string) => desktop!.forgetAssistantMemory(id),
    onSuccess: () => { setSelectedMemory(undefined); setForgetConfirm(false); refreshWorkspace(); refreshSuggestions(); } });
  const organizingPause = useMutation({ mutationFn: (until?: string) =>
    desktop!.setAssistantOrganizingPaused(until), onSuccess: refreshWorkspace });
  const revokeSource = useMutation({ mutationFn: (input: { sourceId: string; expectedVersion: string }) =>
    desktop!.revokeAssistantSource(input.sourceId, input.expectedVersion),
    onSuccess: (receipt) => { setSourceReceipt(receipt); setConfirmRevoke(false); refreshWorkspace(); } });
  const importSaved = useMutation({ mutationFn: (item: ReturnType<typeof readSavedContent>[number]) =>
    desktop!.importAssistantSavedMemory(item.id, item.surface, item.text, item.savedAt),
    onSuccess: () => { setSelectedSaved(undefined); refreshWorkspace(); } });
  const followUpDelegation = useMutation({ mutationFn: (id: string) =>
    desktop!.followUpAssistantDelegation(id, delegationDraft),
    onSuccess: () => { setDelegationDraft(''); refreshWorkspace(); },
    onError: refreshWorkspace });
  const cancelDelegation = useMutation({ mutationFn: (id: string) => desktop!.cancelAssistantDelegation(id),
    onSuccess: refreshWorkspace });
  const connections = useQuery({
    queryKey: ['assistant', 'connections'], queryFn: () => desktop!.listWecomConnections(),
    enabled: active && tab === t("连接") && Boolean(desktop), refetchInterval: active && tab === t("连接") ? 5000 : false,
  });
  const toggleSchedule = useMutation({
    mutationFn: (schedule: ScheduleRecord) => desktop!.setScheduleEnabled(schedule.scheduleId, !schedule.enabled),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['assistant', 'schedules'] }),
  });
  const history = useQuery({
    queryKey: ['assistant', 'schedule-history', selectedSchedule],
    queryFn: () => desktop!.getScheduleHistory(selectedSchedule!, 10),
    enabled: active && tab === t("任务") && Boolean(desktop) && Boolean(selectedSchedule),
  });
  useEffect(() => {
    const refresh = () => setMemories(readSavedContent());
    refresh();
    window.addEventListener(savedContentEvent, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(savedContentEvent, refresh); window.removeEventListener('storage', refresh); };
  }, [active]);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = positions.current[tab] ?? 0; }, [tab]);
  const savedMemories = memories.filter((item) => item.kind === 'memory');
  const memory = workspace.data?.memories.find((item) => item.id === selectedMemory);
  const saved = savedMemories.find((item) => item.id === selectedSaved);
  const suggestion = suggestions.data?.items.find((item) => item.suggestionId === selectedSuggestion);
  const review = workspace.data?.reviews.find((item) => item.reviewId === selectedReview);
  const delegation = workspace.data?.delegations.find((item) => item.taskId === selectedDelegation);
  const delegationVerification = delegation
    ? workspace.data?.delegationVerifications?.[delegation.taskId] : undefined;
  const currentSources = workspace.data?.sources.filter((item) => item.current) ?? [];
  const schedule = schedules.data?.find((item) => item.scheduleId === selectedSchedule);
  const upcoming = (schedules.data ?? []).filter((item) => item.enabled && item.nextTriggerAt)
    .sort((a, b) => a.nextTriggerAt!.localeCompare(b.nextTriggerAt!));
  const boundConnection = connections.data?.connections.find((item) => item.connectionId === link?.connectionId);
  useEffect(() => {
    const pending = correctionRequest.current;
    if (editingMemory && pending && memory?.id === pending.id
      && memory.version === pending.version + 1 && memory.text === pending.text) {
      correctionRequest.current = undefined;
      setEditingMemory(false);
      correctMemory.reset();
    }
  }, [editingMemory, memory?.id, memory?.version, memory?.text]);

  function openMemory(id: string, text: string) {
    setSelectedSaved(undefined); setSelectedMemory(id); setMemoryDraft(text);
    correctionRequest.current = undefined;
    setEditingMemory(false); setForgetConfirm(false);
  }
  function submitCorrection(id: string, version: number) {
    const previous = correctionRequest.current;
    const request = previous?.id === id && previous.version === version && previous.text === memoryDraft
      ? previous : { id, version, text: memoryDraft, revisionId: crypto.randomUUID() };
    correctionRequest.current = request;
    correctMemory.mutate(request);
  }
  function sourceRefs(refs: Array<Pick<AssistantEvidenceRef, 'sourceId' | 'sourceVersion'>>) {
    if (!refs.length) return <p>{t("尚无可展示的来源引用。")}</p>;
    return <ul className="assistant-source-list">{refs.map((ref) => {
      const source = workspace.data?.sources.find((item) => item.sourceId === ref.sourceId
        && item.sourceVersion === ref.sourceVersion);
      const key = `${ref.sourceId}:${ref.sourceVersion}`;
      return <li key={key}><span>{ref.sourceId} · {source?.availability === 'available'
        ? t("可用") : source?.availability === 'temporarily_unavailable' ? t("暂不可用")
          : source?.availability === 'deleted' ? t("已停止读取") : t("待确认")}</span>
        {source?.workConversationId && <button type="button" onClick={() => onOpenWorkConversation(source.workConversationId!)}>{t("打开工作")}</button>}
        <button type="button" onClick={() => { setSelectedSource(selectedSource === key ? undefined : key);
          setConfirmRevoke(false); revokeSource.reset(); }}>{t("来源详情")}</button>
        {selectedSource === key && <div className="assistant-source-detail">
          <p>{t("助理来源版本：")}{ref.sourceVersion}</p>
          <p>{t("撤销只停止助理读取这条来源并撤回仅由它支持的整理；原始工作对话、助理对话和文件仍保留。")}</p>
          {source?.availability === 'deleted' ? <p>{t("助理已停止读取该来源；相关认识和评估仍需核对。")}</p>
            : ['available', 'temporarily_unavailable'].includes(source?.availability ?? '') ? <>
              {!confirmRevoke ? <button type="button" onClick={() => setConfirmRevoke(true)}>{t("撤销助理读取")}</button>
                : <div role="alert"><p>{t("确认撤销这条来源？仅登记后续处理，不代表记忆已立即删除。")}</p>
                  <button type="button" disabled={revokeSource.isPending}
                    onClick={() => revokeSource.mutate({ sourceId: ref.sourceId,
                      expectedVersion: ref.sourceVersion })}>{t("确认撤销")}</button>
                  <button type="button" onClick={() => setConfirmRevoke(false)}>{t("保留来源")}</button></div>}
            </> : <p>{t("当前版本不可确认，请刷新后再操作。")}</p>}
          {revokeSource.error && <p role="alert">{t("撤销未确认：")}{errorMessage(revokeSource.error)}</p>}
        </div>}
      </li>;
    })}</ul>;
  }

  function changeTab(next: Tab) {
    if (scroll.current) positions.current[tab] = scroll.current.scrollTop;
    setTab(next);
  }
  function openSchedule(id: string) { setSelectedSchedule(id); setTaskKind('schedules'); changeTab(t("任务")); }
  function deleteMemory(id: string) {
    try { removeSavedContent(id); setSelectedSaved(undefined); setMemoryError(''); }
    catch { setMemoryError(t("无法删除记忆，请检查本地存储后重试。")); }
  }
  function scheduleRow(item: ScheduleRecord) {
    return <button type="button" className="assistant-card assistant-item" key={item.scheduleId} onClick={() => openSchedule(item.scheduleId)}>
      <span className="assistant-item-icon"><AppIcon name="schedules" /></span>
      <span><strong>{item.name}</strong><small>{!item.enabled ? t("已暂停") : item.nextTriggerAt ? dateTime(item.nextTriggerAt) : t("暂无下一次执行")} · {item.timing.kind === 'cron' ? t("重复任务") : t("单次任务")}</small></span>
      <AppIcon name="chevron" />
    </button>;
  }
  const runCard = run && <article className="assistant-card assistant-run-card">
    <div className="assistant-section-title"><h3>{runLabels[run.status]}</h3><time>{dateTime(run.updatedAt)}</time></div>
    {run.output?.message && <MessageContent text={run.output.message} />}
    {run.failure && <p role="alert">{run.failure.message}</p>}
    {!run.output?.message && !run.failure && <p>{t("任务状态会随助理运行更新，详细过程可在左侧对话中查看。")}</p>}
  </article>;

  return <div className="assistant-home">
    <header className="assistant-home-header">
    <div className="assistant-home-tabs" role="tablist" aria-label={t("助理面板")}>
      {tabs.map((name, index) => <button key={name} id={`assistant-tab-${index}`} type="button" role="tab"
        aria-selected={tab === name} aria-controls="assistant-tab-content" tabIndex={tab === name ? 0 : -1}
        onClick={() => changeTab(name)} onKeyDown={(event) => {
          const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : undefined;
          if (next === undefined) return;
          event.preventDefault(); changeTab(tabs[next]!); document.getElementById(`assistant-tab-${next}`)?.focus();
        }}>{name}</button>)}
    </div>
    <AssistantCompanion active={active} activity={activity} />
    </header>
    <div ref={scroll} id="assistant-tab-content" className="assistant-home-content" role="tabpanel" aria-labelledby={`assistant-tab-${tabs.indexOf(tab)}`} tabIndex={0}>
      {sourceReceipt && <p role="status">{t("来源")} {sourceReceipt.sourceId} {t("的撤销已由宿主登记；")}
        {workspace.data?.sources.some((item) => item.sourceId === sourceReceipt.sourceId
          && item.availability === 'deleted') ? t("助理已停止读取，相关整理仍需核对") : t("助理正在处理")}{t("。\r\n        原始记录仍保留。")}</p>}
      {tab === t("今日") && <>
        <header className="assistant-day-heading"><time>{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</time>
          <h1>{t("先把重要的事，安排好。")}</h1><p>{upcoming.length ? t("{0} 项计划待执行。", { 0: upcoming.length }) : t("把要跟进的事交给助理，从这里开始。")}</p></header>
        {suggestions.error && <div className="assistant-card" role="alert"><p>{t("建议暂时无法读取：")}{errorMessage(suggestions.error)}</p><button type="button" onClick={() => void suggestions.refetch()}>{t("重试")}</button></div>}
        {(suggestion || suggestions.data?.items.some((item) => item.feedback === 'none') || suggestions.data?.pausedUntil) &&
          <section><div className="assistant-section-title"><h2>{t("助理建议")}</h2>
            <button type="button" disabled={pauseSuggestions.isPending} onClick={() => pauseSuggestions.mutate(
              suggestions.data?.pausedUntil && Date.parse(suggestions.data.pausedUntil) > Date.now()
                ? undefined : new Date(Date.now() + 86_400_000).toISOString())}>
              {suggestions.data?.pausedUntil && Date.parse(suggestions.data.pausedUntil) > Date.now() ? t("恢复提醒") : t("暂停 1 天")}</button></div>
            {pauseSuggestions.error && <p role="alert">{t("提醒设置失败：")}{errorMessage(pauseSuggestions.error)}</p>}
            {suggestion ? <article className="assistant-card"><button type="button" onClick={() => setSelectedSuggestion(undefined)}>{t("返回建议")}</button>
              <h3>{suggestion.reason}</h3><p>{suggestion.nextStep}</p>
              <p className="assistant-home-note">{deliveryLabels[suggestion.deliveryStatus]} · {suggestion.readAt ? t("已在此查看") : t("未查看")}</p>
              {sourceRefs(suggestion.evidence)}
              <div className="assistant-actions"><button type="button" disabled={suggestionFeedback.isPending}
                onClick={() => suggestionFeedback.mutate({ id: suggestion.suggestionId, action: 'accepted' })}>{t("已处理")}</button>
                <button type="button" disabled={suggestionFeedback.isPending}
                  onClick={() => suggestionFeedback.mutate({ id: suggestion.suggestionId, action: 'snoozed',
                    until: new Date(Date.now() + 86_400_000).toISOString() })}>{t("明天提醒")}</button>
                <button type="button" disabled={suggestionFeedback.isPending}
                  onClick={() => suggestionFeedback.mutate({ id: suggestion.suggestionId, action: 'ignored' })}>{t("忽略")}</button></div>
              {suggestionFeedback.error && <p role="alert">{t("反馈未保存：")}{errorMessage(suggestionFeedback.error)}</p>}
            </article> : suggestions.data?.items.filter((item) => item.feedback === 'none').map((item) =>
              <button type="button" className="assistant-card assistant-item" key={item.suggestionId}
                onClick={() => { setSelectedSuggestion(item.suggestionId); if (!item.readAt) suggestionRead.mutate(item.suggestionId); }}>
                <span className="assistant-item-icon"><AppIcon name="assistant" /></span>
                <span><strong>{item.reason}</strong><small>{item.nextStep} · {deliveryLabels[item.deliveryStatus]}</small></span>
                <AppIcon name="chevron" /></button>)}</section>}
        {!link?.linked && <article className="assistant-card assistant-feature-card"><span className="assistant-card-kicker"><AppIcon name="work" />{t("企业微信")}</span>
          <h2>{linkLoading ? t("正在读取连接…") : linkError ? t("暂时无法读取连接") : t("让助理接续你的企业微信私聊")}</h2>
          <p>{t("绑定已配对联系人后，可以在桌面和企业微信继续同一段对话。")}</p>
          <button type="button" className="assistant-primary" onClick={() => changeTab(t("连接"))}>{t("查看连接")}</button></article>}
        <section><div className="assistant-section-title"><h2>{t("持续跟进")}</h2><button type="button" onClick={() => changeTab(t("任务"))}>{t("查看任务")}<AppIcon name="chevron" /></button></div>
          {schedules.isLoading ? <p role="status">{t("正在读取任务…")}</p> : schedules.error ? <div className="assistant-card" role="alert"><p>{t("任务读取失败：")}{errorMessage(schedules.error)}</p><button type="button" onClick={() => void schedules.refetch()}>{t("重试")}</button></div>
            : upcoming.length ? upcoming.slice(0, 3).map(scheduleRow) : <div className="assistant-card assistant-empty"><AppIcon name="schedules" /><h3>{t("还没有待执行的计划")}</h3><p>{t("创建定时任务后，下一次执行时间会显示在这里。")}</p><button type="button" onClick={() => navigate('/schedules')}>{t("管理定时任务")}</button></div>}
        </section>
        {runCard && <section><div className="assistant-section-title"><h2>{run?.status === 'succeeded' ? t("已为你完成") : t("当前任务")}</h2></div>{runCard}</section>}
        <p className="assistant-home-note">{t("仅展示本机已接入的事项。")}</p>
      </>}
      {tab === t("任务") && <>
        {review ? <>
          <div className="assistant-section-title"><button type="button" onClick={() => setSelectedReview(undefined)}><span className="assistant-back"><AppIcon name="chevron" /></span>{t("返回工作评估")}</button></div>
          <article className="assistant-card"><h2>{review.goal}</h2><p>{reviewLabels[review.judgment]} {t("· 第")} {review.reviewVersion} {t("版 ·")} {dateTime(review.createdAt)}</p>
            {review.unresolved.length > 0 && <><h3>{t("待核实")}</h3><ul>{review.unresolved.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
            {review.findings.length > 0 && <><h3>{t("评估发现")}</h3>{review.findings.map((finding, index) => <div key={index}>
              <p>{reviewLabels[finding.judgment]}：{finding.claim}</p>{sourceRefs(finding.evidence)}</div>)}</>}
            {review.followUp.length > 0 && <><h3>{t("可跟进")}</h3><ul>{review.followUp.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
            {review.workId.startsWith('work:') && <button type="button"
              onClick={() => onOpenWorkConversation(review.workId.slice(5))}>{t("查看原工作")}</button>}
          </article>
        </> : delegation ? <>
          <div className="assistant-section-title"><button type="button" onClick={() => setSelectedDelegation(undefined)}><span className="assistant-back"><AppIcon name="chevron" /></span>{t("返回专业任务")}</button></div>
          <article className="assistant-card"><h2>{delegation.goal}</h2><p>{t("状态：")}{delegationVerification
            ? t("助理已关联完成标准与返回的证据引用，内容仍需判断") : delegationLabels[delegation.status]}</p>
            <p>{t("专业技能：")}{delegation.skillName} · {dateTime(delegation.updatedAt)}</p>
            <h3>{t("完成标准")}</h3><ul>{delegation.completionCriteria.map((item, index) => <li key={index}>{item}</li>)}</ul>
            {delegationVerification && <>
              <p>{t("核验记录：")}{dateTime(delegationVerification.checkedAt)}</p>
              <ul>{Object.entries(delegationVerification.evidenceByCriterion)
                .map(([criterion, refs]) => <li key={criterion}>{criterion}：{refs.join('、')}</li>)}</ul></>}
            {delegation.result?.summary && <MessageContent text={delegation.result.summary} />}
            {delegation.result?.resultRef && <p>{t("结果引用：")}{delegation.result.resultRef}</p>}
            {delegation.result?.evidenceRefs?.length ? <p>{t("证据引用：")}{delegation.result.evidenceRefs.join('、')}</p> : null}
            {['completed', 'failed'].includes(delegation.status) && <div className="assistant-form"><label htmlFor="assistant-delegation-follow-up">{t("继续追问")}</label>
              <textarea id="assistant-delegation-follow-up" value={delegationDraft}
                onChange={(event) => setDelegationDraft(event.target.value)} placeholder={t("说明需要补充核对的内容")} />
              <button type="button" disabled={!delegationDraft.trim() || followUpDelegation.isPending}
                onClick={() => followUpDelegation.mutate(delegation.taskId)}>{t("提交追问")}</button></div>}
            {['accepted', 'running', 'waiting_approval'].includes(delegation.status) &&
              <button type="button" disabled={cancelDelegation.isPending}
                onClick={() => cancelDelegation.mutate(delegation.taskId)}>{t("取消任务")}</button>}
            {followUpDelegation.error && <p role="alert">{t("追问结果暂不明确，输入已保留；刷新状态后可用同一内容安全重试：")}{errorMessage(followUpDelegation.error)}</p>}
            {cancelDelegation.error && <p role="alert">{t("取消失败：")}{errorMessage(cancelDelegation.error)}</p>}
          </article>
        </> : schedule ? <>
          <div className="assistant-section-title"><button type="button" onClick={() => setSelectedSchedule(undefined)}><span className="assistant-back"><AppIcon name="chevron" /></span>{t("返回任务")}</button></div>
          <article className="assistant-card"><h2>{schedule.name}</h2><p>{schedule.prompt}</p><dl className="assistant-facts"><div><dt>{t("下次执行")}</dt><dd>{schedule.nextTriggerAt ? dateTime(schedule.nextTriggerAt) : t("暂无安排")}</dd></div><div><dt>{t("时区")}</dt><dd>{schedule.timeZone}</dd></div><div><dt>{t("状态")}</dt><dd>{schedule.enabled ? t("已启用") : t("已暂停")}</dd></div></dl>
            <button type="button" disabled={toggleSchedule.isPending} onClick={() => toggleSchedule.mutate(schedule)}>{toggleSchedule.isPending ? t("正在更新…") : schedule.enabled ? t("暂停任务") : t("启用任务")}</button>
            {toggleSchedule.error && <p role="alert">{t("更新失败：")}{errorMessage(toggleSchedule.error)}</p>}</article>
          <h2 className="assistant-section-label">{t("最近执行")}</h2>
          {history.isLoading && <p role="status">{t("正在读取记录…")}</p>}
          {history.error && <p role="alert">{t("记录读取失败。")}<button type="button" onClick={() => void history.refetch()}>{t("重试")}</button></p>}
          {history.data?.length === 0 && <div className="assistant-card assistant-empty">{t("还没有运行记录。")}</div>}
          {history.data?.map((item) => <article className="assistant-card" key={item.triggerKey}><h3>{item.runStatus ? runLabels[item.runStatus] : t("尚未执行")}</h3><time>{dateTime(item.scheduledAt)}</time>{item.output?.message && <MessageContent text={item.output.message} />}</article>)}
        </> : <>
          <div className="assistant-section-title"><h1>{t("任务")}</h1><button type="button" onClick={() => navigate('/schedules')}><AppIcon name="plus" />{t("管理定时任务")}</button></div>
          <div className="assistant-task-filters" role="group" aria-label={t("任务类型")}>
            <button type="button" aria-pressed={taskKind === 'reviews'} onClick={() => setTaskKind('reviews')}>{t("工作评估")}</button>
            <button type="button" aria-pressed={taskKind === 'delegations'} onClick={() => setTaskKind('delegations')}>{t("专业任务")}</button>
            <button type="button" aria-pressed={taskKind === 'runs'} onClick={() => setTaskKind('runs')}>{t("当前会话")}</button>
            <button type="button" aria-pressed={taskKind === 'schedules'} onClick={() => setTaskKind('schedules')}>{t("定时任务")}</button>
          </div>
          {workspace.error && <p role="alert">{t("助理任务暂时无法读取：")}{errorMessage(workspace.error)} <button type="button" onClick={() => void workspace.refetch()}>{t("重试")}</button></p>}
          {taskKind === 'delegations' && workspace.data?.delegationsUnavailable &&
            <p role="alert">{t("部分专业任务状态暂时不可用，请稍后重新读取。")}</p>}
          {taskKind === 'reviews' ? workspace.isLoading ? <p role="status">{t("正在读取工作评估…")}</p>
            : workspace.data?.reviews.length ? workspace.data.reviews.map((item) =>
              <button type="button" className="assistant-card assistant-item" key={item.reviewId}
                onClick={() => setSelectedReview(item.reviewId)}><span className="assistant-item-icon"><AppIcon name="work" /></span>
                <span><strong>{item.goal}</strong><small>{reviewLabels[item.judgment]} · {dateTime(item.createdAt)}</small></span><AppIcon name="chevron" /></button>)
              : !workspace.error && <div className="assistant-card assistant-empty">{t("还没有工作评估。")}</div>
          : taskKind === 'delegations' ? workspace.isLoading ? <p role="status">{t("正在读取专业任务…")}</p>
            : workspace.data?.delegations.length ? workspace.data.delegations.map((item) =>
              <button type="button" className="assistant-card assistant-item" key={item.taskId}
                onClick={() => { setSelectedDelegation(item.taskId); setDelegationDraft(''); }}>
                <span className="assistant-item-icon"><AppIcon name="schedules" /></span>
                <span><strong>{item.goal}</strong><small>{delegationLabels[item.status]} · {dateTime(item.updatedAt)}</small></span><AppIcon name="chevron" /></button>)
              : !workspace.error && <div className="assistant-card assistant-empty">{t("还没有专业任务。")}</div>
          : taskKind === 'runs' ? runCard ?? <div className="assistant-card assistant-empty"><h3>{t("还没有运行记录")}</h3><p>{t("在左侧交代一项工作，执行进展会显示在这里。")}</p></div> : <>
            <p className="assistant-home-note">{t("本机定时任务")}</p>
            {schedules.isLoading && <p role="status">{t("正在读取任务…")}</p>}
            {schedules.error && <p role="alert">{t("任务读取失败。")}<button type="button" onClick={() => void schedules.refetch()}>{t("重试")}</button></p>}
            {schedules.data?.map(scheduleRow)}
            {!schedules.isLoading && !schedules.error && !schedules.data?.length && <div className="assistant-card assistant-empty"><AppIcon name="schedules" /><h3>{t("还没有定时任务")}</h3><p>{t("前往定时任务设置执行时间与内容。")}</p></div>}
          </>}
          {((taskKind === 'reviews' && workspace.data?.hasMoreReviews)
            || (taskKind === 'delegations' && workspace.data?.hasMoreDelegations)) &&
            <button type="button" disabled={workspace.isFetching}
              onClick={() => setMemoryLimit((limit) => Math.min(limit + 100, 10_000))}>{t("加载更多记录")}</button>}
        </>}
      </>}
      {tab === t("记忆") && <>
        <div className="assistant-section-title"><h1>{t("记忆")}</h1>{(memory || saved) && <button type="button" onClick={() => { setSelectedMemory(undefined); setSelectedSaved(undefined); }}>{t("返回全部")}</button>}</div>
        <p className="assistant-home-note">{t("助理整理的个人认识会显示来源与修订状态；旧收藏需要你手动导入。")}</p>
        {!memory && !saved && <div className="assistant-section-title"><p className="assistant-home-note">
          {t("已处理")} {workspace.data?.sourceSync?.processed ?? 0} {t("条来源 · 待处理")} {workspace.data?.sourceSync?.pending ?? 0} {t("条")}
          {(workspace.data?.sourceSync?.unavailable ?? 0) > 0 && t(" · {0} 条暂不可用", { 0: workspace.data!.sourceSync.unavailable })}
          {workspace.data?.sourceSync?.lastObservedAt && t(" · 最近来源 {0}", { 0: dateTime(workspace.data.sourceSync.lastObservedAt) })}
        </p><button type="button" disabled={organizingPause.isPending} onClick={() => organizingPause.mutate(
          workspace.data?.organizingPausedUntil && Date.parse(workspace.data.organizingPausedUntil) > Date.now()
            ? undefined : new Date(Date.now() + 86_400_000).toISOString())}>
          {workspace.data?.organizingPausedUntil && Date.parse(workspace.data.organizingPausedUntil) > Date.now()
            ? t("恢复自动整理") : t("暂停自动整理 1 天")}</button></div>}
        {organizingPause.error && <p role="alert">{t("自动整理设置失败：")}{errorMessage(organizingPause.error)}</p>}
        {workspace.isLoading && <p role="status">{t("正在读取助理记忆…")}</p>}
        {workspace.error && <p role="alert">{t("记忆暂时无法读取：")}{errorMessage(workspace.error)} <button type="button" onClick={() => void workspace.refetch()}>{t("重试")}</button></p>}
        {memoryError && <p role="alert">{memoryError}</p>}
        {memory ? <article className="assistant-card"><h2>{memory.context}</h2>
          <p>{memory.kind === 'explicit' ? t("明确记录") : memory.kind === 'observed' ? t("观察所得") : t("推断，需核实")} {t("· 第")} {memory.version} {t("版 ·")} {dateTime(memory.verifiedAt)}</p>
          {editingMemory ? <div className="assistant-form"><label htmlFor="assistant-memory-correction">{t("纠正这条认识")}</label>
            <textarea id="assistant-memory-correction" value={memoryDraft}
              onChange={(event) => setMemoryDraft(event.target.value)} />
            <div className="assistant-actions"><button type="button" disabled={!memoryDraft.trim() || correctMemory.isPending}
              onClick={() => submitCorrection(memory.id, memory.version)}>{t("保存纠正")}</button>
              <button type="button" onClick={() => setEditingMemory(false)}>{t("取消")}</button></div>
            {correctMemory.error && <p role="alert">{t("纠正未保存，内容已保留：")}{errorMessage(correctMemory.error)}</p>}
          </div> : <MessageContent text={memory.text} />}
          {sourceRefs(memory.evidence)}
          <div className="assistant-actions"><button type="button" onClick={() => { setMemoryDraft(memory.text); setEditingMemory(true); }}>{t("纠正")}</button>
            <button type="button" onClick={() => setForgetConfirm(true)}>{t("遗忘")}</button></div>
          {forgetConfirm && <div role="alert"><p>{t("遗忘会撤回这条记忆及依赖它的整理内容，完成后才会从列表消失。")}</p>
            <button type="button" disabled={forgetMemory.isPending} onClick={() => forgetMemory.mutate(memory.id)}>
              {forgetMemory.isPending ? t("正在遗忘…") : t("确认遗忘")}</button>
            <button type="button" onClick={() => setForgetConfirm(false)}>{t("保留")}</button></div>}
          {forgetMemory.error && <p role="alert">{t("遗忘未完成：")}{errorMessage(forgetMemory.error)}</p>}
        </article> : saved ? <article className="assistant-card"><h2>{t("旧本地收藏")}</h2><p>{t("来自")}{saved.surface === 'assistant' ? t("助理") : t("工作")}{t("回复 ·")} {dateTime(saved.savedAt)}{t("。尚不是助理自动记忆。")}</p>
          <MessageContent text={saved.text} /><div className="assistant-actions"><button type="button" disabled={importSaved.isPending}
            onClick={() => importSaved.mutate(saved)}>{t("导入助理记忆")}</button>
            <button type="button" onClick={() => deleteMemory(saved.id)}>{t("取消收藏")}</button></div>
          {importSaved.error && <p role="alert">{t("导入未完成：")}{errorMessage(importSaved.error)}</p>}
        </article> : <>
          {workspace.data?.memories.length ? workspace.data.memories.map((item) =>
            <button key={item.id} type="button" className="assistant-card assistant-item"
              onClick={() => openMemory(item.id, item.text)}><span className="assistant-item-icon"><AppIcon name="bookmark" /></span>
              <span><strong>{item.context}</strong><small>{item.kind === 'explicit' ? t("明确记录") : item.kind === 'observed' ? t("观察所得") : t("推断")} · {dateTime(item.verifiedAt)}</small></span>
              <AppIcon name="chevron" /></button>) : !workspace.isLoading && !workspace.error
              && <div className="assistant-card assistant-empty"><h3>{t("还没有助理记忆")}</h3><p>{t("助理会从可靠来源整理，也可以手动导入旧收藏。")}</p></div>}
          {workspace.data?.hasMoreMemories && <button type="button" disabled={workspace.isFetching}
            onClick={() => setMemoryLimit((limit) => Math.min(limit + 100, 10_000))}>{t("加载更早的记忆")}</button>}
          {currentSources.length > 0 && <details className="assistant-card"><summary>{t("助理来源（")}{currentSources.length}{workspace.data?.hasMoreSources ? '+' : ''}）</summary>
            <p className="assistant-home-note">{t("这里列出助理已处理的来源。撤销助理读取不会删除原始工作或对话。")}</p>
            {sourceRefs(currentSources)}
            {workspace.data?.hasMoreSources && <button type="button" disabled={workspace.isFetching}
              onClick={() => setMemoryLimit((limit) => Math.min(limit + 100, 10_000))}>{t("加载更多来源")}</button>}</details>}
          {savedMemories.length > 0 && <section><div className="assistant-section-title"><h2>{t("旧本地收藏")}</h2></div>
            <p className="assistant-home-note">{t("它们来自本机手动保存的回复，点击后可选择导入。")}</p>
            {savedMemories.map((item) => <button key={item.id} type="button" className="assistant-card assistant-item"
              onClick={() => { setSelectedSaved(item.id); setSelectedMemory(undefined); }}><span className="assistant-item-icon"><AppIcon name="bookmark" /></span>
              <span><strong>{item.text.split('\n').find((line) => line.trim())?.slice(0, 60)}</strong>
                <small>{item.surface === 'assistant' ? t("助理") : t("工作")}{t("旧收藏 ·")} {dateTime(item.savedAt)}</small></span><AppIcon name="chevron" /></button>)}</section>}
        </>}
      </>}
      {tab === t("连接") && <>
        <div className="assistant-section-title"><h1>{t("连接")}</h1><button type="button" onClick={() => navigate('/settings?section=connections')}>{t("管理连接")}</button></div>
        <article className="assistant-card assistant-connection-card"><span className="assistant-connection-mark"><AppIcon name="work" /></span><h2>{t("企业微信")}</h2><p>{t("接续已绑定的私聊，与桌面助理同步消息和回复。")}</p>
          {!desktop ? <p>{t("请在桌面应用中连接企业微信。")}</p> : linkLoading ? <p role="status">{t("正在读取绑定状态…")}</p> : linkError ? <p role="alert">{t("连接状态不可用。")}<button type="button" onClick={retryLink}>{t("重试")}</button></p> : <dl className="assistant-facts"><div><dt>{t("助理会话")}</dt><dd>{link?.linked ? t("已绑定") : t("未绑定")}</dd></div>{link?.linked && <><div><dt>{t("连接")}</dt><dd>{link.connectionId}</dd></div><div><dt>{t("服务状态")}</dt><dd>{connections.isLoading ? t("正在读取…") : connections.error ? t("状态不可用") : boundConnection?.status === 'connected' ? t("已连接") : boundConnection?.status === 'connecting' ? t("正在连接") : t("连接不可用")}</dd></div></>}</dl>}
          {connections.error && <button type="button" onClick={() => void connections.refetch()}>{t("重新读取服务状态")}</button>}
          <button type="button" className="assistant-primary" onClick={() => navigate('/settings?section=connections')}>{link?.linked ? t("连接设置") : t("绑定企业微信")}</button>
        </article>
        {link?.linked && <article className="assistant-card"><h3>{t("原桌面会话")}</h3><p>{t("绑定前的桌面对话保留为只读归档。")}</p><button type="button" onClick={onToggleArchive}>{archiveOpen ? t("返回已绑定会话") : t("查看原桌面会话")}</button></article>}
      </>}
    </div>
  </div>;
}
