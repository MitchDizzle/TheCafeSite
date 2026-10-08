// One Story per special photo, so each needs its own name on the board and
// in /studio/downloads/ (a paginated template shares one fileSlug).
const slug = (photo) => photo.file.replace("/assets/photos/", "").replace(/\.jpg$/, "");

module.exports = {
  eleventyComputed: {
    studioSlug: (data) => `fb-story-${slug(data.photo)}`,
    studioTitle: (data) => `Story: ${data.photo.title}`,
  },
};
