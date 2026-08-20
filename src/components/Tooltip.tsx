import { useState } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

export function Tooltip({ text, children }: TooltipProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={(e) => setRect(e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => setRect(null)}
    >
      {children}
      {rect && createPortal(
        <div
          className="tooltip-portal"
          style={{
            position: 'fixed',
            left: rect.left + rect.width / 2,
            top: rect.top - 7,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {text}
        </div>,
        document.body,
      )}
    </span>
  );
}
