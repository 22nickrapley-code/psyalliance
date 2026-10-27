#!/usr/bin/env python3
# Usage: parity-diff.py OUTDIR  -> writes diff/*.png (red = changed pixels) and diff/summary.csv
import sys, os, json, csv
import numpy as np
from PIL import Image, ImageChops
out = sys.argv[1]
man = json.load(open(os.path.join(out, 'manifest.json')))
os.makedirs(os.path.join(out, 'diff'), exist_ok=True)
rows = []
for m in man:
    name = f"{m['id']}__{m['vp']}.png"
    a = Image.open(os.path.join(out, 'ref', name)).convert('RGB')
    b = Image.open(os.path.join(out, 'target', name)).convert('RGB')
    same_size = a.size == b.size
    w, h = max(a.width, b.width), max(a.height, b.height)
    ca = Image.new('RGB', (w, h), (255, 0, 255)); ca.paste(a, (0, 0))
    cb = Image.new('RGB', (w, h), (255, 0, 255)); cb.paste(b, (0, 0))
    d = np.asarray(ImageChops.difference(ca, cb)).sum(axis=2)
    changed = int((d > 24).sum())
    pct = 100.0 * changed / (w * h)
    if changed:
        mask = (d > 24)
        base = np.asarray(ca).copy()
        base[mask] = [255, 0, 0]
        Image.fromarray(base).save(os.path.join(out, 'diff', name))
    rows.append([m['id'], m['area'], m['vp'], f"{a.width}x{a.height}", f"{b.width}x{b.height}", 'yes' if same_size else 'NO', changed, f"{pct:.4f}"])
with open(os.path.join(out, 'diff', 'summary.csv'), 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['scenario', 'ledger', 'viewport', 'ref_size', 'target_size', 'same_size', 'changed_px', 'changed_pct']); w.writerows(rows)
bad = [r for r in rows if r[5] == 'NO' or r[6] > 0]
print(f"{len(rows)} pairs, {len(bad)} with differences")
for r in bad[:40]: print(r)
