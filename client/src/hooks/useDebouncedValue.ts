import { useState, useEffect } from "react";

/**
 * Returns a debounced version of the input value.
 * The output only updates after the input has been stable for `delayMs`.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = 150): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
