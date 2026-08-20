import { useEffect, useRef, useState } from 'react';

interface ConfirmationModalProps {
  title: string;
  description: string;
  actionWord: string;   // e.g. 'hide', 'show', 'delete' — what user must type
  actionLabel: string;  // button label, typically same as actionWord capitalised
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationModal({
  title,
  description,
  actionWord,
  actionLabel,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const modalBoxRef = useRef<HTMLDivElement>(null);
  const isEnabled = inputValue.toLowerCase() === actionWord.toLowerCase();

  useEffect(() => {
    // Auto-focus the text input
    inputRef.current?.focus();

    // Capture the element that had focus before modal opened (to restore on close)
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;

      const box = modalBoxRef.current;
      if (!box) return;
      const focusable = Array.from(
        box.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();  // return focus on unmount
    };
  }, [onCancel]);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="modal-box" ref={modalBoxRef}>
        <h2 id="modal-title" className="modal-title">{title}</h2>
        <p className="modal-description">{description}</p>
        <label className="modal-label" htmlFor="modal-confirm-input">
          Type <strong>{actionWord}</strong> to confirm:
        </label>
        <input
          id="modal-confirm-input"
          ref={inputRef}
          className="modal-input"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder={actionWord}
        />
        <div className="modal-actions">
          <button type="button" className="modal-btn modal-btn--cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`modal-btn modal-btn--action modal-btn--${actionWord}`}
            onClick={onConfirm}
            disabled={!isEnabled}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
