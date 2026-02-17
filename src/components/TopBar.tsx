export function TopBar(props: {
  isDesktopApp: boolean;
  isWindowMaximized: boolean;
  showGlobalLoad: boolean;
  globalLoadProgress: number;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
}) {
  if (!props.isDesktopApp) {
    return null;
  }

  return (
    <>
      <div className="window-topbar">
        <div className="window-controls" aria-hidden="true">
          <button
            type="button"
            className="window-btn"
            aria-label="Minimize"
            title="Minimize"
            onClick={props.onMinimize}
          >
            <span className="window-icon icon-minimize" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="window-btn"
            aria-label={props.isWindowMaximized ? "Restore" : "Maximize"}
            title={props.isWindowMaximized ? "Restore" : "Maximize"}
            onClick={props.onToggleMaximize}
          >
            <span
              className={`window-icon ${props.isWindowMaximized ? "icon-restore" : "icon-maximize"}`}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            className="window-btn window-btn-close"
            aria-label="Close"
            title="Close"
            onClick={props.onClose}
          >
            <span className="window-icon icon-close" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className={`global-load-line${props.showGlobalLoad ? " active" : ""}`} aria-hidden="true">
        <span className="global-load-fill" style={{ width: `${Math.round(props.globalLoadProgress * 100)}%` }} />
      </div>
    </>
  );
}
