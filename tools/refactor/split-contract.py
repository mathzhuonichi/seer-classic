"""Splits src/kernel/contract.ts: display view types move to src/shared/views.ts, the kernel keeps
the snapshot, action, controller and dispatch-result contract. Rewrites every importer.
Usage: python3 tools/refactor/split-contract.py <repo>"""
import os, re, sys, subprocess

repo = sys.argv[1]
os.chdir(repo)
KEEP = {'GameSnapshot', 'GameAction', 'GameController', 'DispatchResult'}
RAISING = {'StatKey': 'StatKey', 'Stats': 'StatBlock'}
contract = open('src/kernel/contract.ts').read().split('\n')
start = next(i for i, l in enumerate(contract) if l.startswith('export interface GameSnapshot'))
views = [l for l in contract[:start] if not re.match(r'export type (StatKey|Stats) ', l)]
views = [re.sub(r'\bStats\b', 'StatBlock', l) for l in views]
moved = set(re.findall(r'^export (?:interface|type) (\w+)', '\n'.join(contract[:start]), re.M)) - set(RAISING)

header = ["// Display view types shared by the kernel snapshot, the features and their UI.",
          "import type { StatBlock, StatKey } from '../../raising/core/types.ts';",
          ""]
open('src/shared/views.ts', 'w').write('\n'.join(header + views).rstrip() + '\n')

rest = '\n'.join(contract[start:])
used = sorted(n for n in moved if re.search(r'\b%s\b' % n, rest))
rest = re.sub(r'\bStats\b', 'StatBlock', rest)
kernel = ["// The UI-facing contract: the snapshot the components render, the actions they dispatch, and the controller.",
          "import type { StatBlock, StatKey } from '../../raising/core/types.ts';",
          "import type { %s } from '../shared/views.ts';" % ', '.join(used), "",
          rest.rstrip(), "",
          "/** What a dispatch did: `notice` is the message the action added, if any. */",
          "export type DispatchResult = { ok: true; notice?: string } | { ok: false; notice: string };", ""]
open('src/kernel/contract.ts', 'w').write('\n'.join(kernel))

files = subprocess.run(['git', 'ls-files', 'src', 'tools'], capture_output=True, text=True).stdout.split()
pat = re.compile(r"import type \{([^}]*)\} from '((?:\.\.?/)+(?:src/)?kernel/contract\.ts)';")
def rel(frm, target):
    r = os.path.relpath(target, os.path.dirname(frm))
    return r if r.startswith('.') else './' + r
for f in files:
    if not f.endswith(('.ts', '.tsx', '.mjs')) or f in ('src/kernel/contract.ts', 'src/shared/views.ts'):
        continue
    text = open(f).read()
    def fix(m):
        names = [n.strip() for n in m.group(1).split(',') if n.strip()]
        keep = [n for n in names if n in KEEP]
        stats = [n for n in names if n in RAISING]
        allow = []
        view = [n for n in names if n not in KEEP and n not in RAISING]
        out = []
        if keep: out.append("import type { %s } from '%s';" % (', '.join(keep), m.group(2)))
        if view: out.append("import type { %s } from '%s';" % (', '.join(view), rel(f, 'src/shared/views.ts')))
        if stats: out.append("import type { %s } from '%s';" % (', '.join(n if n == RAISING[n] else '%s as %s' % (RAISING[n], n) for n in stats), rel(f, 'raising/core/types.ts')))
        if allow: out.append("import type { AcquisitionAllowance } from '%s';" % rel(f, 'src/domain/acquisition/acquisition-limits.ts'))
        return '\n'.join(out)
    new = pat.sub(fix, text)
    if new != text:
        open(f, 'w').write(new)
        print('rewrote', f)

# One AcquisitionAllowance: the display type in shared/views.ts.
limits = 'src/domain/acquisition/acquisition-limits.ts'
text = open(limits).read()
text = re.sub(r"export interface AcquisitionAllowance \{[^}]*\}\n", "", text)
text = "import type { AcquisitionAllowance } from '../../shared/views.ts';\n" + text
open(limits, 'w').write(text)
for f in files:
    if not f.endswith(('.ts', '.tsx')) or f == limits:
        continue
    t = open(f).read()
    n = re.sub(r"import type \{ ?AcquisitionAllowance ?\} from '[^']*acquisition-limits\.ts';", "import type { AcquisitionAllowance } from '%s';" % rel(f, 'src/shared/views.ts'), t)
    if n != t:
        open(f, 'w').write(n)
        print('allowance', f)
