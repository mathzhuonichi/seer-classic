#!/usr/bin/env python3
"""Write data/original-fight-timing.json: the species whose attack the original fight module timed by its label table.

PetFightDLL_201308 (https://seer.61.com/dll/PetFightDLL_201308.swf, the current fight line) embeds PetLabelXMLInfo as binary
data 2102 (com.robot.petFightModule_201308.data.PetLabelXMLInfo_xmlClass): one `<list id="<pet id>">` per species, with the
frames of its attack, sa and cp clips. For a listed species the fight module drives the attacker's clip by that table and
starts the skill effect in the same stage frame as the clip's hit frame; for every other species the clip's own frame script
sets `hit`, which the module sees on the next ENTER_FRAME, so the effect starts one stage frame later. The battle's skill-effect
timing reads the list (src/features/battle/skill-effect-session.ts).

The input is that binary data as FFDec exports it (`ffdec-cli -export binaryData <dir> <decoded DLL>`); its hash is recorded.
"""
from pathlib import Path
import argparse
import hashlib
import json
import xml.etree.ElementTree as ElementTree

ROOT = Path(__file__).resolve().parents[2]
SOURCE = 'https://seer.61.com/dll/PetFightDLL_201308.swf'
BINARY_DATA = '2102 com.robot.petFightModule_201308.data.PetLabelXMLInfo_xmlClass'
# Species ids per line of the written list.
ROW = 20


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--labels', type=Path, default=ROOT / '.cache/original-fight/PetLabelXMLInfo.xml',
                        help='binary data 2102 of PetFightDLL_201308, exported by FFDec')
    parser.add_argument('--out', type=Path, default=ROOT / 'data/original-fight-timing.json')
    args = parser.parse_args()
    data = args.labels.read_bytes()
    species = sorted({int(entry.get('id')) for entry in ElementTree.fromstring(data).iter('list')})
    if not species:
        raise SystemExit(f'{args.labels}: no <list id> entries')
    record = {
        'schemaVersion': 1,
        'source': SOURCE,
        'binaryData': BINARY_DATA,
        'sha256': hashlib.sha256(data).hexdigest(),
        'note': "PetLabelXMLInfo's species: the effect starts with the attacker clip's hit frame; others' one stage frame later.",
        'species': species,
    }
    head = json.dumps({key: value for key, value in record.items() if key != 'species'}, ensure_ascii=False, indent=2)[:-2]
    rows = ',\n'.join('    ' + ', '.join(map(str, species[at:at + ROW])) for at in range(0, len(species), ROW))
    args.out.write_text(f'{head},\n  "species": [\n{rows}\n  ]\n}}\n')
    print(args.out, len(species))


if __name__ == '__main__':
    main()
