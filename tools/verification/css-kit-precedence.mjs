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
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const postcss = createRequire(import.meta.resolve('vite'))('postcss');
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

/** Splits on `separator` outside parentheses, brackets and quotes. */
function splitTop(text, separator) {
  const parts = [];
  let depth = 0, quote = '', current = '';
  for (const char of text) {
    if (quote) quote = char === quote ? '' : quote;
    else if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (!depth && separator.test(char)) { parts.push(current); current = ''; continue; }
    current += char;
  }
  return [...parts, current].map(part => part.trim()).filter(Boolean);
}

/** Specificity [ids, classes, types] of one complex selector; :where() counts nothing, :is/:not/:has their largest argument. */
function specificity(selector) {
  const total = [0, 0, 0];
  const add = value => value.forEach((count, i) => { total[i] += count; });
  const pattern = /#[\w-]+|\.[\w-]+|\[[^\]]*\]|::?[\w-]+(?:\((?:[^()]|\([^()]*\))*\))?|[a-zA-Z][\w-]*|\*/g;
  for (const [token] of selector.matchAll(pattern)) {
    if (token[0] === '#') add([1, 0, 0]);
    else if (token[0] === '.' || token[0] === '[') add([0, 1, 0]);
    else if (token.startsWith('::')) add([0, 0, 1]);
    else if (token[0] === ':') {
      const [, name, argument] = token.match(/^:([\w-]+)(?:\((.*)\))?$/);
      if (name === 'where') continue;
      if (['is', 'not', 'has'].includes(name)) add(splitTop(argument, /,/).map(specificity).sort(compare).at(-1) ?? [0, 0, 0]);
      else add(['before', 'after'].includes(name) ? [0, 0, 1] : [0, 1, 0]);
    } else if (token !== '*') add([0, 0, 1]);
  }
  return total;
}
const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Every style rule of a stylesheet, one entry per selector, with its longhand declarations. */
function rulesOf(file) {
  const rules = [];
  postcss.parse(fs.readFileSync(path.join(root, file), 'utf8')).walkRules(rule => {
    if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
    const declarations = new Map();
    rule.each(node => {
      if (node.type !== 'decl') return;
      for (const longhand of LONGHANDS[node.prop] ?? [node.prop]) declarations.set(longhand, {value: node.value, important: node.important});
    });
    for (const selector of splitTop(rule.selector, /,/)) {
      rules.push({file, line: rule.source.start.line, selector: selector.replace(/\s+/g, ' '), specificity: specificity(selector), declarations});
    }
  });
  return rules;
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
const hasPseudoElement = selector => /::|:(before|after)\b/.test(selector);

const kit = rulesOf(KIT_FILE).filter(rule => KIT_SELECTOR.test(rule.selector));
const hosted = kitHostedStylesheets();
const failures = [];
for (const rule of hosted.flatMap(rulesOf)) {
  if (hasPseudoElement(rule.selector)) continue;
  const type = controlType(rule.selector);
  for (const base of kit) {
    if (compare(rule.specificity, base.specificity) || type && type !== controlType(base.selector)) continue;
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
