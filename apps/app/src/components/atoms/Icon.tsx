import type { HTMLAttributes } from 'react';

export function Icon({
  name,
  size = 16,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  name: string;
  size?: number;
}) {
  return (
    <span
      {...props}
      className={`yp-icon yp-icon--${name} ${props.className || ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        color: 'var(--yp-icon)',
        ...props.style,
      }}
      role="img"
      aria-label={name}
    />
  );
}
