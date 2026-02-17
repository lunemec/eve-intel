export function buildUpdaterLogSignature(state: DesktopUpdaterState): string {
  return `${state.status}|${state.progress}|${state.availableVersion}|${state.downloadedVersion}|${state.error}|${state.errorDetails ?? ""}`;
}

export function formatUpdaterLogEntry(state: DesktopUpdaterState): { message: string; data: Record<string, unknown> } | null {
  if (state.status === "error") {
    return {
      message: "Updater error",
      data: {
        message: state.error,
        details: state.errorDetails
      }
    };
  }

  if (
    state.status === "checking" ||
    state.status === "downloading" ||
    state.status === "downloaded" ||
    state.status === "up-to-date"
  ) {
    return {
      message: "Updater state",
      data: {
        status: state.status,
        progress: state.progress,
        availableVersion: state.availableVersion,
        downloadedVersion: state.downloadedVersion
      }
    };
  }

  return null;
}
