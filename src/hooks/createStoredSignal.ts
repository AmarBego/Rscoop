import { createSignal, createEffect, Signal } from "solid-js";
import { getErrorMessage } from "../utils/errors";

export function createStoredSignal<T extends string>(
  key: string,
  initialValue: T,
): Signal<T> {
  let storedValue: string | null = null;
  try {
    storedValue = localStorage.getItem(key);
  } catch (error) {
    console.warn(`Failed to read ${key} from localStorage: ${getErrorMessage(error)}`);
  }
  
  // Initialize the signal with the stored value or the initial value.
  // The type cast is safe because we are storing simple strings.
  const [value, setValue] = createSignal<T>(
    storedValue ? (storedValue as T) : initialValue
  );

  // This effect runs whenever the signal's value changes,
  // updating the value in localStorage.
  createEffect(() => {
    try {
      localStorage.setItem(key, value());
    } catch (error) {
      console.warn(`Failed to write ${key} to localStorage: ${getErrorMessage(error)}`);
    }
  });

  return [value, setValue];
}
