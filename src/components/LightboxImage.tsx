import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  src: string;
  alt: string;
  className?: string;
};

export function LightboxImage({ src, alt, className }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }

    window.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey, true);
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="lightbox-trigger"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={alt ? `Ver ${alt} en grande` : 'Ver en grande'}
      >
        <img src={src} alt={alt} className={className} />
      </button>
      {open &&
        createPortal(
          <div
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
        )}
    </>
  );
}
