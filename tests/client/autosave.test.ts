import { afterEach, describe, expect, it, vi } from 'vitest';
import { DebouncedSaver } from '../../src/client/editor/autosave.js';

describe('DebouncedSaver', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces changes and saves the latest payload after 800ms', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const statuses: string[] = [];
    const saver = new DebouncedSaver({
      delay: 800,
      retryDelay: 2_000,
      save,
      onStatus: (status) => statuses.push(status),
    });

    saver.schedule({ content: 'first' });
    await vi.advanceTimersByTimeAsync(400);
    saver.schedule({ content: 'latest' });
    await vi.advanceTimersByTimeAsync(799);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ content: 'latest' });
    expect(statuses).toEqual(['pending', 'pending', 'saving', 'saved']);
  });

  it('retains the draft and retries after a transient save failure', async () => {
    vi.useFakeTimers();
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const statuses: string[] = [];
    const saver = new DebouncedSaver({
      delay: 800,
      retryDelay: 2_000,
      save,
      onStatus: (status) => statuses.push(status),
    });

    saver.schedule({ content: 'draft' });
    await vi.advanceTimersByTimeAsync(800);
    expect(statuses.at(-1)).toBe('error');

    await vi.advanceTimersByTimeAsync(2_000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('does not retry errors marked as non-retryable', async () => {
    vi.useFakeTimers();
    const conflict = new Error('conflict');
    const save = vi.fn().mockRejectedValue(conflict);
    const saver = new DebouncedSaver({
      delay: 800,
      retryDelay: 2_000,
      save,
      onStatus: vi.fn(),
      shouldRetry: (error) => error !== conflict,
    });

    saver.schedule({ content: 'local draft' });
    await vi.advanceTimersByTimeAsync(800);
    await vi.advanceTimersByTimeAsync(4_000);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('saves changes queued while another save is still running', async () => {
    vi.useFakeTimers();
    let resolveFirstSave: (() => void) | undefined;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstSave = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);
    const statuses: string[] = [];
    const saver = new DebouncedSaver({
      delay: 800,
      retryDelay: 2_000,
      save,
      onStatus: (status) => statuses.push(status),
    });

    saver.schedule({ content: 'first' });
    await vi.advanceTimersByTimeAsync(800);
    saver.schedule({ content: 'latest' });
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);

    resolveFirstSave?.();
    await vi.runAllTimersAsync();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ content: 'latest' });
    expect(statuses.at(-1)).toBe('saved');
  });

  it('flushes pending changes immediately when requested', async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const saver = new DebouncedSaver({
      delay: 800,
      retryDelay: 2_000,
      save,
      onStatus: vi.fn(),
    });

    saver.schedule({ content: 'draft' });
    await saver.flushNow();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ content: 'draft' });
  });
});
