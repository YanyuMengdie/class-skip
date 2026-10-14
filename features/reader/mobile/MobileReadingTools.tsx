import React, { createContext, useContext, useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useAppLanguage } from '@/shared/i18n/appLanguage';
export const MobileReadingToolsContext = createContext<{
  target: HTMLDivElement | null;
  open: () => void;
  close: () => void;
} | null>(null);
export const useMobileReadingTools = () => useContext(MobileReadingToolsContext);

/** Native modal focus and Escape behavior; content remains mounted so drafts are preserved. */
export function MobileReadingSheet({ open, onClose, title, children, composer = false }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; composer?: boolean;
}) {
  const { text } = useAppLanguage();
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) return;
    const fit = () => {
      const viewport = window.visualViewport;
      dialog.style.maxHeight = `${Math.max(180, (viewport?.height ?? window.innerHeight) - 16)}px`;
      dialog.style.bottom = `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`;
    };
    fit();
    window.visualViewport?.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('scroll', fit);
    if (composer) dialog.querySelector('textarea')?.focus({ preventScroll: true });
    return () => {
      window.visualViewport?.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('scroll', fit);
    };
  }, [open, composer]);
  return <dialog ref={ref} className={`mobile-reading-sheet${composer ? ' is-composer' : ''}`} aria-label={title}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClose={() => { if (open) onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientY < bounds.top || event.clientY > bounds.bottom || event.clientX < bounds.left || event.clientX > bounds.right) onClose();
    } }}>
    <header className="mobile-sheet-heading"><strong>{title}</strong><button type="button" onClick={onClose} aria-label={text('收起面板', 'Close panel')}><X size={20}/></button></header>
    {children}
  </dialog>;
}
