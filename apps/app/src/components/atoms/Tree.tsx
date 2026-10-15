import type { HTMLAttributes, ReactNode } from 'react';

export function Tree({
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
}) {
  return (
    <div
      {...props}
      className={`yp-tree ${props.className || ''}`}
      style={{
        fontFamily: 'var(--yp-font-body)',
        fontSize: 'var(--yp-font-size-body)',
        lineHeight: 'var(--yp-line-height-body)',
        color: 'var(--yp-text)',
        ...props.style,
      }}
    >
      {children}
    </div>
  );
}
