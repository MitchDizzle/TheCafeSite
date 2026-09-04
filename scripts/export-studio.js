#!/usr/bin/env node
/**
 * Export studio pieces to PNG at their exact artboard size.
 *
 *   npm run build               → every piece, as part of the site build
 *   npm run export              → every piece, without the clean
 *   npm run export -- fb-profile → one piece, by slug
 *
 * Output goes to _site/studio/downloads/ under a stable, undated filename, so
 * the board can link to it and the pieces can be pulled down on a phone. A
 * dated copy is also dropped in exports/ as local history.
 *
 * Why headless Chrome and not a button on the board:
 *
 * The pieces are not flat HTML. The wordmark is an inline SVG carrying a
 * `filter: drop-shadow()`, `paint-order: stroke`, and a miter limit, sitting on
 * a CSS gradient, in Google-hosted fonts. In-browser DOM-to-canvas rasterisers
 * either drop CSS filters on SVG or need every font inlined as base64 first,
 * and they fail QUIETLY — you get a slightly wrong export and only notice once
 * it is already someone's profile picture. Rendering the real page in the real
 * engine is the only way to be sure the file matches the proof.
 *
 * This mirrors social/export.ps1, which does the same job for social/. Node
 * rather than PowerShell so it runs from `npm run` on any machine.
 *
 * The pieces link assets root-absolute (/assets/...), which file:// cannot
 * resolve, so a throwaway static server fronts _site for the duration. It
 * mirrors .htaccess's extensionless lookup so /studio/fb-profile resolves the
 * same way it does in production.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const REPO = path.join(__dirname, "..");
const SITE = path.join(REPO, "_site");
const OUT = path.join(REPO, "exports");
const MANIFEST = path.join(SITE, "studio", "pieces.json");

// Published copies, served at /studio/downloads/ so the pieces can be pulled
// down on a phone instead of off this machine — which is the whole point of
// them: the person posting to Facebook is not sitting at the build machine.
//
// STABLE FILENAMES, no date stamp, because these are URLs now. The dated
// copies in exports/ stay as local history; these get overwritten every build
// so a link that works today still works after the next one.
//
// This directory is INSIDE _site, so `npm run clean` wipes it with everything
// else and a piece deleted from the board stops being downloadable. That is
// the intended behaviour — a stale PNG of a menu we no longer serve is worse
// than no PNG at all.
const DOWNLOADS = path.join(SITE, "studio", "downloads");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

/**
 * CI runs as a user whose namespace sandbox Chrome cannot set up, so headless
 * dies on start with no useful message. Only on CI: locally the sandbox costs
 * nothing and there is no reason to drop it.
 */
function sandboxArgs() {
  return process.env.CI ? ["--no-sandbox", "--disable-dev-shm-usage"] : [];
}

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env["ProgramFiles(x86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* a malformed env var must not take the whole run down */
    }
  }
  return null;
}

function startServer(root) {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    // Refuse to serve outside the root, however the path is spelled.
    let file = path.normalize(path.join(root, urlPath));
    if (!file.startsWith(root)) {
      res.writeHead(403).end("forbidden");
      return;
    }

    // Same resolution order as .htaccess: directory index, then the
    // extensionless form, so /studio/fb-profile finds fb-profile.html.
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, "index.html");
    } else if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) {
      file = `${file}.html`;
    }

    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("not found");
      return;
    }

    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });

  return new Promise((resolve) => {
    // Port 0: let the OS pick a free one, so this never collides with a dev
    // server already running on 8080.
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function shoot(browser, url, outFile, width, height, scale) {
  return new Promise((resolve, reject) => {
    // A throwaway profile dir keeps this from fighting an already-open Chrome.
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cafe-export-"));
    const args = [
      "--headless=new",
      `--screenshot=${outFile}`,
      `--window-size=${width},${height}`,
      `--force-device-scale-factor=${scale}`,
      "--hide-scrollbars",
      "--disable-gpu",
      ...sandboxArgs(),
      // Give the Google Fonts request time to land before the shutter; without
      // it the type falls back and the export is silently wrong.
      "--virtual-time-budget=10000",
      `--user-data-dir=${profile}`,
      url,
    ];

    const child = spawn(browser, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", () => {
      fs.rmSync(profile, { recursive: true, force: true });
      resolve(fs.existsSync(outFile));
    });
  });
}

/**
 * Print a piece to PDF through Chrome's own print pipeline.
 *
 * This is NOT the screenshot path with a different extension. The PNG is a
 * raster of the SCREEN rendering; this runs the page through @media print, so
 * it drops the proofing furniture the tri-fold carries — the panel-role
 * captions and the red "not re-costed" bullets — and keeps the type and the
 * wordmark as vectors, which is what a print shop actually wants.
 *
 * --no-pdf-header-footer kills the URL and date Chrome otherwise stamps in the
 * paper margin. The sheet size comes from the piece's own `@page { size }`
 * rule, which is why only pieces with `pageSize` front matter get a PDF; there
 * is no CLI flag for paper size, so a piece without the rule would silently
 * come out US Letter portrait.
 */
function printPdf(browser, url, outFile) {
  return new Promise((resolve, reject) => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cafe-pdf-"));
    const args = [
      "--headless=new",
      `--print-to-pdf=${outFile}`,
      "--no-pdf-header-footer",
      "--disable-gpu",
      ...sandboxArgs(),
      // Same reason as the screenshot path: without it the Google Fonts
      // request has not landed and the type falls back silently.
      "--virtual-time-budget=10000",
      `--user-data-dir=${profile}`,
      url,
    ];

    const child = spawn(browser, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", () => {
      fs.rmSync(profile, { recursive: true, force: true });
      resolve(fs.existsSync(outFile));
    });
  });
}

(async () => {
  if (!fs.existsSync(MANIFEST)) {
    console.error(`No manifest at ${MANIFEST}.\nRun \`npm run build\` first.`);
    process.exit(1);
  }

  const browser = findBrowser();
  if (!browser) {
    console.error("No Chrome or Edge found. Set CHROME_PATH to the executable.");
    process.exit(1);
  }

  const only = process.argv[2];
  const pieces = JSON.parse(fs.readFileSync(MANIFEST, "utf8"))
    .filter((piece) => !only || piece.slug === only);

  if (!pieces.length) {
    console.error(only ? `No piece with slug "${only}".` : "No pieces on the board.");
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(DOWNLOADS, { recursive: true });
  const { server, port } = await startServer(SITE);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  // Keep a dated copy in exports/ as local history. The published file is the
  // one that was just written; copying rather than re-rendering means the two
  // can never disagree.
  const archive = (published, ext) =>
    fs.copyFileSync(published, path.join(OUT, `${path.basename(published, ext)}_${stamp}${ext}`));

  let failed = 0;
  for (const piece of pieces) {
    const url = `http://127.0.0.1:${port}${piece.url}`;
    const png = path.join(DOWNLOADS, `${piece.slug}.png`);

    const ok = await shoot(browser, url, png, piece.w, piece.h, piece.scale);
    if (!ok) {
      failed++;
      console.error(`  FAILED  ${piece.slug}`);
      continue;
    }
    archive(png, ".png");

    const px = `${piece.w * piece.scale}x${piece.h * piece.scale}`;
    console.log(`  ${piece.slug.padEnd(26)} ${px.padEnd(12)} ${path.relative(REPO, png)}`);

    // Anything with a pageSize is meant for paper, so it also gets a vector
    // PDF at that sheet size — one page per artboard, print styles applied.
    if (piece.print) {
      const pdf = path.join(DOWNLOADS, `${piece.slug}.pdf`);
      const pdfOk = await printPdf(browser, url, pdf);
      if (pdfOk) {
        archive(pdf, ".pdf");
        console.log(`  ${"".padEnd(26)} ${"pdf".padEnd(12)} ${path.relative(REPO, pdf)}  ← vector, print this one`);
      } else {
        failed++;
        console.error(`  FAILED  ${piece.slug} (pdf)`);
      }
    }
  }

  server.close();
  console.log(
    `
${pieces.length - failed}/${pieces.length} exported
` +
    `  published  /studio/downloads/  (${path.relative(REPO, DOWNLOADS)})
` +
    `  archived   ${path.relative(REPO, OUT)}/  (dated, local only)`
  );
  process.exit(failed ? 1 : 0);
})();
