/**
 * Stylesheet parsing shared by the CSS checks: every style rule of the source stylesheets, one entry per selector, with its
 * specificity, pseudo-element, enclosing at-rules and declarations. Parsed with the postcss that Vite uses.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const postcss = createRequire(import.meta.resolve('vite'))('postcss');
const LEGACY_PSEUDO_ELEMENTS = ['before', 'after', 'first-line', 'first-letter'];

/** Splits on `separator` (a one-character pattern) outside parentheses, brackets and quotes. */
export function splitTop(text, separator) {
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

export const compareSpecificity = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Specificity [ids, classes, types] of one complex selector; :where() counts nothing, :is/:not/:has their largest argument. */
export function specificity(selector) {
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
      if (['is', 'not', 'has'].includes(name)) add(splitTop(argument, /,/).map(specificity).sort(compareSpecificity).at(-1) ?? [0, 0, 0]);
      else add(LEGACY_PSEUDO_ELEMENTS.includes(name) ? [0, 0, 1] : [0, 1, 0]);
    } else if (token !== '*') add([0, 0, 1]);
  }
  return total;
}

/** The selector's pseudo-element (`before`, `-webkit-scrollbar`, ...), or ''. */
export function pseudoElement(selector) {
  const [, name] = selector.match(/::([\w-]+)/) ?? selector.match(/:(before|after|first-line|first-letter)(?![\w-])/) ?? [];
  return name ?? '';
}

/** Every stylesheet under `dir`, relative to `root` with forward slashes. */
export function stylesheets(root, dir = 'src') {
  const walk = folder => fs.readdirSync(folder, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(folder, entry.name);
    return entry.isDirectory() ? walk(full) : entry.name.endsWith('.css') ? [full] : [];
  });
  return walk(path.join(root, dir)).map(file => path.relative(root, file).split(path.sep).join('/')).sort();
}

/**
 * Every style rule of `file` (relative to `root`), one entry per selector: its line, selector, specificity, pseudo-element,
 * enclosing at-rules (`context`, outermost first) and declarations as [property, value, important]. Keyframes are left out.
 */
export function styleRules(root, file) {
  const rules = [];
  postcss.parse(fs.readFileSync(path.join(root, file), 'utf8')).walkRules(rule => {
    const context = [];
    for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
      if (parent.type === 'atrule') context.unshift({name: parent.name, params: parent.params.replace(/\s+/g, ' ').trim()});
    }
    if (context.some(({name}) => name.endsWith('keyframes'))) return;
    const declarations = [];
    rule.each(node => { if (node.type === 'decl') declarations.push([node.prop, node.value.replace(/\s+/g, ' ').trim(), !!node.important]); });
    for (const selector of splitTop(rule.selector, /,/)) {
      const single = selector.replace(/\s+/g, ' ');
      rules.push({file, line: rule.source.start.line, selector: single, specificity: specificity(single), pseudo: pseudoElement(single),
        context, declarations});
    }
  });
  return rules;
}
