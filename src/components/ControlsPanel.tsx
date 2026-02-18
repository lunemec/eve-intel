import { formatUpdaterStatus } from "../lib/ui";

export function ControlsPanel(props: {
  manualEntry: string;
  onManualEntryChange: (value: string) => void;
  onManualEntrySubmit: () => void;
  onWipeCache: () => void | Promise<void>;
  debugEnabled: boolean;
  onDebugToggle: (enabled: boolean) => void;
  isDesktopApp: boolean;
  updaterState: DesktopUpdaterState | null;
  onRestartToUpdate: () => void;
}) {
  return (
    <>
      <section className="raw">
        <h3>Last Clipboard Payload</h3>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            props.onManualEntrySubmit();
          }}
          className="manual-entry-form"
        >
          <textarea
            className="manual-entry-input"
            value={props.manualEntry}
            placeholder="Paste or type pilot names here..."
            onChange={(event) => props.onManualEntryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                props.onManualEntrySubmit();
              }
            }}
          />
          <button type="submit" className="manual-entry-submit">Submit</button>
        </form>
      </section>
      <section className="raw controls-panel">
        <div className="controls-panel-row">
          <button
            type="button"
            className="settings-button"
            onClick={() => {
              void props.onWipeCache();
            }}
          >
            Wipe Cache
          </button>
          <label className="bottom-debug-toggle">
            <input
              type="checkbox"
              checked={props.debugEnabled}
              onChange={(event) => props.onDebugToggle(event.target.checked)}
            />
            Debug logging
          </label>
          {props.isDesktopApp ? (
            <span className={`updater-status updater-status-right updater-${props.updaterState?.status ?? "idle"}`}>
              {formatUpdaterStatus(props.updaterState)}
            </span>
          ) : null}
          {props.isDesktopApp && props.updaterState?.status === "downloaded" ? (
            <button
              type="button"
              className="settings-button"
              onClick={props.onRestartToUpdate}
            >
              Restart to Update
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
}
