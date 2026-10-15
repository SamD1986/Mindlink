import type { HTMLAttributes, ReactNode } from 'react';

export function Panel({
  children,
  level = 1,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  level?: 1 | 2 | 3 | 4 | 5;
}) {
  return (
    <div
      {...props}
      className={`yp-panel yp-panel--level-${level} ${props.className || ''}`}
      style={{
        background: `var(--yp-surface-${level})`,
        borderRadius: 'var(--yp-radius-panel)',
        padding: 'var(--yp-space-panel)',
        border: 'var(--yp-border-panel)',
        ...props.style,
      }}
    >
      {children}
    </div>
  );
}
