// Boss rules, phases, objectives and the battle outcome (RULES.md section 10).

import type { BattleResult, BossEncounter, BossRule, EncounterVariant, Objective, Phase, SideInput, Skill } from '../types.ts';
import type { Battle } from './battle.ts';
import { emptyCtx, type DamageInfo, type Mon, type Side } from './state.ts';
import { hasAttackType, typeIdentity } from '../typechart.ts';
import { DOT_STATUSES } from '../builtin-conditions.ts';

// Catalog boss `script` rules that are native engine rules under another name.
const RULE_ALIASES: Record<string, string> = {
  immune_pct_damage: 'immune_percent_damage',
  infinite_pp: 'unlimited_pp',
  reflect_damage: 'reflect_damage',
};

/** Fields consumed by native rules; the catalog audit checks every occurrence. */
export const NATIVE_BOSS_RULE_FIELDS:Record<string,readonly string[]> = {
  lives:['count'], no_switch:[], no_items:[], no_capture:[], no_struggle:[], unlimited_pp:[],
  ignore_type_chart:[], immune_crit:[], immune_ohko:[], immune_fixed_damage:[], immune_percent_damage:[],
  immune_status:[], immune_status_list:['statuses'], immune_stage_down:[], immune_force_switch:[],
  block_heal:[], clear_debuffs_each_turn:[], strip_player_boosts_each_turn:[], no_repeat_type:[],
  damage_cap_per_hit:['amount','categories'], hp_floor_until:['skill','skills'], reflect_damage:['pct','min_damage'],
  heal_full_below:['hp','pct','times'], heal_each_turn:['amount','pct_max_hp'],
  require_statuses:['count'], invulnerable_turns:['turns'],
  damage_only_from:['types','skills','categories','allow_categories','crit','super_effective','sure_hit','kinds'],
  type_rotation:['order'],
  flee_after_skill:['skill','skills','count'], ohko_below_pct:['pct'], always_crit_below_pct:['pct'], forced_execution_below_pct:['pct'],
  player_level_cap:['level'], player_team_size:['min','max','min_level'],
};

/** Statuses whose damage knockout a `revive_unless_status_ko` boss does not survive. */
const STATUS_KO_STATUSES = ['poison', 'burn', 'freeze'];

// ---------- rule lookup ----------

/** Member rules take precedence. Scan the live arrays without allocating a merged list. */
export function findRule(side: Side, mon: Mon, predicate: (rule: BossRule) => boolean): BossRule | undefined {
  const matches = (rule: BossRule) => ruleMatchesMember(rule, mon.slot) && predicate(rule);
  return mon.rules.find(matches) ?? side.rules.find(matches);
}

export function hasRule(side: Side, rule: string, mon?: Mon): boolean {
  const member = mon ?? side.team[side.active];
  return !!findRule(side, member, r => r.rule === rule);
}

export function ruleMatchesMember(rule: BossRule, slot: number): boolean {
  const member = rule.member ?? (rule.rule === 'script' ? rule.params?.member : undefined);
  return member === undefined || member === slot;
}

/** The side consulted for side-level rules; a rule-less view of the side probeDamage treats as unknown. */
export function ruleSide(b: Battle, index: 0 | 1): Side {
  const side = b.sides[index];
  if (!b.probing || b.probeUnknownRules !== index) return side;
  return Object.create(side, { rules: { value: [] } }) as Side;
}

export function encounterVariant(encounter: BossEncounter, id: string): EncounterVariant {
  const variant = (encounter.variants ?? []).find((x) => x.id === id);
  if (!variant) throw new Error(`unknown variant ${id}`);
  return variant;
}

/** Boss rules written as `{ rule: 'script', id, params }`: aliases of native rules, or scripts with `install`. */
export function installRuleScripts(b: Battle): void {
  const install = (side: Side, rules: BossRule[], members: Mon[]) => {
    for (const r of [...rules]) {
      if (r.rule !== 'script') {
        const fields = NATIVE_BOSS_RULE_FIELDS[r.rule];
        if (!fields) b.warn(`unknown native boss rule ${r.rule}`);
        else for (const key of Object.keys(r)) if (!['rule','member',...fields].includes(key)) b.warn(`unsupported boss rule field ${r.rule}.${key}`);
        continue;
      }
      const alias = RULE_ALIASES[r.id];
      if (alias) { rules.push({ ...(r.params ?? {}), ...(r.member === undefined ? {} : {member:r.member}), rule: alias }); continue; }
      const entry = b.script(r.id)?.install;
      if (!entry) { b.warn(`unknown rule script ${r.id}`); continue; }
      for (const mon of members) if (ruleMatchesMember(r, mon.slot)) entry({ battle: b, mon, side }, r.params ?? {});
    }
  };
  for (const side of b.sides) {
    install(side, side.rules, side.team);
    for (const mon of side.team) {
      install(side, mon.rules, [mon]);
      const lives = mon.rules.find(r => r.rule === 'lives' && ruleMatchesMember(r, mon.slot));
      if (lives) mon.livesLeft = lives.count;
    }
  }
}

// ---------- damage rules ----------

/** The boss rule that blocks this damage to `target`, if any. */
export function ruleBlocks(b: Battle, side: Side, info: DamageInfo, target: Mon): string | null {
  const types = b.data.types;
  const has = (r: string) => hasRule(side, r, target);
  if (info.kind === 'true' && !info.ohko) return null;
  const fromFoe = !!info.source && info.source.side !== side.index;
  if (fromFoe && info.kind === 'attack' && has('no_repeat_type') && info.skill && side.lastHitType === typeIdentity(types, info.skill.type)) {
    return 'no_repeat_type';
  }
  const req = findRule(side, target, (r) => r.rule === 'require_statuses');
  if (req && target.conditions.filter((c) => c.def.kind === 'status').length < req.count) return 'require_statuses';
  if (info.ohko && has('immune_ohko')) return 'immune_ohko';
  if (info.kind === 'fixed' && has('immune_fixed_damage')) return 'immune_fixed_damage';
  if (info.kind === 'percent' && has('immune_percent_damage')) return 'immune_percent_damage';
  const inv = findRule(side, target, (r) => r.rule === 'invulnerable_turns');
  if (inv && b.turn <= inv.turns) return 'invulnerable_turns';
  const only = findRule(side, target, (r) => r.rule === 'damage_only_from');
  if (only && info.source && info.source.side !== side.index) {
    if (info.status && (target.persist.allowedStatusDamage as string[] | undefined)?.includes(info.status)) return null;
    const sk = info.skill;
    const ok = (sk && only.allow_categories?.includes(sk.category)) ||
      (!only.types || (sk && only.types.some((type: string) => hasAttackType(types, sk.type, type)))) &&
      (!only.skills || (sk && only.skills.includes(sk.id))) &&
      (!only.categories || (sk && only.categories.includes(sk.category))) &&
      (!only.crit || info.crit) &&
      (!only.super_effective || (info.effectiveness ?? 1) > 1) &&
      (!only.sure_hit || (sk && sk.accuracy === null)) &&
      (!only.kinds || only.kinds.includes(info.kind));
    if (!ok) return 'damage_only_from';
  }
  const rotation = findRule(side, target, r => r.rule === 'type_rotation');
  if (rotation && fromFoe && info.skill) {
    const expected = rotation.order[(target.persist.typeRotationCursor ?? 0) % rotation.order.length];
    if (!hasAttackType(types, info.skill.type, expected)) return 'type_rotation';
  }
  return null;
}

/** `revive_unless_status_ko`: a knockout not dealt by a damaging status revives the boss. */
export function statusKoRevival(b: Battle, mon: Mon, info: DamageInfo): boolean {
  const revival = mon.persist.reviveUnlessStatusKo as {maxRevives:number; throughTurn?:number} | undefined;
  const revives = revival && !STATUS_KO_STATUSES.includes(info.status ?? '') &&
    (revival.throughTurn === undefined || b.turn <= revival.throughTurn) && (mon.persist.statusKoRevives ?? 0) < revival.maxRevives;
  if (!revives) return false;
  mon.persist.statusKoRevives = (mon.persist.statusKoRevives ?? 0) + 1;
  mon.hp = mon.maxHp;
  b.emit({type:'revive',side:mon.side,slot:mon.slot,name:mon.name,hp:mon.hp,maxHp:mon.maxHp,reason:'revive_unless_status_ko'});
  return true;
}

/** Dynamic execution policy adopted for Moshidilu in V57. */
export function forcedExecution(b: Battle, mon: Mon): boolean {
  const rule = findRule(b.sides[mon.side], mon, value => value.rule === 'forced_execution_below_pct');
  return !!rule && !mon.fainted && mon.hp > 0 && mon.hp * 100 < mon.maxHp * rule.pct;
}

/** Boss traits that switch on below an HP threshold (rule) or from a phase op. */
export function bossTrait(b: Battle, mon: Mon, trait: 'ohko_below_pct' | 'always_crit_below_pct'): boolean {
  if (mon.persist[trait]) return true;
  const r = findRule(ruleSide(b, mon.side), mon, (x) => x.rule === trait);
  return !!r && (mon.hp / mon.maxHp) * 100 < r.pct;
}

/** flee_after_skill: the boss leaves after using a skill N times (no reward). */
export function checkBossFlee(b: Battle, user: Mon, skill: Skill): void {
  if (user.side !== 1) return;
  const r = findRule(b.sides[1], user, (x) => x.rule === 'flee_after_skill' && (x.skill === skill.id || x.skills?.includes(skill.id)));
  if (!r || (user.skillUses[skill.id] ?? 0) < (r.count ?? 1)) return;
  b.emit({ type: 'boss_fled', side: 1, skill: skill.id });
  finish(b, null, 'boss_fled');
}

// ---------- phases ----------

/** Runs the encounter, variant and member phases whose condition holds. Returns true if any phase fired. */
export function checkPhases(b: Battle, mon: Mon, extra: { onFaint?: boolean } = {}): boolean {
  if (mon.side !== 1) return false;
  let fired = false;
  const run = (phases: Phase[], completed: Set<number>, member: boolean) => phases.forEach((ph: Phase, idx: number) => {
    if (ph.target !== undefined && ph.target !== mon.slot) return;
    const once = ph.once ?? true;
    if (once && completed.has(idx)) return;
    if (!!(ph.when as any).on_faint !== !!extra.onFaint) return;
    if (!b.evalWhen(ph.when, { self: mon, foe: b.foeOf(mon), onFaint: extra.onFaint })) return;
    completed.add(idx);
    fired = true;
    b.emit({ type: 'phase_triggered', side: 1, phase: idx, ...(member ? {slot: mon.slot} : {}) });
    b.runEffects(ph.do, mon, b.foeOf(mon), emptyCtx());
  });
  run(b.encounter?.phases ?? [], b.phasesFired, false);
  run(b.variant?.phases ?? [], b.variantPhasesFired, false);
  run(mon.phases, mon.phasesFired, true);
  return fired;
}

// ---------- objectives and outcome ----------

export function checkObjectivesAtTurnEnd(b: Battle): void {
  if (!b.encounter || b.result) return;
  for (const o of b.winList) {
    if (o.kind === 'survive_turns' && b.turn >= o.turns) return finish(b, 0, 'objective');
    if (o.kind === 'deal_damage' && b.damageBySide[0] >= o.amount) return finish(b, 0, 'objective');
    if (o.kind === 'exhaust_pp' && ppExhausted(b)) return finish(b, 0, 'objective');
  }
  for (const o of b.loseList) {
    if (o.kind === 'turn_limit' && b.turn >= o.turns) return finish(b, 1, 'lose_condition');
    if (o.kind === 'script' && scriptObjective(b, o)) return finish(b, 1, 'lose_condition');
  }
}

/** A `script` objective: its script's `objective`; never met while probing. */
function scriptObjective(b: Battle, o: Objective): boolean {
  if (b.probing) return false;
  const entry = b.script(o.id);
  if (!entry) { b.warn(`unknown script ${o.id}`); return false; }
  return !!entry.objective?.({ battle: b }, o.params);
}

function ppExhausted(b: Battle): boolean {
  return b.sides[1].team.every((m) => m.fainted || m.skills.every((id) => m.pp[id] <= 0));
}

export function objectiveMet(b: Battle, o: Objective): boolean {
  const ko = b.lastKo;
  const byPlayer = ko?.by?.side === 0;
  const allFainted = () => b.sides[1].team.every((m) => m.fainted);
  switch (o.kind) {
    case 'ko_all': return allFainted();
    case 'turn_limit': return b.turn <= o.turns;
    case 'finish_with_skill': return !!ko?.skill && ((o.skills ?? [o.skill]) as number[]).includes(ko.skill.id) && byPlayer;
    case 'finish_with_type':
      return !!ko?.skill && ((o.types ?? [o.type]) as string[]).some(type => hasAttackType(b.data.types, ko.skill!.type, type)) && byPlayer;
    case 'finish_with_crit': return !!ko?.crit && byPlayer;
    case 'use_skill':
    case 'used_skill': return b.sides[0].team.some(mon => (o.skills ?? [o.skill]).some((id: number) => mon.usedSkills.has(id)));
    case 'survive_turns': return b.turn >= o.turns && b.sides[0].team.some((m) => !m.fainted);
    case 'deal_damage': return b.damageBySide[0] >= o.amount;
    case 'ko_after_turn': return allFainted() && !!ko && ko.turn > o.turns;
    case 'exhaust_pp': return ppExhausted(b);
    case 'finish_with_status_damage': return !!ko?.status && ((o.statuses ?? DOT_STATUSES) as string[]).includes(ko.status);
    case 'script': return scriptObjective(b, o);
    default:
      b.warn(`unknown objective ${o.kind}`);
      return false;
  }
}

export function checkEnd(b: Battle): void {
  if (b.result) return;
  const alive = b.sides.map((s) => s.team.some((m) => !m.fainted));
  if (!alive[0] && !alive[1]) finish(b, 1, 'ko');   // simultaneous: the player loses
  else if (!alive[1]) finish(b, 0, 'ko');
  else if (!alive[0]) finish(b, 1, 'ko');
}

export function finish(b: Battle, winner: 0 | 1 | null, reason: BattleResult['reason']): void {
  if (b.result) return;
  const objectives = b.winList.map((o) => ({ kind: o.kind, met: winner === 0 && b.objectiveMet(o) }));
  const success = reason !== 'flee' && winner === 0 && objectives.every((o) => o.met);
  b.result = { winner, reason, success, objectives: b.encounter ? objectives : undefined, defeated: reason === 'flee' ? [] : b.defeated, turns: b.turn };
  if (b.capturedMon) b.result.captured = { species: b.capturedMon.species.id, level: b.capturedMon.level, hp: b.capturedMon.hp };
  b.phase = 'ended';
  for (const side of b.sides) { side.needsReplacement = false; side.pending = null; }
  b.emit({ type: 'battle_end', ...b.result });
}

/** Pre-battle checks for boss rules that limit the player's team. */
export function validateEncounter(encounter: BossEncounter, player: SideInput): string[] {
  const errors: string[] = [];
  for (const r of encounter.rules ?? []) {
    if (r.rule === 'player_level_cap') {
      for (const m of player.team) if (m.level > r.level) errors.push(`level ${m.level} exceeds cap ${r.level}`);
    }
    if (r.rule === 'player_team_size') {
      if (r.max !== undefined && player.team.length > r.max) errors.push(`team size ${player.team.length} exceeds ${r.max}`);
      if (r.min !== undefined && player.team.length < r.min) errors.push(`team size ${player.team.length} is below ${r.min}`);
      if (r.min_level !== undefined) for (const m of player.team) if (m.level < r.min_level) errors.push(`level ${m.level} is below ${r.min_level}`);
    }
    if (r.rule === 'script' && r.id === 'require_player_species') {
      const allowed = r.params?.species ?? [];
      for (const m of player.team) if (!allowed.includes(m.species)) errors.push(`species ${m.species} is not allowed; required ${allowed.join(',')}`);
    }
  }
  return errors;
}
