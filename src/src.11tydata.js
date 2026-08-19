// Flat-file output.
//
// Eleventy's default would build about.njk to about/index.html, serving it at
// /about/ with a trailing slash. The live site is already indexed at the
// extensionless /about, and .htaccess maps that to about.html, so building
// flat files keeps every existing URL, canonical tag, and sitemap entry
// exactly as it is. Remove this and you change the shape of every URL.
module.exports = {
  permalink: (data) => `${data.page.filePathStem}.html`,
};
