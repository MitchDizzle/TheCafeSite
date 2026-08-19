const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

module.exports = function (eleventyConfig) {
  // Passthrough copies. Everything under assets/ ships as-is.
  eleventyConfig.addPassthroughCopy("src/assets");

  // Dotfiles and root-level statics need explicit mappings — Eleventy will
  // not pick .htaccess up from a directory glob, and .svg/.txt/.xml are not
  // template formats so they are otherwise ignored entirely.
  eleventyConfig.addPassthroughCopy({ "src/.htaccess": ".htaccess" });
  eleventyConfig.addPassthroughCopy("src/favicon.svg");
  eleventyConfig.addPassthroughCopy("src/robots.txt");
  eleventyConfig.addPassthroughCopy("src/sitemap.xml");

  // Cache busting.
  //
  // .htaccess caches CSS and JS for 7 days, so without a changing URL a
  // deployed style change is invisible to anyone who has already visited.
  // The hash is content-based, so rebuilding an unchanged file leaves its
  // URL alone and the cache stays warm.
  const hashCache = new Map();
  eleventyConfig.addFilter("bust", (url) => {
    if (!url || typeof url !== "string") return url;
    if (hashCache.has(url)) return hashCache.get(url);

    const file = path.join(__dirname, "src", url.replace(/^\//, ""));
    let out = url;
    try {
      const hash = crypto
        .createHash("sha1")
        .update(fs.readFileSync(file))
        .digest("hex")
        .slice(0, 8);
      out = `${url}?v=${hash}`;
    } catch (err) {
      // Missing file: ship the plain URL rather than failing the build.
      console.warn(`[bust] could not hash ${file}`);
    }
    hashCache.set(url, out);
    return out;
  });

  // True if an asset exists in src/. Lets a template use real artwork when
  // it is present and fall back to styled text when it is not.
  eleventyConfig.addFilter("hasAsset", (url) => {
    if (!url || typeof url !== "string") return false;
    return fs.existsSync(path.join(__dirname, "src", url.replace(/^\//, "")));
  });

  // Inline an SVG file's markup into the page.
  //
  // An <img> is a separate document, so page CSS cannot reach inside it and
  // an SVG with no fill of its own renders black. Inlining puts the paths in
  // the document, where `fill` inherits normally — one wordmark file can then
  // be cream on the dark hero and dark anywhere else, driven purely by CSS.
  eleventyConfig.addShortcode("inlineSvg", (url, className, label) => {
    const file = path.join(__dirname, "src", String(url).replace(/^\//, ""));
    let svg;
    try {
      svg = fs.readFileSync(file, "utf8");
    } catch (err) {
      console.warn(`[inlineSvg] missing ${file}`);
      return "";
    }

    // Strip the XML prolog, doctype, and editor comments — none are legal
    // partway through an HTML document.
    svg = svg
      .replace(/<\?xml[\s\S]*?\?>/gi, "")
      .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim();

    // Inkscape writes fixed mm width/height. Dropping them lets CSS size the
    // mark; the viewBox alone carries the aspect ratio.
    svg = svg.replace(/<svg\b[^>]*>/i, (open) => {
      let tag = open
        .replace(/\s(width|height)\s*=\s*"[^"]*"/gi, "")
        .replace(/\s(sodipodi|inkscape):[a-z-]+\s*=\s*"[^"]*"/gi, "");
      if (className) tag = tag.replace(/<svg\b/i, `<svg class="${className}"`);
      // A logotype is meaningful content, so it needs an accessible name;
      // without one a screen reader announces nothing at all here.
      tag = label
        ? tag.replace(/<svg\b/i, `<svg role="img" aria-label="${label}"`)
        : tag.replace(/<svg\b/i, '<svg aria-hidden="true" focusable="false"');
      return tag;
    });

    return svg;
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    templateFormats: ["njk", "md", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
