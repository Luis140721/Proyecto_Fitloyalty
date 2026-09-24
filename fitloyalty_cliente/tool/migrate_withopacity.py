#!/usr/bin/env python3
"""withOpacity(X) -> withValues(alpha: X). Limpia los `info` de flutter analyze."""
import os
import re
import glob
import sys

# __file__ no es fiable cuando se ejecuta con cwd distinto. Resolvemos
#相对于脚本本身.
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', 'lib', 'cliente'))
PATTERN = re.compile(r'\.withOpacity\(\s*([^)]+?)\s*\)')

def migrate_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        src = f.read()
    matches = PATTERN.findall(src)
    if not matches:
        return 0
    new = PATTERN.sub(lambda m: f'.withValues(alpha: {m.group(1).strip()})', src)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new)
    return len(matches)

def main():
    if not os.path.exists(ROOT):
        print(f'ERROR: no existe {ROOT}', file=sys.stderr)
        sys.exit(1)
    total_files = 0
    total_repl = 0
    for path in glob.glob(os.path.join(ROOT, '**', '*.dart'), recursive=True):
        n = migrate_file(path)
        if n:
            total_files += 1
            total_repl += n
            print(f'  {os.path.relpath(path, ROOT)}: {n} reemplazo(s)')
    print(f'\nArchivos modificados: {total_files}')
    print(f'Total reemplazos: {total_repl}')

if __name__ == '__main__':
    main()
