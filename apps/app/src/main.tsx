import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Shell } from './shell/index.js';
import { applyFontPreference, readFontPreference } from './shared/font-preference.js';
import { applyThemePreference, readThemePreference } from './shared/theme-preference.js';
import '../themes/tokens.css';

// 主题与字体偏好仍在启动时应用一次：界面字号经 --yp-font-scale-ui 缩放根字号，
// 因此网格与栏尺寸都不许按 px 写死（见 .tasks/ui-rebuild/tasks.yaml UI-08）。
applyThemePreference(readThemePreference());
applyFontPreference(readFontPreference());
document.documentElement.dataset.mindlinkDesktop = window.mindlink ? 'true' : 'false';

// 根 Provider 只在这里挂一次，任何层都不得再装根 Provider。
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false }, mutations: { retry: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <QueryClientProvider client={queryClient}>
        <Shell />
      </QueryClientProvider>
    </HashRouter>
  </StrictMode>,
);
