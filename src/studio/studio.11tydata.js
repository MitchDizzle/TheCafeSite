// Directory data for /studio/ — the internal proof board.
//
// Nothing under here is for the public. The meta tag below is the client-side
// half; src/.htaccess sends a matching X-Robots-Tag header, which is the half
// that actually works on a PDF or a PNG (a binary has nowhere to put a meta
// tag, and an image is exactly what a scraper wants).
//
// Deliberately NOT listed in robots.txt or sitemap.xml: naming the path in a
// public file advertises it to the crawlers that ignore the rules, which are
// the only ones worth worrying about here.
//
// permalink is inherited from src/src.11tydata.js, so these still build to
// flat files (studio/index.html, studio/front-door-banner.html).
module.exports = {
  noindex: true,
  robots: "noindex, nofollow, noarchive, nosnippet, noimageindex",
};
