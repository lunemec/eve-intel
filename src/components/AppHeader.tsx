import { characterZkillUrl } from "../lib/links";

export function AppHeader() {
  return (
    <header className="toolbar">
      <h1>EVE Intel Browser</h1>
      <p
        style={{
          margin: 0,
          fontSize: "0.86rem",
          color: "#d7c27d",
          textAlign: "right",
          whiteSpace: "nowrap"
        }}
      >
        Like the app? Donate ISK to{" "}
        <a
          href={characterZkillUrl(93227004)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#f6d77d", fontWeight: 700, textDecoration: "none" }}
        >
          Lukas Nemec
        </a>
        .
      </p>
    </header>
  );
}
