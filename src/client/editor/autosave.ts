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
  private flushing: Promise<void> | undefined;

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

  hasPendingWork(): boolean {
    return this.pendingPayload !== undefined || this.flushing !== undefined;
  }

  async flushNow(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.pendingPayload === undefined && !this.flushing) {
      return;
    }
    this.flushing ??= this.flushLoop().finally(() => {
      this.flushing = undefined;
    });
    return this.flushing;
  }

  private arm(delay: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flushNow();
    }, delay);
  }

  private async flushLoop(): Promise<void> {
    while (this.pendingPayload !== undefined) {
      const payload = this.pendingPayload;
      this.pendingPayload = undefined;
      this.timer = undefined;
      this.options.onStatus('saving');

      try {
        await this.options.save(payload);
      } catch (error) {
        this.options.onStatus('error');
        if (this.options.shouldRetry?.(error) !== false) {
          if (this.pendingPayload === undefined) {
            this.pendingPayload = payload;
          }
          this.arm(this.options.retryDelay);
        }
        return;
      }
    }
    this.options.onStatus('saved');
  }
}
