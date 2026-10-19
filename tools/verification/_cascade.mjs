/**
 * Bundle-order audit for the browser suites. Vite orders the bundled stylesheets by the import graph, so when the
 * highest-precedence declarations of a property on a rendered element come from rules of equal specificity in two source
 * stylesheets and set different values, the element changes whenever an import moves. `orderDecided(page)` lists every
 * such property on the page, at rest and with the dynamic pseudo-classes of STATES assumed to hold. The rules come from the
 * source stylesheets (parsed in Node); the page matches them and expands their shorthands.
 */
import {root} from './_harness.mjs';
import {compareSpecificity, styleRules, stylesheets} from './_css.mjs';

/**
 * The dynamic pseudo-classes assumed to hold together, besides the rest state: hovered, pressed, keyboard-focused, and a
 * focused control under the pointer. An assumed pseudo-class is dropped from every selector; the others are matched as they are.
 */
const STATES = [[], ['hover'], ['hover', 'active'], ['focus', 'focus-visible', 'focus-within'], ['hover', 'focus', 'focus-visible', 'focus-within']];
const DYNAMIC = ['hover', 'active', 'focus-visible', 'focus-within', 'focus'];

let index = null;
/** The style rules of every stylesheet under src/, parsed once. */
const rulesOnce = () => (index ??= stylesheets(root).flatMap(file => styleRules(root, file)));

/** Runs in the page: each rule's declarations as [longhand, value, important], expanded and serialized by the engine. */
function expandDeclarations(rules) {
  const probe = document.createElement('div');
  const longhands = property => {
    probe.style.cssText = '';
    probe.style.setProperty(property, 'initial');
    return probe.style.length ? [...probe.style] : [property];
  };
  return rules.map(rule => rule.declarations.flatMap(([property, value, important]) => {
    const names = longhands(property);
    probe.style.cssText = '';
    probe.style.setProperty(property, value);
    // A var() leaves the longhands unknown until computed; the declaration's own text stands for them.
    return names.map(name => [name, probe.style.getPropertyValue(name) || `${property}:${value}`, important]);
  }));
}

/** Runs in the page: for each state, the rendered elements with the rules that match them and the longhands set inline. */
function matchRules({rules, states, dynamic}) {
  const hasDynamic = new RegExp(`:(?:${dynamic.join('|')})(?![\\w-])`);
  const stripped = (selector, names) => (names.length ? selector.replace(new RegExp(`:(?:${names.join('|')})(?![\\w-])`, 'g'), '') : selector)
    .replace(/::?(?:before|after|first-line|first-letter)(?![\w-])|::[\w-]+(?:\([^)]*\))?/g, '').trim() || '*';
  const container = (element, name) => {
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.containerType !== 'normal' && (!name || style.containerName.split(' ').includes(name))) return style;
    }
    return null;
  };
  /** The content-box size of a query container along `axis`. */
  const size = (style, axis) => parseFloat(style[axis]) - (style.boxSizing !== 'border-box' ? 0 : (axis === 'width' ? ['left', 'right'] : ['top', 'bottom'])
    .reduce((sum, side) => sum + parseFloat(style[`padding-${side}`]) + parseFloat(style[`border-${side}-width`]), 0));
  /** Evaluates (min|max)-(width|height) conditions joined by `or` or `and` against the element's query container. */
  const containerHolds = (params, element, pseudo) => {
    const [, name, condition] = params.match(/^([a-z][\w-]*)?\s*(.*)$/i);
    const style = container(pseudo ? element : element.parentElement, name);
    if (!style) return false;
    const tests = [...condition.matchAll(/\((min|max)-(width|height)\s*:\s*([\d.]+)px\)/g)]
      .map(([, bound, axis, limit]) => bound === 'max' ? size(style, axis) <= Number(limit) : size(style, axis) >= Number(limit));
    return /\band\b/.test(condition) ? tests.every(Boolean) : tests.some(Boolean);
  };
  const applies = (rule, element) => rule.context.every(({name, params}) => name === 'media' ? matchMedia(params).matches
    : name === 'supports' ? CSS.supports(params) : name !== 'container' || containerHolds(params, element, rule.pseudo));
  const label = element => {
    const parts = [];
    for (let node = element; node && node !== document.body && parts.length < 4; node = node.parentElement) {
      parts.unshift(node.tagName.toLowerCase() + [...node.classList].slice(0, 3).map(name => `.${name}`).join(''));
    }
    return parts.join('>');
  };
  const matching = selector => {
    try { return [...document.querySelectorAll(selector)].filter(element => element.getClientRects().length); } catch { return []; }
  };
  const atRest = rules.map(rule => matching(stripped(rule.selector, [])));
  return states.map(state => {
    const matched = new Map();
    rules.forEach((rule, i) => {
      for (const element of state.length && hasDynamic.test(rule.selector) ? matching(stripped(rule.selector, state)) : atRest[i]) {
        if (!applies(rule, element)) continue;
        if (!matched.has(element)) matched.set(element, []);
        matched.get(element).push(i);
      }
    });
    return [...matched].map(([element, rulesOf]) => ({label: label(element), inline: [...element.style], rules: rulesOf}));
  });
}

/** The order-decided properties of one element: per pseudo-element and longhand, the tied top rules of different files. */
function elementTies(rules, declarations, {rules: matched, inline}) {
  const candidates = new Map();
  for (const i of matched) {
    for (const [name, value, important] of declarations[i]) {
      const key = `${rules[i].pseudo}|${name}`;
      if (!candidates.has(key)) candidates.set(key, []);
      candidates.get(key).push({i, value, important});
    }
  }
  const ties = [];
  for (const [key, list] of candidates) {
    const [pseudo, name] = key.split('|'), important = list.some(entry => entry.important);
    if (!pseudo && !important && inline.includes(name)) continue;
    const pool = list.filter(entry => entry.important === important);
    const best = pool.map(entry => rules[entry.i].specificity).sort(compareSpecificity).at(-1);
    // Within one stylesheet the later rule wins; between stylesheets the bundle order decides.
    const perFile = new Map();
    for (const entry of pool.filter(entry => !compareSpecificity(rules[entry.i].specificity, best))) {
      const kept = perFile.get(rules[entry.i].file);
      if (!kept || rules[entry.i].line >= rules[kept.i].line) perFile.set(rules[entry.i].file, entry);
    }
    if (new Set([...perFile.values()].map(entry => entry.value)).size < 2) continue;
    const sources = [...perFile.values()].map(({i}) => `${rules[i].file}:${rules[i].line} ${rules[i].selector}`).sort();
    ties.push({property: pseudo ? `${name}::${pseudo}` : name, sources});
  }
  return ties;
}

/** The properties of rendered elements on `page` that the stylesheet bundle order decides, one entry per property and rule set. */
export async function orderDecided(page) {
  const rules = rulesOnce();
  const declarations = await page.evaluate(expandDeclarations, rules);
  const states = await page.evaluate(matchRules, {rules, states: STATES, dynamic: DYNAMIC});
  const found = new Map();
  states.forEach((elements, s) => {
    for (const element of elements) {
      for (const tie of elementTies(rules, declarations, element)) {
        const id = `${tie.property} ${tie.sources.join(' | ')}`;
        if (!found.has(id)) found.set(id, {...tie, element: element.label, state: STATES[s].join('+') || 'rest'});
      }
    }
  });
  return [...found.values()];
}
