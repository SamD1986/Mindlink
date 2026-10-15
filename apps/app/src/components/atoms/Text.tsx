import type { HTMLAttributes, ReactNode } from 'react';

export function Text({
  children,
  variant = 'body',
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  variant?: 'display' | 'heading' | 'body' | 'caption' | 'code';
}) {
  const Tag = variant === 'display' || variant === 'heading' ? 'h2' : 'span';
  return (
    <Tag
      {...props}
      className={`yp-text yp-text--${variant} ${props.className || ''}`}
      style={{
        fontFamily: `var(--yp-font-${variant})`,
        fontSize: `var(--yp-font-size-${variant})`,
        lineHeight: `var(--yp-line-height-${variant})`,
        color: 'var(--yp-text)',
        ...props.style,
      }}
    >
      {children}
    </Tag>
  );
}
