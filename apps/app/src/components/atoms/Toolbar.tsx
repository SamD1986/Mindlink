import type { HTMLAttributes, ReactNode } from 'react';

export function Toolbar({
  children,
  position = 'horizontal',
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  position?: 'horizontal' | 'vertical';
}) {
  return (
    <div
      {...props}
      className={`yp-toolbar yp-toolbar--${position} ${props.className || ''}`}
      style={{
        display: 'flex',
        flexDirection: position === 'horizontal' ? 'row' : 'column',
        gap: 'var(--yp-space-toolbar)',
        padding: 'var(--yp-space-toolbar)',
        background: 'var(--yp-surface-toolbar)',
        borderRadius: 'var(--yp-radius-toolbar)',
        ...props.style,
      }}
    >
      {children}
    </div>
  );
}
