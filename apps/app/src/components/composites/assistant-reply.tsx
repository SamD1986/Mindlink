import { useState } from 'react';

import { AppIcon } from './app-icon.js';
import { MessageContent } from './message-content.js';
import type { ImagePreview } from './message-image.js';
import type { ReplyRunInfo } from './reply-run-cache.js';
import { ReplyRunDetails } from './reply-run-details.js';
import { t } from '../../languages/index.js';

export function AssistantReply({
  text,
  run,
  onOpenFilePath,
  onAddToConversation,
  onOpenImageInSidebar,
  resolveWorkspaceImage,
}: {
  text: string;
  run?: ReplyRunInfo;
  onOpenFilePath?: (path: string) => void;
  onAddToConversation?: (markdown: string) => void;
  onOpenImageInSidebar?: (image: ImagePreview) => void;
  resolveWorkspaceImage?: (path: string) => Promise<string | null>;
}) {
  const [copied, setCopied] = useState(false);
  const [errorNotice, setErrorNotice] = useState('');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setErrorNotice('');
    } catch { setErrorNotice(t("复制失败，请检查剪贴板权限")); }
  }

  return <div className="assistant-reply">
    {run && <ReplyRunDetails run={run} />}
    <MessageContent text={text} onOpenFilePath={onOpenFilePath} onAddToConversation={onAddToConversation}
      onOpenImageInSidebar={onOpenImageInSidebar} resolveWorkspaceImage={resolveWorkspaceImage} />
    <div className="reply-toolbar" role="toolbar" aria-label={t("回复操作")}>
      <button type="button" className={copied ? 'copied' : ''} aria-label={copied ? t("已复制") : t("复制")} data-tooltip={copied ? t("已复制") : t("复制")} onClick={() => void copy()}><AppIcon name={copied ? 'check' : 'copy'} /></button>
      {errorNotice && <span className="reply-action-notice" role="alert">{errorNotice}</span>}
    </div>
  </div>;
}
