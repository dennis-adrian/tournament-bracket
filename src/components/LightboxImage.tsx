import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  src: string;
  alt: string;
  className?: string;
  expand?: 'image' | 'icon';
};

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LightboxImage({
  src,
  alt,
  className,
  expand = 'image',
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const label = alt ? `Ver ${alt} en grande` : 'Ver en grande';

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const overlay = overlayRef.current;
      if (!overlay) return;

      const focusable = Array.from(
        overlay.querySelectorAll<HTMLElement>(focusableSelector),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !overlay.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !overlay.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey, true);
      triggerRef.current?.focus();
    };
  }, [open]);

  function openLightbox(event: MouseEvent) {
    event.stopPropagation();
    setOpen(true);
  }

  const overlay =
    open &&
    createPortal(
      <div
        ref={overlayRef}
        className="lightbox-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={() => setOpen(false)}
      >
        <span id={titleId} className="sr-only">
          {alt || 'Imagen a tamaño completo'}
        </span>
        <button
          ref={closeRef}
          type="button"
          className="lightbox-close"
          onClick={() => setOpen(false)}
          aria-label="Cerrar"
        >
          ×
        </button>
        <figure
          className="lightbox-figure"
          onClick={(event) => event.stopPropagation()}
        >
          <img src={src} alt={alt} className="lightbox-full" />
          {alt ? (
            <figcaption className="lightbox-caption">{alt}</figcaption>
          ) : null}
        </figure>
      </div>,
      document.body,
    );

  if (expand === 'icon') {
    return (
      <>
        <img src={src} alt={alt} className={className} />
        <button
          ref={triggerRef}
          type="button"
          className="lightbox-expand"
          onClick={openLightbox}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={label}
        >
          <ExpandIcon />
        </button>
        {overlay}
      </>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="lightbox-trigger"
        onClick={openLightbox}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
      >
        <img src={src} alt={alt} className={className} />
      </button>
      {overlay}
    </>
  );
}
