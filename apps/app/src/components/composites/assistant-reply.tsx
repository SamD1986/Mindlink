import { useEffect, useState } from 'react';

import { AppIcon } from './app-icon.js';
import { MessageContent } from './message-content.js';
import type { ImagePreview } from './message-image.js';
import type { ReplyRunInfo } from './reply-run-cache.js';
import { ReplyRunDetails } from './reply-run-details.js';
import { isSavedContent, readSavedContent, removeSavedContent, saveContent, savedContentEvent, type SavedContentKind } from './saved-content.js';
import { t } from '../../languages/index.js';

export function AssistantReply({
  text,
  surface,
  run,
  onOpenFilePath,
  onAddToConversation,
  onOpenImageInSidebar,
  resolveWorkspaceImage,
}: {
  text: string;
  surface: 'work' | 'assistant';
  run?: ReplyRunInfo;
  onOpenFilePath?: (path: string) => void;
  onAddToConversation?: (markdown: string) => void;
  onOpenImageInSidebar?: (image: ImagePreview) => void;
  resolveWorkspaceImage?: (path: string) => Promise<string | null>;
}) {
  const [copied, setCopied] = useState(false);
  const [errorNotice, setErrorNotice] = useState('');
  const [, setSavedVersion] = useState(0);
  useEffect(() => {
    const update = () => setSavedVersion((value) => value + 1);
    window.addEventListener(savedContentEvent, update);
    return () => window.removeEventListener(savedContentEvent, update);
  }, []);
  const savedMemory = isSavedContent('memory', surface, text);
  const savedKnowledge = isSavedContent('knowledge', surface, text);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setErrorNotice('');
    } catch { setErrorNotice(t("复制失败，请检查剪贴板权限")); }
  }

  function toggleSaved(kind: SavedContentKind) {
    try {
      const existing = readSavedContent().find((item) => item.kind === kind && item.surface === surface && item.text === text);
      if (existing) removeSavedContent(existing.id);
      else saveContent(kind, surface, text);
      setErrorNotice('');
    } catch { setErrorNotice(t("保存状态更新失败，请检查本地存储空间")); }
  }

  return <div className="assistant-reply">
    {run && <ReplyRunDetails run={run} />}
    <MessageContent text={text} onOpenFilePath={onOpenFilePath} onAddToConversation={onAddToConversation}
      onOpenImageInSidebar={onOpenImageInSidebar} resolveWorkspaceImage={resolveWorkspaceImage} />
    <div className="reply-toolbar" role="toolbar" aria-label={t("回复操作")}>
      <button type="button" className={copied ? 'copied' : ''} aria-label={copied ? t("已复制") : t("复制")} data-tooltip={copied ? t("已复制") : t("复制")} onClick={() => void copy()}><AppIcon name={copied ? 'check' : 'copy'} /></button>
      <button type="button" className={savedMemory ? 'saved' : ''} aria-label={savedMemory ? t("取消保存到记忆") : t("保存到记忆")} aria-pressed={savedMemory}
        data-tooltip={savedMemory ? t("取消保存到记忆") : t("保存到记忆")} onClick={() => toggleSaved('memory')}><AppIcon name={savedMemory ? 'bookmark-filled' : 'bookmark'} /></button>
      <button type="button" className={savedKnowledge ? 'saved' : ''} aria-label={savedKnowledge ? t("取消保存到知识库") : t("保存到知识库")} aria-pressed={savedKnowledge}
        data-tooltip={savedKnowledge ? t("取消保存到知识库") : t("保存到知识库")} onClick={() => toggleSaved('knowledge')}><AppIcon name={savedKnowledge ? 'knowledge-filled' : 'knowledge'} /></button>
      {errorNotice && <span className="reply-action-notice" role="alert">{errorNotice}</span>}
    </div>
  </div>;
}
