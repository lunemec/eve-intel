import React from "react";
import ReactDOM from "react-dom/client";
import "./readmeMediaPreview.css";
import { README_MEDIA_CLIP_FIXTURES, README_MEDIA_HERO_FIXTURE } from "./readmeMediaFixtures";

function ReadmeMediaPreview() {
  return (
    <main className="readme-media-root">
      <div className="readme-media-wrap">
        <section className="readme-media-card readme-media-hero" data-media-scene="hero">
          <h1>{README_MEDIA_HERO_FIXTURE.title}</h1>
          <p>{README_MEDIA_HERO_FIXTURE.subtitle}</p>
          <ul>
            {README_MEDIA_HERO_FIXTURE.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        </section>

        <section className="readme-media-grid">
          {README_MEDIA_CLIP_FIXTURES.map((clip) => (
            <article key={clip.id} className="readme-media-card readme-media-clip" data-media-scene={clip.id} data-media-clip={clip.id}>
              <h2>{clip.label}</h2>
              <p className="readme-media-caption">{clip.caption}</p>
              {clip.frames.map((frame) => (
                <div key={frame.id} className="readme-media-frame" data-media-frame={frame.id}>
                  <h3>{frame.title}</h3>
                  <p>{frame.detail}</p>
                </div>
              ))}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ReadmeMediaPreview />
  </React.StrictMode>
);