import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Native modal (`<dialog>`) on `document.body`, avoiding Starlight z-index/transform conflicts.
 * Astro/Starlight does not expose a modal component for React islands.
 */
export default function FlowGraphExpandDialog({
  open,
  onClose,
  title,
  children,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click only; Esc is handled natively through onCancel
    <dialog
      aria-labelledby="flow-graph-dialog-title"
      className="flow-graph-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      <div className="flow-graph-dialog__inner">
        <header className="flow-graph-dialog__header">
          <h2 className="flow-graph-dialog__title" id="flow-graph-dialog-title">
            {title}
          </h2>
          <button
            aria-label="Close"
            className="flow-graph-dialog__close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="flow-graph-dialog__body">{children}</div>
      </div>
    </dialog>,
    document.body
  );
}
