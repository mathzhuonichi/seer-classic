# Art

This repository holds the source, the data and the documentation. It holds no art: images, audio, fonts, animation atlases and
skill-effect SWFs are ignored by `.gitignore` and were filtered out of the whole history.

A playable workspace is two parts:

- **The source**, from the private GitHub repository `mathzhuonichi/seer-classic`. It keeps changing.
- **The art pack**: 15,714 files (2.77 GiB) under `public/`, frozen at the 0.0.1 release. It does not change. Each file is
  listed with its size and SHA-256 in [`tools/distribution/art-pack.json`](tools/distribution/art-pack.json).

Players keep the art pack they already have and only take new source. Every change to the source has to work with that pack.

## Connect the art to a checkout

You need Node.js 22.18 or newer and npm.

1. Get the source and its dependencies:

   ```sh
   git clone https://github.com/mathzhuonichi/seer-classic.git
   cd seer-classic
   npm ci
   ```

2. Find a folder that holds the art at the same paths as `public/`. Either of these works:
   - the `game/` folder of an unzipped browser package, for example `SeerClassic-0.0.1/game` from
     `SeerClassic-0.0.1-browser.zip`;
   - the `public/` folder of another complete workspace.

3. Install the pack from that folder and check it:

   ```sh
   node tools/distribution/art-pack.mjs install --from <folder>
   node tools/distribution/art-pack.mjs check
   ```

   - `install` copies only the files listed in the pack and checks each one's size and SHA-256 first. On macOS the copies are
     APFS clones, so they take no extra disk space. It never writes a file that Git tracks.
   - A file the source folder lacks or holds with different contents is not copied, and the command names it.
   - `check` takes a few seconds. When everything is in place it prints
     `art pack 0.0.1: 15714 files, 2.77 GiB, all present and unchanged in public/`.
   - Either command exits non-zero when `public/` is incomplete. Extract the package again and repeat.

4. Play:

   ```sh
   node tools/dev/play.mjs          # or: npm run dev -- --port 1426
   ```

   `play.mjs` serves the game at http://127.0.0.1:1426/ and opens the browser. Saves live in the browser under that address,
   which is the same address the browser package uses, so a player's existing save carries over.

To update later, run `git pull`, then `npm ci` if `package-lock.json` changed. The art stays where it is because Git ignores
it. Run `check` whenever you are unsure.

## Rules for agents that change the source

1. **Never commit art.** Do not override the ignore rules with `git add -f`. The files Git tracks under `public/` are manifests
   and data (JSON, README).
2. **Never add, replace, rename or delete a file of the pack.** Never make the game request a `public/` path that is in neither
   the pack nor Git. A player's `public/` holds exactly the pack.
3. **Build new visuals from what exists.** That means the pack's files, CSS, or SVG and markup written in the source code
   itself. Do not use new asset files.
4. **Ask the user before any new or changed art.** It means a new art pack version, and every player would have to download
   it again. Stop and ask instead of working around this rule.
5. **The release gate enforces rules 2 and 4.** `tools/verification/payload.mjs`, which `npm run package` runs, fails when:
   - the payload's untracked files differ from `art-pack.json`, or
   - the build can request a path that is not in the payload.

   To run the gate without packaging (staging uses APFS clones on macOS):

   ```sh
   mkdir -p .cache/art-check && echo > .cache/art-check/notices.txt
   node --input-type=module -e "import {build} from 'vite'; await build({configLoader: 'native', logLevel: 'warn',
     build: {outDir: '.cache/art-check/build', emptyOutDir: true, copyPublicDir: false, sourcemap: false}})"
   python3 tools/distribution/stage_payload.py --out .cache/art-check/payload --notices .cache/art-check/notices.txt
   node tools/verification/payload.mjs --dist .cache/art-check/build --payload .cache/art-check/payload/public
   ```

## A new art version (only when the user decides)

1. Change the art in `public/` and keep its manifests in step.
2. Stage the payload as above, then rewrite the pack list from it:

   ```sh
   node tools/distribution/art-pack.mjs lock --payload .cache/art-check/payload/public/payload.json
   ```

   The pack takes the version in `package.json`.
3. Commit `art-pack.json`, update the numbers in this file, and package. Players then install the new pack from the new
   package's `game/` folder.

## Not in the pack

The maintainer's workspace also holds art that the game does not ship:

- the originals and superseded files listed in `tools/distribution/payload-exclusions.json`;
- the research inputs and HD-generation caches in `.cache/`;
- the research data in `../analysis`.

Only the art-generation tools in `tools/assets/` need these. Playing, development and the `needs-assets` and `needs-browser`
verification suites need only the pack.
