import { useState, type FormEvent } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';

interface ActionDialogProps {
  open: boolean;
  title: string;
  description: string;
  label: string;
  defaultValue?: string;
  confirmText?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: string) => Promise<void>;
}

export function ActionDialog({
  open,
  title,
  description,
  label,
  defaultValue = '',
  confirmText = '确认',
  onOpenChange,
  onSubmit,
}: ActionDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(value.trim());
      onOpenChange(false);
    } catch (reason) {
      setError(messageForError(reason));
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setError('');
    onOpenChange(nextOpen);
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={handleOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content">
          <form onSubmit={handleSubmit}>
            <AlertDialog.Title>{title}</AlertDialog.Title>
            <AlertDialog.Description>{description}</AlertDialog.Description>
            <label className="field-label">
              {label}
              <input
                autoFocus
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </label>
            {error && (
              <div className="dialog-error" role="alert">
                {error}
              </div>
            )}
            <div className="dialog-actions">
              <AlertDialog.Cancel asChild>
                <button type="button" className="button secondary">
                  取消
                </button>
              </AlertDialog.Cancel>
              <button type="submit" className="button primary" disabled={submitting}>
                {submitting ? '处理中' : confirmText}
              </button>
            </div>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  danger?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确认',
  danger = false,
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    setSubmitting(true);
    setError('');
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (reason) {
      setError(messageForError(reason));
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setError('');
    onOpenChange(nextOpen);
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={handleOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content">
          <AlertDialog.Title>{title}</AlertDialog.Title>
          <AlertDialog.Description>{description}</AlertDialog.Description>
          {error && (
            <div className="dialog-error" role="alert">
              {error}
            </div>
          )}
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <button type="button" className="button secondary">
                取消
              </button>
            </AlertDialog.Cancel>
            <button
              type="button"
              className={`button ${danger ? 'danger' : 'primary'}`}
              disabled={submitting}
              onClick={() => void handleConfirm()}
            >
              {submitting ? '处理中' : confirmText}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败';
}
