export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  };
}

/** Debounce estável para callbacks em useEffect/realtime. */
export function createDebouncedFn<T extends () => void | Promise<void>>(
  fn: T,
  delayMs: number
): { call: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    call: () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void fn();
      }, delayMs);
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
