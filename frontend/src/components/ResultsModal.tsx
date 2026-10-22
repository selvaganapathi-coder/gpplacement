import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ResultsModalProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
  footer?: ReactNode;
};

export function ResultsModal({
  open,
  title,
  subtitle,
  onClose,
  wide,
  children,
  footer,
}: ResultsModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="results-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`results-modal ${wide ? "results-modal--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="results-modal__head">
          <div className="min-w-0">
            <h3 id={titleId} className="results-modal__title">
              {title}
            </h3>
            {subtitle ? (
              <p className="results-modal__sub">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="results-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="results-modal__body">{children}</div>
        {footer ? <footer className="results-modal__foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body
  );
}
