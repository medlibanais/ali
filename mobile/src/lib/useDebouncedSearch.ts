import { useEffect, useState } from 'react';

const SEARCH_DEBOUNCE_MS = 300;

/** Returns the normalized query only after it has stayed unchanged for 300 ms. */
export function useDebouncedSearch(value: string): string {
  const [settled, setSettled] = useState('');

  useEffect(() => {
    setSettled('');
    if (!value) return;
    const timer = setTimeout(() => setSettled(value), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);

  return settled === value ? settled : '';
}
