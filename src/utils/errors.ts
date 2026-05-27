type ErrorShape = {
  name?: unknown;
  message?: unknown;
};

function isObjectLike(value: unknown): value is ErrorShape {
  return (typeof value === "object" || typeof value === "function") && value !== null;
}

function objectTag(value: unknown): string {
  try {
    return Object.prototype.toString.call(value);
  } catch {
    return "";
  }
}

function safeString(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "Unknown error";
  }
}

function stringProperty(value: ErrorShape, key: keyof ErrorShape): string | null {
  try {
    const prop = value[key];
    return typeof prop === "string" ? prop : null;
  } catch {
    return null;
  }
}

export function isDomException(error: unknown): error is DOMException {
  if (!isObjectLike(error)) {
    return false;
  }

  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return true;
  }

  const tag = objectTag(error);
  return (
    (tag === "[object DOMException]" || tag === "[object QuotaExceededError]") &&
    stringProperty(error, "name") !== null &&
    stringProperty(error, "message") !== null
  );
}

function getDomExceptionMessage(error: DOMException): string {
  const name = stringProperty(error, "name") ?? "DOMException";
  const message = stringProperty(error, "message");

  switch (name) {
    case "NotAllowedError":
      return "Permission was denied.";
    case "SecurityError":
      return "This browser operation is blocked by the current security context.";
    case "QuotaExceededError":
      return "Browser storage quota was exceeded.";
    case "AbortError":
      return "The browser operation was aborted.";
    case "OperationError":
      return "The browser operation failed.";
    default:
      return message || `${name} DOMException`;
  }
}

function isErrorLike(error: unknown): error is ErrorShape {
  if (!isObjectLike(error)) {
    return false;
  }

  try {
    if (error instanceof Error) {
      return true;
    }
  } catch {
    return false;
  }

  return /^\[object .+Error\]$/.test(objectTag(error)) && stringProperty(error, "message") !== null;
}

export function getErrorMessage(error: unknown, fallback = "Unknown error"): string {
  if (isDomException(error)) {
    return getDomExceptionMessage(error);
  }

  if (isErrorLike(error)) {
    return stringProperty(error, "message") || stringProperty(error, "name") || fallback;
  }

  if (error === null || error === undefined) {
    return fallback;
  }

  const message = safeString(error);
  return message && message !== "[object Object]" ? message : fallback;
}
