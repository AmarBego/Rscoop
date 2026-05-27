export function isDomException(error: unknown): error is DOMException {
  return typeof DOMException !== "undefined" && error instanceof DOMException;
}

function getDomExceptionMessage(error: DOMException): string {
  switch (error.name) {
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
      return error.message || `${error.name} DOMException`;
  }
}

export function getErrorMessage(error: unknown): string {
  if (isDomException(error)) {
    return getDomExceptionMessage(error);
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
