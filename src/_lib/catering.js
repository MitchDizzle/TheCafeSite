// The catering guide's packages, numbered and keyed by section, for the
// printed tri-fold (studio/catering-trifold-bw.njk).
//
// `catering | cateringGuide` returns { byId, sections } where every package
// carries `n`, its number on the guide (1, 2, 3… straight down
// _data/catering.json, so a phone order can be "the number 12 for 60"), and
// every section carries `from`, its lowest per-person price.
//
// Numbering lives here rather than in the template because a Nunjucks `set`
// inside a for loop doesn't survive the loop, so a running count can't be
// kept there.

function cateringGuide(catering) {
  let n = 0;
  const sections = (catering.sections || []).map((s) => {
    const packages = s.packages.map((p) => ({ ...p, n: ++n }));
    const prices = packages
      .map((p) => p.price ?? Number((p.priceLabel || "").match(/\$(\d+(?:\.\d+)?)/)?.[1]))
      .filter((x) => Number.isFinite(x));
    return { ...s, packages, from: Math.min(...prices) };
  });
  const byId = Object.fromEntries(sections.map((s) => [s.id, s]));
  return { byId, sections, count: n };
}

module.exports = { cateringGuide };
