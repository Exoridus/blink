# Bundled demo music

The start page offers seven bundled CC0 recordings, grouped into electronic music, piano, downtempo and chiptune. Selecting a recording uses the existing URL audio source. Playback starts after an effect card is clicked; a remembered custom URL takes priority over the default recording. No upload, microphone permission or external audio service is needed.

| Recording                              | Artist         | Category   |
| -------------------------------------- | -------------- | ---------- |
| Super Action Chiptunes - Stage 6       | Juhani Junkala | Electronic |
| Friendly Talk on a Robotic Battlefield | illin          | Electronic |
| The 9th Circle                         | Joth           | Electronic |
| JRPG2 Piano                            | Joth           | Piano      |
| Mandatory Overtime                     | Joth           | Downtempo  |
| Chiptune Adventures - Stage 1          | Juhani Junkala | Chiptune   |
| Chiptune Adventures - Stage 2          | Juhani Junkala | Chiptune   |

The Ogg Vorbis and MP3 recordings are unchanged source downloads with simplified filenames. Their combined payload is 13,164,259 bytes (13.16 MB). Audio is loaded on demand for playback, without autoplay on page load. The existing upload and URL inputs remain available.

`public/audio/demo/manifest.json` is the shared UI and packaging inventory. It records original filenames, source and download URLs, retrieval date, license, byte counts, recording SHA-256 hashes and archive hashes where applicable. `public/audio/demo/SOURCES.md` lists the source pages. `SOURCE-INFO.txt` preserves the original notice for the two Chiptune Adventures tracks; `LICENSE-CC0.txt` contains the official CC0 legal text. Recording terms remain separate from the application license.

The selected 12 Music Loops recording is preview index 1 (the second preview), archive member `215 [Super Action Chiptunes] bgm_stage_6.ogg`. Preview order differs from sorted ZIP member order. Menu Music is withheld because its author describes using Apple/GarageBand loops and redistribution rights need clarification despite the page's CC0 label.

The public build copies only declared recordings and provenance files, checking CC0 labels, contained paths and checksums. Tests check catalog consistency and grouped selection. The browser lane exercises all seven recordings through the production loading path without overriding autoplay policy, checking both local and Pages base paths, advancing playback, pause/resume, loop wraparound, source replacement, effect switching and nonzero native audio uniforms.

Transport operations in this smoke test use the active HTMLMediaElement directly; they do not represent additional playback controls in the user interface. GPU checks use software WebGL2 and do not certify all hardware or browsers. These are documented CC0 dedications, not a general assertion that any music described as copyright free can be redistributed.
