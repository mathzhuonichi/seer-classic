"""Moves each feature's UI exports from index.ts into ui.ts and repoints importers.
Usage: python3 tools/refactor/split-feature-ui.py <repo>"""
import os, re, sys, glob
os.chdir(sys.argv[1])
ui_names = {}
for index in glob.glob('src/features/*/index.ts'):
    feature = index.split('/')[2]
    lines = open(index).read().split('\n')
    ui = [l for l in lines if "from './ui/" in l]
    if not ui:
        continue
    rest = [l for l in lines if "from './ui/" not in l]
    open(index, 'w').write('\n'.join(rest))
    open(f'src/features/{feature}/ui.ts', 'w').write(
        f"// The screens of features/{feature}: what the app and other features' UI may render.\n" + '\n'.join(ui) + '\n')
    ui_names[feature] = {n.strip().split(' as ')[-1] for l in ui for n in re.search(r'\{([^}]*)\}', l).group(1).split(',')}
pat = re.compile(r"import (type )?\{([^}]*)\} from '((?:\.\.?/)+(?:features/)?(\w+)/index\.ts)';")
for f in glob.glob('src/**/*.ts*', recursive=True):
    text = open(f).read()
    def fix(m):
        feature = m.group(4)
        if feature not in ui_names or '/features/' not in os.path.normpath(os.path.join(os.path.dirname(f), m.group(3))).replace(os.sep, '/') :
            return m.group(0)
        names = [n.strip() for n in m.group(2).split(',') if n.strip()]
        ui = [n for n in names if n.split(' as ')[0].replace('type ', '') in ui_names[feature]]
        head = [n for n in names if n not in ui]
        out = []
        if head: out.append("import %s{%s} from '%s';" % (m.group(1) or '', ', '.join(head), m.group(3)))
        if ui: out.append("import %s{%s} from '%s';" % (m.group(1) or '', ', '.join(ui), m.group(3).replace('/index.ts', '/ui.ts')))
        return '\n'.join(out)
    new = pat.sub(fix, text)
    if new != text:
        open(f, 'w').write(new)
        print('rewrote', f)
