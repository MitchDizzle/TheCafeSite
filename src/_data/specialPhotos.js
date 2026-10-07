// The daily-special photos in photos.json, for pieces made only for
// specials (the Facebook Story, studio/fb-story-special.njk). Pagination
// can't filter by a field, so the list is narrowed here.
const { photos } = require("./photos.json");

module.exports = () => photos.filter((p) => p.special);
