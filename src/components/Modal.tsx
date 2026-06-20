import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  hideClose?: boolean;
}

export function Modal({ open, onClose, title, children, wide, hideClose }: ModalProps) {
  if (!open) return null;

  return (
    <div
      className="modal open"
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-card" style={wide ? { width: 'min(1000px, 100%)' } : undefined}>
        <div className="panel-header">
          <h3>{title}</h3>
          {!hideClose && <button className="btn" type="button" onClick={onClose}>Close</button>}
        </div>
        <div className="panel-body">
          {children}
        </div>
      </div>
    </div>
  );
}
