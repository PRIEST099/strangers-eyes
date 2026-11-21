# ios/tools/strip-png.py: run on ios/screenshots/*.png after a UI-test run (Simulator PNGs carry eXIf/iTXt; check-images I2).
# Keep only IHDR/PLTE/IDAT/IEND/tRNS/sRGB/gAMA/cHRM chunks of each PNG given (in place). No re-encode.
import sys, struct
KEEP = {b'IHDR', b'PLTE', b'IDAT', b'IEND', b'tRNS', b'sRGB', b'gAMA', b'cHRM'}
for p in sys.argv[1:]:
    d = open(p, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n', p
    out, i, dropped = [d[:8]], 8, []
    while i < len(d):
        n, = struct.unpack('>I', d[i:i+4]); t = d[i+4:i+8]
        chunk = d[i:i+12+n]
        if t in KEEP: out.append(chunk)
        else: dropped.append(t.decode('latin1'))
        i += 12 + n
        if t == b'IEND': break
    open(p, 'wb').write(b''.join(out))
    print(p.split('/')[-1], 'dropped', dropped)
