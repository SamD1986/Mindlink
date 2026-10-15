import React from 'react';
import type { CapabilityApprovalSummary } from '@mindlink-agent/protocol';
import { t } from '../../languages/index.js';

export function isVisibleAssistantDelegationApproval(approval: CapabilityApprovalSummary,
  surface: 'assistant' | 'work'): boolean {
  return surface === 'assistant' && !approval.runId
    && approval.workspaceId.startsWith('assistant-delegation:')
    && (!approval.assistantDelegation || approval.sourceInstanceId === 'assistant-delegation'
      && approval.workspaceId === `assistant-delegation:${approval.assistantDelegation.taskId}`);
}

export function DelegationApprovalDetails({ delegation }: {
  delegation: NonNullable<CapabilityApprovalSummary['assistantDelegation']>;
}) {
  return <dl>
    <div><dt>{t("目标")}</dt><dd>{delegation.goal}</dd></div>
    <div><dt>{t("专业技能")}</dt><dd>{delegation.skillName}</dd></div>
    <div><dt>{t("完成条件")}</dt><dd>{delegation.completionCriteria.join('；')}</dd></div>
    <div><dt>{t("来源引用")}</dt><dd>{delegation.contextRefs.join('、') || t("无")}</dd></div>
    <div><dt>{t("来源版本")}</dt><dd>{Object.entries(delegation.sourceVersions ?? {})
      .map(([ref, version]) => `${ref} · ${version.slice(0, 12)}`).join('；') || t("无")}</dd></div>
    <div><dt>{t("可请求能力")}</dt><dd>{delegation.authorizedCapabilities.join('、') || t("无")}</dd></div>
    <div><dt>{t("只读")}</dt><dd>{delegation.readOnly ? t("是") : t("否")}</dd></div>
  </dl>;
}
