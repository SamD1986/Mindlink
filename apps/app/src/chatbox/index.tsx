import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../shell/workspace.js';
import { ChatPanel } from './chat.js';
import './styles.css';
import { t } from '../languages/index.js';

/**
 * Chatbox 浮层容器：可拖拽、可缩放的对话窗口。
 * 
 * 职责：
 * - 浮层开合：响应 workspace.chatboxOpen 状态
 * - 位置与尺寸：拖拽标题栏移动、拖拽边缘缩放
 * - 层级管理：在 workbench 之上，不阻断下层可见性
 * 
 * ChatPanel 内容完整保留，功能等价迁移（UI-11 先搬后拆）。
 */
export function Chatbox() {
  const { state } = useWorkspace();
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const resizeStart = useRef({ x: 0, y: 0, startWidth: 0, startHeight: 0 });
  const boxRef = useRef<HTMLDivElement>(null);

  // 拖拽标题栏移动
  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      startX: position.x,
      startY: position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPosition({
      x: dragStart.current.startX + dx,
      y: dragStart.current.startY + dy,
    });
  };

  const handleDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // 拖拽边缘缩放
  const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      startWidth: size.width,
      startHeight: size.height,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isResizing) return;
    const dx = e.clientX - resizeStart.current.x;
    const dy = e.clientY - resizeStart.current.y;
    setSize({
      width: Math.max(400, resizeStart.current.startWidth + dx),
      height: Math.max(300, resizeStart.current.startHeight + dy),
    });
  };

  const handleResizeEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isResizing) return;
    setIsResizing(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // 初始居中
  useEffect(() => {
    if (!state.chatboxOpen || !boxRef.current) return;
    const box = boxRef.current;
    const rect = box.getBoundingClientRect();
    setPosition({
      x: (window.innerWidth - rect.width) / 2,
      y: (window.innerHeight - rect.height) / 2,
    });
  }, [state.chatboxOpen]);

  if (!state.chatboxOpen) return null;

  return (
    <div
      ref={boxRef}
      className={`chatbox-overlay ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''}`}
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
      }}
    >
      <div
        className="chatbox-header"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <span className="chatbox-title">{t("对话")}</span>
      </div>
      <div className="chatbox-content">
        <ChatPanel
          active={state.chatboxOpen}
          surface="work"
          onReturnToSchedules={() => {}}
          scheduleOrigin={false}
        />
      </div>
      <div
        className="chatbox-resize-handle"
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
      />
    </div>
  );
}
