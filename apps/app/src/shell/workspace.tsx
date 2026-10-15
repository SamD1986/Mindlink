import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import {
  INITIAL_WORKSPACE,
  closeLayout,
  openLayout,
  setChatboxOpen,
  toggleChatbox,
  type WorkbenchTab,
  type WorkspaceState,
} from './workspace-model.js';
import { t } from '../languages/index.js';

export type Workspace = {
  state: WorkspaceState;
  openLayout(tab: WorkbenchTab): void;
  closeLayout(id: string): void;
  setChatboxOpen(open: boolean): void;
  toggleChatbox(): void;
};

type Action =
  | { type: 'open'; tab: WorkbenchTab }
  | { type: 'close'; id: string }
  | { type: 'chatbox'; open: boolean }
  | { type: 'toggle-chatbox' };

function reduce(state: WorkspaceState, action: Action): WorkspaceState {
  if (action.type === 'open') return openLayout(state, action.tab);
  if (action.type === 'close') return closeLayout(state, action.id);
  if (action.type === 'toggle-chatbox') return toggleChatbox(state);
  return setChatboxOpen(state, action.open);
}

const WorkspaceContext = createContext<Workspace | null>(null);

/**
 * 窗口级共享状态的提供者，由 shell 挂一次。
 * 这不是"根 Provider"（Router/QueryClient 仍只在 main.tsx 挂一次），
 * 而是容器向四条栏提供的唯一协作通道 —— 栏之间不得互相 import。
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, INITIAL_WORKSPACE);
  const value = useMemo<Workspace>(() => ({
    state,
    openLayout: (tab) => dispatch({ type: 'open', tab }),
    closeLayout: (id) => dispatch({ type: 'close', id }),
    setChatboxOpen: (open) => dispatch({ type: 'chatbox', open }),
    toggleChatbox: () => dispatch({ type: 'toggle-chatbox' }),
  }), [state]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): Workspace {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error(t("useWorkspace 必须在 shell 的 WorkspaceProvider 内使用"));
  return value;
}
