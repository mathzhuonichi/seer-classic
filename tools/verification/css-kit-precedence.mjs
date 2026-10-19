/**
 * CSS gate: feature styling must outrank the UI kit's form controls by specificity, never by bundle order.
 *
 * Vite orders the bundled stylesheets by the import graph, so a feature rule that only ties the kit's
 * `.management-panel button|input|select` rules (or their :hover, :focus-visible, :disabled and :active states)
 * wins or loses whenever an import moves. A stylesheet is kit-hosted when a component that imports it also imports
 * shared/ui/management.css or renders a `management-panel` itself; in a kit-hosted stylesheet, every rule that targets
 * the same control type with the kit rule's exact specificity and sets one of its properties to another value fails.
 *
 * Usage: node tools/verification/css-kit-precedence.mjs [checkout]   (default: this repository)
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compareSpecificity, splitTop, styleRules} from './_css.mjs';

const root = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const KIT_FILE = 'src/shared/ui/management.css';
const KIT_SELECTOR = /^(?:\.window-body )?\.management-panel (button|input|select)(?::[\w-]+(?:\([^)]*\))?)*$/;
const SIDES = ['top', 'right', 'bottom', 'left'];
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
const LONGHANDS = {
  padding: SIDES.map(side => `padding-${side}`),
  margin: SIDES.map(side => `margin-${side}`),
  border: SIDES.flatMap(side => ['width', 'style', 'color'].map(part => `border-${side}-${part}`)),
  'border-color': SIDES.map(side => `border-${side}-color`),
  'border-width': SIDES.map(side => `border-${side}-width`),
  'border-style': SIDES.map(side => `border-${side}-style`),
  'border-radius': CORNERS.map(corner => `border-${corner}-radius`),
  ...Object.fromEntries(SIDES.map(side => [`border-${side}`, ['width', 'style', 'color'].map(part => `border-${side}-${part}`)])),
  background: ['background-color', 'background-image', 'background-position', 'background-size', 'background-repeat'],
  font: ['font-family', 'font-size', 'font-style', 'font-weight', 'line-height'],
  outline: ['outline-color', 'outline-style', 'outline-width'],
  transition: ['transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay'],
};

const walk = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});
const rel = file => path.relative(root, file).split(path.sep).join('/');

/** Every style rule of a stylesheet, one entry per selector, with its declarations by longhand. */
function rulesOf(file) {
  return styleRules(root, file).map(rule => {
    const declarations = new Map();
    for (const [property, value, important] of rule.declarations) {
      for (const longhand of LONGHANDS[property] ?? [property]) declarations.set(longhand, {value, important});
    }
    return {...rule, declarations};
  });
}

/** Stylesheets imported by a component that also imports the kit or renders a management panel. */
function kitHostedStylesheets() {
  const hosted = new Set();
  for (const file of walk(path.join(root, 'src')).filter(name => name.endsWith('.tsx'))) {
    const source = fs.readFileSync(file, 'utf8');
    const sheets = [...source.matchAll(/^import '([^']+\.css)';/gm)].map(([, spec]) => rel(path.resolve(path.dirname(file), spec)));
    if (!sheets.includes(KIT_FILE) && !/className=[{"'`][^>]*\bmanagement-panel\b/.test(source)) continue;
    for (const sheet of sheets) if (sheet !== KIT_FILE) hosted.add(sheet);
  }
  return [...hosted].sort();
}

const lastCompound = selector => splitTop(selector, /[\s>+~]/).at(-1) ?? '';
const controlType = selector => lastCompound(selector).match(/^[a-z]+/)?.[0] ?? '';

const kit = rulesOf(KIT_FILE).filter(rule => KIT_SELECTOR.test(rule.selector));
const hosted = kitHostedStylesheets();
const failures = [];
for (const rule of hosted.flatMap(rulesOf)) {
  if (rule.pseudo) continue;
  const type = controlType(rule.selector);
  for (const base of kit) {
    if (compareSpecificity(rule.specificity, base.specificity) || type && type !== controlType(base.selector)) continue;
    const tied = [...rule.declarations].filter(([property, own]) => {
      const other = base.declarations.get(property);
      return other && other.important === own.important && other.value !== own.value;
    }).map(([property]) => property);
    if (!tied.length) continue;
    failures.push(`${rule.file}:${rule.line} \`${rule.selector}\` ties management.css:${base.line} \`${base.selector}\` (${rule.specificity})`
      + ` on ${tied.join(', ')}`);
  }
}
if (!kit.length || !hosted.length) failures.push(`found ${kit.length} kit control rules and ${hosted.length} kit-hosted stylesheets`);
console.log(`${kit.length} kit control rules, ${hosted.length} kit-hosted stylesheets: ${hosted.map(sheet => path.basename(sheet)).join(', ')}`);
if (failures.length) {
  console.error(`Rules that only win by bundle order (qualify them with their panel or an element):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('css-kit-precedence: no feature rule ties a kit control rule');
