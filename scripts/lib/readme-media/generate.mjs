import { copyFile, mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  README_MEDIA_ARTIFACTS,
  README_MEDIA_MANIFEST_BASENAME,
  README_MEDIA_OUTPUT_DIR,
  README_MEDIA_SOURCE_FILES
} from "./config.mjs";
import { computeReadmeMediaSourceHash } from "./hash.mjs";

const PLACEHOLDER_GIF_BASE64 = "R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";
const README_MEDIA_MODE_PARAM = "readmeMedia";
const README_MEDIA_SCENE_PARAM = "mediaScene";
const README_MEDIA_FRAME_PARAM = "mediaFrame";

function commandExists(command) {
  const result = spawnSync(command, ["-version"], { stdio: "ignore" });
  return result.status === 0;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForUrl(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for preview server: ${url}`);
}

function createVitePreviewProcess({ repoRoot, port }) {
  const viteBin = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
  return spawn(
    process.execPath,
    [viteBin, "--config", "vite.readme-media-preview.config.ts", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: repoRoot,
      stdio: "ignore"
    }
  );
}

async function writePlaceholderGif(destinationPath) {
  await writeFile(destinationPath, Buffer.from(PLACEHOLDER_GIF_BASE64, "base64"));
}

function runFfmpegGifFromFrames({ framesDir, outputPath }) {
  const framePattern = path.join(framesDir, "frame-%03d.png");
  const args = ["-y", "-framerate", "2", "-i", framePattern, "-loop", "0", outputPath];
  const result = spawnSync("ffmpeg", args, { stdio: "ignore" });
  return result.status === 0;
}

function buildReadmeMediaQuery({ scene, frame }) {
  const params = new URLSearchParams();
  params.set(README_MEDIA_MODE_PARAM, "1");
  params.set(README_MEDIA_SCENE_PARAM, scene);
  params.set(README_MEDIA_FRAME_PARAM, frame);
  return `?${params.toString()}`;
}

async function waitForReadmeMediaFrame({ page, scene, frame }) {
  const selector = `main.app[data-readme-media-scene="${scene}"][data-readme-media-frame="${frame}"]`;
  await page.locator(selector).first().waitFor({ state: "visible", timeout: 20000 });
}

async function gotoSceneFrame({ page, previewUrl, scene, frame }) {
  const url = `${previewUrl}${buildReadmeMediaQuery({ scene, frame })}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await waitForReadmeMediaFrame({ page, scene, frame });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(180);
}

async function captureClipFrames({ page, artifact, framesDir, previewUrl }) {
  if (!Array.isArray(artifact.frames) || artifact.frames.length === 0) {
    throw new Error(`No frame contract declared for clip: ${artifact.id}`);
  }

  for (let index = 0; index < artifact.frames.length; index += 1) {
    const frame = artifact.frames[index];
    const fileName = `frame-${String(index).padStart(3, "0")}.png`;
    const framePath = path.join(framesDir, fileName);
    await gotoSceneFrame({ page, previewUrl, scene: artifact.scene, frame });
    await page.screenshot({ path: framePath, type: "png" });
  }
}

async function captureWithPlaywright({ repoRoot, outputDir }) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return { captured: false, reason: "playwright-missing" };
  }

  const port = 4174;
  const previewProcess = createVitePreviewProcess({ repoRoot, port });
  const previewUrl = `http://127.0.0.1:${port}/`;
  const ffmpegAvailable = commandExists("ffmpeg");

  try {
    await waitForUrl(previewUrl, 20000);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

    for (const artifact of README_MEDIA_ARTIFACTS) {
      const outputPath = path.join(outputDir, artifact.file);
      await page.setViewportSize({ width: artifact.width, height: artifact.height });

      if (artifact.kind === "image") {
        const frame = Array.isArray(artifact.frames) && artifact.frames.length > 0 ? artifact.frames[0] : "hero";
        await gotoSceneFrame({ page, previewUrl, scene: artifact.scene, frame });
        await page.screenshot({ path: outputPath, type: "png" });
        continue;
      }

      if (!Array.isArray(artifact.frames) || artifact.frames.length === 0) {
        throw new Error(`No frame contract declared for artifact: ${artifact.id}`);
      }

      if (artifact.frames.length !== artifact.frameDurationsMs.length) {
        throw new Error(
          `Frame duration mismatch for ${artifact.id}: frames=${artifact.frames.length} durations=${artifact.frameDurationsMs.length}`
        );
      }

      if (!ffmpegAvailable) {
        await writePlaceholderGif(outputPath);
        continue;
      }

      const framesDir = await mkdtemp(path.join(os.tmpdir(), `readme-media-${artifact.id}-`));
      try {
        await captureClipFrames({ page, artifact, framesDir, previewUrl });
        const created = runFfmpegGifFromFrames({ framesDir, outputPath });
        if (!created) {
          await writePlaceholderGif(outputPath);
        }
      } finally {
        await rm(framesDir, { recursive: true, force: true });
      }
    }

    await browser.close();
    return { captured: true, reason: ffmpegAvailable ? "playwright+ffmpeg" : "playwright-no-ffmpeg" };
  } finally {
    previewProcess.kill();
  }
}

function validateGeneratedOutputs(outputDir) {
  return readdir(outputDir).then((entries) => {
    const names = new Set(entries);
    for (const artifact of README_MEDIA_ARTIFACTS) {
      if (!names.has(artifact.file)) {
        throw new Error(`Missing generated artifact: ${artifact.file}`);
      }
    }
  });
}

export async function generateReadmeMediaArtifacts({ repoRoot = process.cwd() } = {}) {
  const outputDir = path.join(repoRoot, README_MEDIA_OUTPUT_DIR);
  await mkdir(outputDir, { recursive: true });

  let captureResult;
  try {
    captureResult = await captureWithPlaywright({ repoRoot, outputDir });
  } catch (error) {
    const message = error && typeof error === "object" && "message" in error ? String(error.message) : "unknown";
    captureResult = { captured: false, reason: `playwright-error:${message}` };
  }
  if (!captureResult.captured) {
    for (const artifact of README_MEDIA_ARTIFACTS) {
      const outputPath = path.join(outputDir, artifact.file);
      if (artifact.kind === "image") {
        await copyFile(path.join(repoRoot, "screen.png"), outputPath);
      } else {
        await writePlaceholderGif(outputPath);
      }
    }
  }

  await validateGeneratedOutputs(outputDir);

  const sourceHash = await computeReadmeMediaSourceHash({
    repoRoot,
    sourceFiles: README_MEDIA_SOURCE_FILES
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceHash,
    sourceFiles: README_MEDIA_SOURCE_FILES,
    outputs: README_MEDIA_ARTIFACTS.map((artifact) => ({
      id: artifact.id,
      file: artifact.file,
      width: artifact.width,
      height: artifact.height,
      frameDurationsMs: artifact.frameDurationsMs
    })),
    generationMode: captureResult.captured ? captureResult.reason : `fallback:${captureResult.reason}`,
    host: {
      platform: os.platform(),
      release: os.release()
    }
  };

  await writeFile(path.join(outputDir, README_MEDIA_MANIFEST_BASENAME), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

