// Snapshot views of owned monsters, their skills and their engravings.
import { activeBeads, computeStats, evolutionOptions, expToNext, type Boost, type Monster } from '../../../raising/core/index.ts';
import type { GameSave } from '../../kernel/api.ts';
import { activeEngravings, engravingById, engravingStatBonus, type EngravingDefinition } from '../../domain/engravings/engravings.ts';
import { traits } from '../../domain/traits.ts';
import { getBreedingGender } from '../../domain/recipes/breeding.ts';
import { appearanceSpecies } from '../../domain/acquisition/skins.ts';
import type { BoostView, EvolutionChoiceView, MonsterEngravingsView, MonsterView, TraitView } from '../../shared/views.ts';
import { capacityReason } from '../../kernel/acquire.ts';
import type { GameContext } from '../../kernel/api.ts';
import {engravingHolder, engravingLedger, engravingView, equippedEngravings, type EngravingLedger} from '../engravings/index.ts';
import { natureView, portrait, skillView, typeLabel } from '../../shared/view-common.ts';

/** The row fields that the rest of the save decides; every other field follows from the monster's own record. */
const SAVE_FIELDS = ['trait', 'engravings', 'inParty', 'evolutionChoices', 'boosts'] as const;
type SaveFields = Pick<MonsterView, (typeof SAVE_FIELDS)[number]>;

/** What every row of one snapshot shares: the party, each species' stored copies, the engravings' holders and the player-wide boosts. */
interface SaveIndex {
  party: ReadonlySet<string>; copies: ReadonlyMap<number, Monster[]>; ledger: EngravingLedger; boosts: BoostView[]; boostView(boost: Boost): BoostView;
}

/** Deep equality of JSON data, such as two copies of a monster record. */
function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>, keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameData(left[key], right[key]));
}

function monsterEngravings(ctx: GameContext, save: GameSave, mon: Monster, ledger: EngravingLedger): MonsterEngravingsView {
  const ids = equippedEngravings(save, mon.uid);
  const pick = (slot: EngravingDefinition['slot']) => {
    const def = ids.map(engravingById).find(entry => entry?.slot === slot);
    return def ? engravingView(ctx, save, def, mon, ledger) : null;
  };
  return { ability: pick('ability'), skill: pick('skill'), bonus: engravingStatBonus(activeEngravings(ids, engravingHolder(mon))) };
}

/** The six-copy capacity counts only the target species' stored copies, so each row reads those instead of the whole storage. */
function evolutionChoices(ctx: GameContext, save: GameSave, index: SaveIndex, mon: Monster): EvolutionChoiceView[] {
  return ctx.dex.species(mon.species).evolution.filter(edge => edge.method === 'level' && edge.level !== undefined).map(edge => {
    const level = edge.level!, copies = { ...save, storage: index.copies.get(edge.to) ?? [] };
    const blockedReason = mon.level < level ? `达到 Lv.${level} 后可进化。` : capacityReason(ctx, copies, edge.to, mon.uid);
    return { species: edge.to, name: ctx.speciesName(edge.to), level, blockedReason };
  });
}

/** Every trait's view, one object per trait, so a row keeps its trait while the trait is unchanged. */
export const TRAIT_VIEWS: ReadonlyMap<string, TraitView> = new Map(traits.map(({ id, name, description }) => [id, { id, name, description }]));

/** The trait, engravings, party place, evolution capacity and boosts (the player-wide ones and this monster's energy bead). */
function saveFields(ctx: GameContext, save: GameSave, index: SaveIndex, mon: Monster): SaveFields {
  return {
    trait: TRAIT_VIEWS.get(save.game.traits[mon.uid]) ?? null, engravings: monsterEngravings(ctx, save, mon, index.ledger), inParty: index.party.has(mon.uid),
    evolutionChoices: evolutionChoices(ctx, save, index, mon), boosts: [...index.boosts, ...activeBeads(save, mon.uid).map(index.boostView)],
  };
}

function recordView(ctx: GameContext, mon: Monster): Omit<MonsterView, keyof SaveFields> {
  const { dex, data } = ctx, sp = dex.species(mon.species), appearance = appearanceSpecies(mon, ctx.skinOptions), evolutions = evolutionOptions(mon, dex);
  return {
    uid: mon.uid, species: sp.id, appearanceSpecies: appearance,
    skinOptions: (ctx.skinOptions.get(sp.id) ?? [sp.id]).map(species => ({ species, name: ctx.speciesName(species) })),
    name: mon.nickname || sp.name.zh, speciesName: sp.name.zh, level: mon.level, exp: mon.exp, expToNext: expToNext(sp.growth, mon.level),
    iv: mon.iv, nature: natureView(dex.nature(mon.nature)), types: sp.types.map(typeLabel), baseStats: { ...sp.base },
    stats: computeStats(mon, dex), evs: mon.evs, hp: mon.hp,
    skills: mon.skills.map(id => skillView(data, id, mon.pp)), learned: mon.learned.map(id => skillView(data, id, mon.pp)),
    portrait: portrait(appearance), evolution: evolutions.length ? evolutions.map(id => ctx.speciesName(id)).join(' / ') : null,
    gender: getBreedingGender(sp.id), generation: mon.generation ?? 0, favorite: mon.favorite === true,
  };
}

/**
 * The monster rows, built once per game. A row keeps its identity until its record or one of its save fields changes, so an
 * action rebuilds only the rows it affects. Stored records are replaced, never changed in place, and raising operations keep
 * the records they do not change; a record that is not identical (a loaded save, an equal replacement) is compared by value. The save fields
 * are rebuilt on every snapshot and compared with the row's: they read other monsters too (an engraving's holders) and save-wide
 * counts (the six-copy capacity of an evolution).
 */
export function monsterRows(ctx: GameContext): (save: GameSave) => MonsterView[] {
  const itemNames = new Map(ctx.catalog.items.map(item => [String(item.id), (item.name as { zh?: string } | undefined)?.zh]));
  const boostView = (boost: Boost): BoostView => ({ name: itemNames.get(boost.item) ?? boost.item, battlesLeft: boost.battles_left });
  let rows = new Map<string, { mon: Monster; view: MonsterView }>();
  return save => {
    const next = new Map<string, { mon: Monster; view: MonsterView }>(), copies = new Map<number, Monster[]>();
    for (const mon of save.storage) copies.set(mon.species, [...copies.get(mon.species) ?? [], mon]);
    const index: SaveIndex = {
      party: new Set(save.party), copies, ledger: engravingLedger(ctx, save), boostView,
      boosts: (save.boosts ?? []).filter(boost => boost.kind !== 'energy_bead').map(boostView),
    };
    const views = save.storage.map(mon => {
      const old = rows.get(mon.uid), fields = saveFields(ctx, save, index, mon), record = !!old && (old.mon === mon || sameData(old.mon, mon));
      const view = record && SAVE_FIELDS.every(key => sameData(old.view[key], fields[key])) ? old.view
        : { ...(record ? old.view : recordView(ctx, mon)), ...fields };
      next.set(mon.uid, { mon, view });
      return view;
    });
    rows = next;
    return views;
  };
}
