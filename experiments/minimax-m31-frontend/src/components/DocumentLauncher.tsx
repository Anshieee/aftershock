import { useCallback, useRef, useState } from 'react';
import { Button, IconButton } from './ui';
import { IconClose, IconDocument, IconUpload } from './Icons';

const ACCEPTED = ['application/pdf', '.pdf', '.docx', '.txt'];
const MAX_BYTES = 20 * 1024 * 1024;

export interface SelectedDocument {
  name: string;
  size: number;
  file: File;
}

export function DocumentLauncher({
  onSelect,
  onGuidedExample,
  busy = false,
}: {
  onSelect: (file: SelectedDocument) => void;
  onGuidedExample?: () => void;
  busy?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<SelectedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rippling, setRippling] = useState(false);

  const accept = useCallback(
    (file: File) => {
      const name = file.name.toLowerCase();
      const looksAccepted =
        ACCEPTED.includes(file.type) ||
        name.endsWith('.pdf') ||
        name.endsWith('.docx') ||
        name.endsWith('.txt');
      if (!looksAccepted) {
        setError('Aftershock reads PDF, DOCX and TXT files. That file is not one of them.');
        setSelected(null);
        return;
      }
      if (file.size > MAX_BYTES) {
        setError('That file is larger than 20 MB. Try a smaller manuscript.');
        setSelected(null);
        return;
      }
      setError(null);
      setSelected({ name: file.name, size: file.size, file });
      setRippling(true);
      window.setTimeout(() => setRippling(false), 1100);
      onSelect({ name: file.name, size: file.size, file });
    },
    [onSelect],
  );

  const clear = () => {
    setSelected(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) accept(file);
        }}
        className={`group relative flex items-center gap-4 rounded-lg border bg-paper-raised px-4 py-3.5 transition-[border-color,box-shadow,background-color] duration-200 ease-swift ${
          dragging
            ? 'border-brand bg-brand-soft/40 shadow-lift-2'
            : 'border-ink-border shadow-lift-1 hover:border-ink-soft/50'
        }`}
      >
        {/* Branded ripple acknowledgement */}
        {rippling ? (
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
            <span className="absolute left-6 top-1/2 h-24 w-24 -translate-y-1/2 animate-ripple-out rounded-full border border-brand/50" />
            <span
              className="absolute left-6 top-1/2 h-24 w-24 -translate-y-1/2 animate-ripple-out rounded-full border border-brand/40"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="absolute left-6 top-1/2 h-24 w-24 -translate-y-1/2 animate-ripple-out rounded-full border border-brand/30"
              style={{ animationDelay: '300ms' }}
            />
          </span>
        ) : null}

        <span
          aria-hidden="true"
          className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition-colors duration-200 ${
            dragging ? 'border-brand-line bg-brand-soft text-brand' : 'border-ink-border bg-paper-deep/60 text-ink-muted'
          }`}
        >
          <IconDocument size={17} />
        </span>

        <div className="relative min-w-0 flex-1">
          {selected ? (
            <>
              <p className="truncate text-sm font-medium text-ink">{selected.name}</p>
              <p className="meta mt-0.5">
                {(selected.size / 1024).toFixed(0)} KB · ready to open
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-ink">Drop a manuscript here</p>
              <p className="meta mt-0.5">PDF, DOCX or TXT · up to 20 MB</p>
            </>
          )}
        </div>

        <div className="relative flex shrink-0 items-center gap-1.5">
          {selected ? (
            <>
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                Change file
              </Button>
              <IconButton label="Cancel file selection" onClick={clear}>
                <IconClose size={14} />
              </IconButton>
            </>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              icon={<IconUpload size={13} />}
              onClick={() => inputRef.current?.click()}
            >
              Choose file
            </Button>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          className="sr-only"
          aria-label="Choose a manuscript to open"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) accept(file);
          }}
        />
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs leading-5 text-notice">
          {error}
        </p>
      ) : null}

      {onGuidedExample ? (
        <button
          type="button"
          onClick={onGuidedExample}
          className="group mt-3 inline-flex items-center gap-2 text-sm text-brand-deep transition-colors duration-150 hover:text-brand"
        >
          <span className="h-px w-6 bg-brand-line transition-all duration-200 group-hover:w-8" />
          <span className="underline decoration-brand-line underline-offset-4 group-hover:decoration-brand">
            Open the guided example
          </span>
          <span className="text-xs text-ink-muted">a fictional manuscript, prepared findings</span>
        </button>
      ) : null}
    </div>
  );
}
