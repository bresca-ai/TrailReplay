#!/usr/bin/env node
/**
 * Pack a recipe, routes, and optional cover photos into a single `.replay` file.
 *
 * That is all this does. It resolves nothing: no kilometre-to-coordinate maths,
 * no ordering, no derived sets. TrailReplay does that when the file is opened,
 * using the distances its own parser already computed — which is the point.
 * When this script tried to resolve positions itself it had to reimplement the
 * app's distance accumulation, picked the wrong one of two functions with
 * different units, and produced cards timed seconds away from the places they
 * named. A packer cannot disagree with the app about anything.
 *
 * You do not need this script at all: dropping the recipe and the GPX files
 * together on trailreplay.com does the same thing. It exists so there is one
 * file to hand over instead of eleven.
 *
 * Usage:
 *   node make-replay.mjs <dir-with-recipe-and-routes> [-o out.replay]
 *   node make-replay.mjs recipe.json route.gpx [more.gpx or cover photos ...] [-o out.replay]
 *
 * Node built-ins only, so it runs from a clean checkout with no install step.
 * The format is documented at https://trailreplay.com/replay-file.md
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Minimal zip writer (deflate, no external dependency)
// ---------------------------------------------------------------------------

function zipEntry(name, contents, offset) {
  const nameBytes = Buffer.from(name, 'utf8');
  const deflated = deflateRawSync(contents, { level: 6 });
  // A file that deflates larger than it started is stored instead.
  const useDeflate = deflated.length < contents.length;
  const body = useDeflate ? deflated : contents;
  const method = useDeflate ? 8 : 0;
  const sum = crc32(contents);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(0, 10); // fixed mtime, so output is reproducible
  local.writeUInt32LE(sum, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(contents.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(0, 12);
  central.writeUInt32LE(sum, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(contents.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(offset, 42);

  return {
    local: Buffer.concat([local, nameBytes, body]),
    central: Buffer.concat([central, nameBytes]),
  };
}

function makeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const [name, contents] of Object.entries(files)) {
    const entry = zipEntry(name, Buffer.from(contents), offset);
    locals.push(entry.local);
    centrals.push(entry.central);
    offset += entry.local.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(locals.length, 8);
  end.writeUInt16LE(locals.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralDirectory, end]);
}

// ---------------------------------------------------------------------------

function expandPath(value, base) {
  const expanded = value.startsWith('~/') ? resolve(homedir(), value.slice(2)) : value;
  return resolve(base, expanded);
}

function slugify(value, fallback) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

const isRoute = (name) => /\.(gpx|kml)$/i.test(name);
const isCoverPhoto = (name) => /\.(jpe?g|png|webp|avif)$/i.test(name);

/** Split the inputs into one recipe and its routes, from a directory or a list. */
function collectInputs(paths) {
  if (paths.length === 1 && statSync(paths[0]).isDirectory()) {
    const dir = paths[0];
    paths = readdirSync(dir)
      .filter((name) => statSync(join(dir, name)).isFile())
      .map((name) => join(dir, name));
  }

  const recipes = paths.filter((path) => path.toLowerCase().endsWith('.json'));
  const routes = paths.filter((path) => isRoute(path));
  const coverPhotos = paths.filter((path) => isCoverPhoto(path));

  if (recipes.length === 0) throw new Error('No recipe: expected a .json file');
  if (recipes.length > 1) {
    throw new Error(`Expected one recipe, found ${recipes.length}: ${recipes.map(basename).join(', ')}`);
  }
  if (routes.length === 0) throw new Error('No .gpx or .kml routes to pack');

  return { recipe: recipes[0], routes, coverPhotos };
}

/**
 * The recipe names its routes by file name. Anything the app cannot find when
 * it opens the archive is a broken file, and it is much cheaper to say so here
 * than to let someone discover it after the handover.
 */
function checkRoutesAreNamed(recipe, routeNames) {
  const available = new Set(routeNames.map((name) => basename(name).toLowerCase()));
  const specs = Array.isArray(recipe.tracks) ? recipe.tracks : [];
  const missing = specs
    .map((spec) => spec?.file)
    .filter((file) => file && !available.has(basename(file).toLowerCase()));

  if (missing.length > 0) {
    throw new Error(
      `The recipe names routes that are not here: ${missing.join(', ')}\n`
      + `Packed routes: ${[...available].join(', ')}`,
    );
  }
}

function checkCoverPhotosAreNamed(recipe, photoPaths) {
  const names = photoPaths.map((path) => basename(path).toLowerCase());
  const selected = new Set();
  for (const slot of recipe.socialShareSettings?.photoSlots ?? []) {
    if (!slot.file) continue;
    const name = basename(slot.file).toLowerCase();
    const matches = names.filter((available) => available === name);
    if (matches.length !== 1) {
      throw new Error(`Cover photo "${slot.file}" must match exactly one supplied image file`);
    }
    selected.add(name);
  }
  return photoPaths.filter((path) => selected.has(basename(path).toLowerCase()));
}

function main() {
  const argv = process.argv.slice(2);
  const outFlag = argv.indexOf('-o');
  const inputs = argv.filter((arg, index) => (
    !arg.startsWith('-') && (outFlag === -1 || index !== outFlag + 1)
  ));

  if (inputs.length === 0) {
    console.error('Usage: node make-replay.mjs <dir | recipe.json route.gpx ...> [-o out.replay]');
    process.exit(1);
  }

  const { recipe: recipePath, routes, coverPhotos } = collectInputs(inputs.map((path) => resolve(path)));
  const recipeText = readFileSync(recipePath, 'utf8');

  let recipe;
  try {
    recipe = JSON.parse(recipeText);
  } catch (error) {
    throw new Error(`${basename(recipePath)} is not valid JSON: ${error.message}`);
  }

  checkRoutesAreNamed(recipe, routes);
  const namedCoverPhotos = checkCoverPhotosAreNamed(recipe, coverPhotos);

  const files = { 'recipe.json': recipeText };
  for (const route of routes) {
    files[`routes/${basename(route)}`] = readFileSync(route);
  }
  for (const photo of namedCoverPhotos) {
    files[`media/${basename(photo)}`] = readFileSync(photo);
  }

  const outPath = outFlag !== -1
    ? resolve(argv[outFlag + 1])
    : expandPath(
      recipe.output ?? `${slugify(recipe.name ?? 'project', 'project')}.replay`,
      dirname(recipePath),
    );

  writeFileSync(outPath, makeZip(files));

  console.log(`recipe  ${basename(recipePath)}`);
  for (const route of routes) console.log(`route   ${basename(route)}`);
  for (const photo of namedCoverPhotos) console.log(`cover   ${basename(photo)}`);
  console.log(`\nwrote ${outPath}`);
  console.log('TrailReplay resolves the recipe when this is opened, and reports what it placed.');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
