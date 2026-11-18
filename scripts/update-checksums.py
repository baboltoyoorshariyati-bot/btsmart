#!/usr/bin/env python3
"""Rebuild or verify the source manifest, including new non-ignored files."""
import argparse
import hashlib
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true', help='fail without changing files')
args = parser.parse_args()
names = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=root).decode().split('\0')
files = sorted({name for name in names if name and name != 'SHA256SUMS.txt' and (root / name).is_file()})
text = ''.join(f'{hashlib.sha256((root / name).read_bytes()).hexdigest()}  ./{name}\n' for name in files)
manifest = root / 'SHA256SUMS.txt'
if args.check:
    if not manifest.exists() or manifest.read_text() != text:
        raise SystemExit('Source manifest is stale. Run python3 scripts/update-checksums.py')
    print(f'Verified {len(files)} source files')
else:
    manifest.write_text(text)
    print(f'Updated {len(files)} source checksums')
