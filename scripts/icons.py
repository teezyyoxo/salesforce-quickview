"""Render the QuickView eye mark as PNG using only Python's standard library."""
import math
import struct
import zlib
from pathlib import Path

def chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)

for size in [16, 32, 48, 128]:
    pixels = bytearray()
    for y in range(size):
        pixels.append(0)
        for x in range(size):
            samples = []
            for sy in range(4):
                for sx in range(4):
                    u, v = (x+(sx+.5)/4)/size, (y+(sy+.5)/4)/size
                    dx, dy = max(abs(u-.5)-.23, 0), max(abs(v-.5)-.23, 0)
                    inside = dx*dx+dy*dy <= .23*.23
                    edge = abs(abs(v-.5) - .18*math.sin(math.pi*max(0,min(1,(u-.18)/.64)))) < .027 and .18 <= u <= .82
                    pupil = (u-.5)**2+(v-.5)**2 < .082**2
                    samples.append((255,255,255,255) if inside and (edge or pupil) else (91,88,235,255) if inside else (0,0,0,0))
            pixels.extend(round(sum(s[c] for s in samples)/len(samples)) for c in range(4))
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR',struct.pack('!2I5B',size,size,8,6,0,0,0)) + chunk(b'IDAT',zlib.compress(bytes(pixels))) + chunk(b'IEND',b'')
    (Path(__file__).resolve().parent.parent / 'extension/icons' / f'icon{size}.png').write_bytes(data)
