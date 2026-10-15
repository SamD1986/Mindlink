import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Button({
  children,
  variant = 'default',
  size = 'medium',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: 'default' | 'primary' | 'ghost';
  size?: 'small' | 'medium' | 'large';
}) {
  return (
    <button
      {...props}
      className={`yp-button yp-button--${variant} yp-button--${size} ${props.className || ''}`}
      style={{
        padding: 'var(--yp-space-button)',
        borderRadius: 'var(--yp-radius-button)',
        border: 'var(--yp-border-button)',
        background: 'var(--yp-surface-button)',
        color: 'var(--yp-text-button)',
        cursor: 'pointer',
        ...props.style,
      }}
    >
      {children}
    </button>
  );
}
