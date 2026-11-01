#!/usr/bin/env python3
"""Redesain logo Pencatat Laporan: 1 warna saja, flat, tanpa gradasi.

Konsep dipertahankan dari logo lama (dokumen + garis teks + grafik batang
+ pena + swoosh), tapi digambar ulang sebagai satu warna solid dengan
latar transparan, supaya bersih di mode gelap maupun terang.
  - logo-dark.png : putih  (untuk latar gelap)
  - logo-light.png: hitam  (untuk latar terang)
  - icon-*.png    : logo putih di atas kotak hitam (ikon PWA)
"""
import math
from PIL import Image, ImageDraw

S = 512  # canvas
C = (255, 255, 255, 255)  # warna akan diganti per varian


def swoosh_points(cx, cy, rx, ry, tilt_deg, thickness, a0=195, a1=350, steps=60):
    """Pita melengkung (crescent) dari busur elips yang dimiringkan."""
    tilt = math.radians(tilt_deg)
    outer, inner = [], []
    # Pita harus tebal merata: jari-jari dalam mengecil proporsional di x dan y,
    # kalau tidak pita menyempit jadi garis tipis di titik bawah busur.
    rx_in = rx - thickness
    ry_in = ry - thickness * (ry / rx)
    for i in range(steps + 1):
        a = math.radians(a0 + (a1 - a0) * i / steps)
        for pts, rr, ryy in ((outer, rx, ry), (inner, rx_in, ry_in)):
            x = rr * math.cos(a)
            y = ryy * math.sin(a)
            xr = cx + x * math.cos(tilt) - y * math.sin(tilt)
            yr = cy + x * math.sin(tilt) + y * math.cos(tilt)
            pts.append((xr, yr))
    return outer + inner[::-1]


def draw_logo(color):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 1. Swoosh di belakang: busur bawah elips, menyapu di bawah dokumen
    #    (masuk dokumen hanya di dekat tepi bawah, di bawah grafik batang)
    d.polygon(swoosh_points(240, 240, 235, 175, -8, 32, 12, 168), fill=color)

    # 2. Dokumen: outline tebal + garis lipatan pojok kanan atas
    d.rounded_rectangle([128, 78, 352, 412], radius=34, outline=color, width=20)
    d.line([(300, 78), (352, 130)], fill=color, width=14)
    d.line([(300, 78), (300, 130), (352, 130)], fill=color, width=8)

    # 3. Garis teks di dalam dokumen
    for y, x2 in ((140, 292), (184, 318), (228, 258)):
        d.rounded_rectangle([158, y, x2, y + 17], radius=8, fill=color)

    # 4. Grafik batang (naik ke kanan), alas sejajar
    base = 378
    for x, h in ((158, 52), (208, 84), (258, 118)):
        d.rounded_rectangle([x, base - h, x + 36, base], radius=8, fill=color)

    # 5. Pena diagonal di sisi kanan: ramping, atas condong ke kanan,
    #    ujung runcing ke bawah-kiri (mirip logo lama). Digambar tegak
    #    di layer sendiri lalu diputar searah jarum jam.
    pen = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pen)
    pd.rounded_rectangle([345, 140, 380, 325], radius=16, fill=color)
    pd.polygon([(345, 325), (380, 325), (362, 372)], fill=color)
    # tutup pena di atas (sedikit lebih lebar, dipisah celah tipis)
    pd.rounded_rectangle([343, 118, 382, 158], radius=14, fill=color)
    pen = pen.rotate(-32, center=(362, 250), resample=Image.BICUBIC)
    img = Image.alpha_composite(img, pen)
    return img


def main():
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    pub = os.path.join(here, "..", "public")
    white = (255, 255, 255, 255)
    black = (10, 10, 10, 255)
    dark = draw_logo(white)
    light = draw_logo(black)
    dark.save(os.path.join(pub, "logo-dark.png"))
    light.save(os.path.join(pub, "logo-light.png"))
    # Ikon PWA: kotak hitam dengan logo putih di tengah (padding 18%)
    for size in (192, 512):
        icon = Image.new("RGBA", (size, size), (10, 10, 10, 255))
        logo = dark.resize((int(size * 0.72), int(size * 0.72)), Image.LANCZOS)
        icon.alpha_composite(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
        icon.save(os.path.join(pub, f"icon-{size}.png"))
    # Pratinjau untuk pengecekan visual (bukan untuk deploy)
    for name, logo, bg in (("preview-dark", dark, (10, 10, 10, 255)),
                           ("preview-light", light, (255, 255, 255, 255))):
        prev = Image.new("RGBA", (S, S), bg)
        prev.alpha_composite(logo)
        prev.save(f"/tmp/{name}.png")
    print("logo-dark.png, logo-light.png, icon-192.png, icon-512.png ditulis")


if __name__ == "__main__":
    main()
