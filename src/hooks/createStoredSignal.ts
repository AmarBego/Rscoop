import { createSignal, createEffect, Signal } from "solid-js";

/**
 * Creates a signal that is automatically persisted to localStorage.
 * This is a reactive primitive that wraps createSignal and adds a
 * createEffect to sync the signal's value to localStorage.
 *
 * @param key The key to use in localStorage.
 * @param initialValue The value to use if nothing is stored for the given key.
 * @returns A Signal [getter, setter] that is synced with localStorage.
 */
export function createStoredSignal<T extends string>(
  key: string,
  initialValue: T,
): Signal<T> {
  const storedValue = localStorage.getItem(key);
  
  // Initialize the signal with the stored value or the initial value.
  // The type cast is safe because we are storing simple strings.
  const [value, setValue] = createSignal<T>(
    storedValue ? (storedValue as T) : initialValue
  );

  // This effect runs whenever the signal's value changes,
  // updating the value in localStorage.
  createEffect(() => {
    localStorage.setItem(key, value());
  });

  return [value, setValue];
} 