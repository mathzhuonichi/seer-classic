import type { MonsterView } from '../../../../shared/views.ts';

/** The colored ♂ / ♀ beside a monster's level; genderless monsters show none. */
export default function GenderMark({m}:{m:MonsterView}) {
  if(!m.gender)return null;
  const [gender,label,symbol]=m.gender===1?['male','雄性','♂']:['female','雌性','♀'];
  return <span className={`petbag-gender ${gender}`} role="img" aria-label={label} title={label}>{symbol}</span>;
}
