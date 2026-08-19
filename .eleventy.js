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

  // The studio drop folder. Eleventy ignores non-template formats, so a PDF
  // or PNG left in src/studio/files/ would never reach _site without this.
  // src/_data/studioFiles.js reads the same folder to build the board.
  eleventyConfig.addPassthroughCopy("src/studio/files");

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

  // Narrow a list to the items whose `key` equals `value`.
  //
  // Nunjucks 3.2 ships a selectattr, but it IGNORES its test arguments and
  // filters on truthiness alone — selectattr("category", "equalto", "Print")
  // quietly returns every item that has any category at all. The studio board
  // groups by category, so it needs a filter that actually compares.
  eleventyConfig.addFilter("where", (arr, key, value) =>
    (arr || []).filter((item) => item && item[key] === value)
  );

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

    // Strip stroke-width out of inline style attributes.
    //
    // Inkscape stamps the artwork with the stroke-width it used at authoring
    // time — style="...;stroke-width:0.264583;..." on the path, 0.264583 being
    // 1px expressed in this file's mm user units. An inline style beats a
    // stylesheet, so that one declaration silently overrode every stroke-width
    // the page asked for: .hero-wordmark and .wordmark--light both request 2.1
    // user units and both were rendering a ~1/8th-weight hairline instead.
    //
    // The font-* declarations go too: they are vestigial on a path that is
    // already outlines, and dropping them keeps this in step with what
    // lvcafetogo.com ships today (its paths carry only fill-opacity:1).
    // fill-opacity is kept because it still does something. stroke-width
    // PRESENTATION attributes are left alone: those already lose to CSS, so
    // they can legitimately carry an author's intent.
    svg = svg.replace(/\sstyle="([^"]*)"/gi, (whole, decls) => {
      const kept = decls
        .split(";")
        .filter(
          (d) =>
            d.trim() &&
            !/^\s*(stroke-width|font-size|font-family|-inkscape-font-specification)\s*:/i.test(d)
        )
        .join(";");
      return kept ? ` style="${kept}"` : "";
    });

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
