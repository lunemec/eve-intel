# Desktop Wrapper (Electron)

The web app remains fully usable in browser mode.

Electron adds reliable clipboard watching (no browser permission prompts).

For full setup, run, test, and packaging instructions, see `README.md`.

## Install

```bash
npm install
```

## Run in desktop dev mode (two terminals)

Terminal 1:

```bash
npm run desktop:dev:web
```

Terminal 2:

```bash
npm run desktop:dev:app
```

## Run desktop app against production build

```bash
npm run desktop:run
```

## Notes

- Clipboard watcher is implemented in `electron/main.cjs` using native Electron `clipboard.readText()`.
- Renderer receives updates via preload bridge (`window.eveIntelDesktop.onClipboardText(...)`).
- Browser mode still supports `Ctrl+V` and manual submit input.
