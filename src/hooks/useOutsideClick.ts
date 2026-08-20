import { useEffect } from 'react';

/**
 * Calls `handler` when a mousedown event occurs outside every element in `refs`.
 * Pass multiple refs to treat a button + its dropdown as one logical unit.
 */
export function useOutsideClick(
  refs: React.RefObject<Element | null>[],
  handler: () => void,
) {
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (refs.every((ref) => !ref.current?.contains(e.target as Node))) {
        handler();
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  // refs array identity is stable (module-level or useRef); handler should be stable too.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handler]);
}
