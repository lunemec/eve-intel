function buildCliUsageError(UsageErrorClass, message) {
  if (typeof UsageErrorClass === "function") {
    return new UsageErrorClass(message);
  }
  return new Error(message);
}

export function assertCliArgvArray(argv, UsageErrorClass) {
  if (!Array.isArray(argv)) {
    throw buildCliUsageError(UsageErrorClass, "CLI arguments must be provided as an array.");
  }
  return argv;
}

export function readRequiredCliOptionValue({
  argv,
  token,
  nextIndex,
  UsageErrorClass,
  missingValueMessage = `${token} requires a value.`,
  emptyValueMessage = missingValueMessage,
  rejectIfFlag = false,
  rejectIfNonString = false,
  trimForEmptyCheck = false,
  coerceToString = false
}) {
  const rawValue = argv[nextIndex];
  if (rawValue === undefined) {
    throw buildCliUsageError(UsageErrorClass, missingValueMessage);
  }

  if (rejectIfNonString && typeof rawValue !== "string") {
    throw buildCliUsageError(UsageErrorClass, missingValueMessage);
  }

  const value = coerceToString ? String(rawValue) : rawValue;
  if (rejectIfFlag && typeof value === "string" && value.startsWith("--")) {
    throw buildCliUsageError(UsageErrorClass, missingValueMessage);
  }

  if (emptyValueMessage !== null) {
    if (typeof value === "string") {
      const candidate = trimForEmptyCheck ? value.trim() : value;
      if (candidate.length === 0) {
        throw buildCliUsageError(UsageErrorClass, emptyValueMessage);
      }
    } else if (value === null) {
      throw buildCliUsageError(UsageErrorClass, emptyValueMessage);
    }
  }

  return value;
}

export function throwUnknownCliArgument(token, UsageErrorClass) {
  throw buildCliUsageError(UsageErrorClass, `Unknown argument: ${token}`);
}

export function writeCliUsageError({ error, UsageErrorClass, stderr, formatUsageFn }) {
  if (!(error instanceof UsageErrorClass)) {
    return false;
  }

  stderr(error.message);
  stderr("");
  stderr(formatUsageFn());
  return true;
}

export function formatCliRuntimeError(error) {
  if (!error || typeof error !== "object") {
    return "Unknown error";
  }

  const message =
    typeof error.message === "string" && error.message.trim().length > 0
      ? error.message.trim()
      : "";
  return message || "Unknown error";
}
