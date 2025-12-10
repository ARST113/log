# Transcoding plugin usage

This repository already contains the `Transcoding.js` plugin. To make it work when you publish it to GitHub:

1. Place `Transcoding.js` in a public location (for example, the root of your GitHub repository) so it can be loaded by Lampa as a plugin script.
2. In Lampa, add the raw URL of `Transcoding.js` (e.g., `https://raw.githubusercontent.com/<user>/<repo>/<branch>/Transcoding.js`) to the list of external plugins.
3. Restart Lampa or reload the application so the plugin initializes.
4. Open **Settings → Player → Транскодинг** to choose how many files are transcoded in parallel (2 or 3).
5. Start playback from a source that provides multiple files; the plugin will prompt for an audio track first, then transcode files in parallel, start playback after the initial batch, and keep updating the playlist while the remaining files finish.

No additional build steps are required; the script is ready to use as soon as Lampa loads it.
