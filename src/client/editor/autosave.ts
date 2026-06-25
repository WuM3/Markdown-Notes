export type SaveStatus = 'pending' | 'saving' | 'saved' | 'error';

interface DebouncedSaverOptions<T> {
  delay: number;
  retryDelay: number;
  save: (payload: T) => Promise<void>;
  onStatus: (status: SaveStatus) => void;
  shouldRetry?: (error: unknown) => boolean;
}

export class DebouncedSaver<T> {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pendingPayload: T | undefined;
  private saving = false;

  constructor(private readonly options: DebouncedSaverOptions<T>) {}

  schedule(payload: T): void {
    this.pendingPayload = payload;
    this.options.onStatus('pending');
    this.arm(this.options.delay);
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.pendingPayload = undefined;
  }

  private arm(delay: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, delay);
  }

  private async flush(): Promise<void> {
    if (this.saving || this.pendingPayload === undefined) return;
    const payload = this.pendingPayload;
    this.pendingPayload = undefined;
    this.timer = undefined;
    this.saving = true;
    this.options.onStatus('saving');

    try {
      await this.options.save(payload);
      if (this.pendingPayload === undefined) {
        this.options.onStatus('saved');
      }
    } catch (error) {
      this.options.onStatus('error');
      if (this.options.shouldRetry?.(error) !== false) {
        if (this.pendingPayload === undefined) {
          this.pendingPayload = payload;
        }
        this.arm(this.options.retryDelay);
      }
    } finally {
      this.saving = false;
    }
  }
}
