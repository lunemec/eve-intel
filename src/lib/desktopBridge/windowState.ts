export function bindWindowMaximizedListener(
  desktop: Window["eveIntelDesktop"],
  onState: (maximized: boolean) => void
): (() => void) | undefined {
  if (!desktop) {
    return undefined;
  }

  let mounted = true;
  void desktop.isWindowMaximized().then((value) => {
    if (mounted) {
      onState(value);
    }
  });

  const unsubscribe = desktop.onWindowMaximized((value) => {
    onState(value);
  });

  return () => {
    mounted = false;
    unsubscribe();
  };
}
