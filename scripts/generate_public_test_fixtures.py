#!/usr/bin/env python3

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path


WIDTH = 768
HEIGHT = 512
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "public-scenes"


def clamp(value: float) -> int:
    return max(0, min(255, int(value)))


def rgb(color: tuple[int, int, int]) -> bytes:
    return bytes((clamp(color[0]), clamp(color[1]), clamp(color[2])))


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def mix(left: tuple[int, int, int], right: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return (
        clamp(lerp(left[0], right[0], t)),
        clamp(lerp(left[1], right[1], t)),
        clamp(lerp(left[2], right[2], t)),
    )


def make_canvas() -> list[bytearray]:
    return [bytearray(WIDTH * 3) for _ in range(HEIGHT)]


def paint_vertical_gradient(
    pixels: list[bytearray],
    top: tuple[int, int, int],
    bottom: tuple[int, int, int],
    y_start: int = 0,
    y_end: int = HEIGHT,
) -> None:
    span = max(1, y_end - y_start - 1)
    for y in range(y_start, y_end):
        color = mix(top, bottom, (y - y_start) / span)
        row = pixels[y]
        triplet = rgb(color)
        for x in range(WIDTH):
            offset = x * 3
            row[offset : offset + 3] = triplet


def fill_rect(
    pixels: list[bytearray],
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    color: tuple[int, int, int],
) -> None:
    triplet = rgb(color)
    x0 = max(0, min(WIDTH, x0))
    x1 = max(0, min(WIDTH, x1))
    y0 = max(0, min(HEIGHT, y0))
    y1 = max(0, min(HEIGHT, y1))
    for y in range(y0, y1):
        row = pixels[y]
        for x in range(x0, x1):
            offset = x * 3
            row[offset : offset + 3] = triplet


def fill_circle(
    pixels: list[bytearray],
    cx: int,
    cy: int,
    radius: int,
    color: tuple[int, int, int],
) -> None:
    triplet = rgb(color)
    radius_sq = radius * radius
    for y in range(max(0, cy - radius), min(HEIGHT, cy + radius)):
        dy = y - cy
        row = pixels[y]
        for x in range(max(0, cx - radius), min(WIDTH, cx + radius)):
            dx = x - cx
            if dx * dx + dy * dy <= radius_sq:
                offset = x * 3
                row[offset : offset + 3] = triplet


def fill_band(
    pixels: list[bytearray],
    base_y: int,
    amplitude: int,
    frequency: float,
    thickness: int,
    color: tuple[int, int, int],
    phase: float = 0.0,
) -> None:
    triplet = rgb(color)
    for x in range(WIDTH):
        center = base_y + math.sin((x / WIDTH) * frequency + phase) * amplitude
        y0 = max(0, int(center - thickness))
        y1 = min(HEIGHT, int(center + thickness))
        for y in range(y0, y1):
            offset = x * 3
            pixels[y][offset : offset + 3] = triplet


def paint_windows(
    pixels: list[bytearray],
    x0: int,
    y0: int,
    width: int,
    height: int,
    window_color: tuple[int, int, int],
) -> None:
    for y in range(y0 + 8, y0 + height - 8, 16):
        for x in range(x0 + 8, x0 + width - 8, 14):
            fill_rect(pixels, x, y, x + 6, y + 8, window_color)


def add_cloud(pixels: list[bytearray], cx: int, cy: int, tint: tuple[int, int, int]) -> None:
    fill_circle(pixels, cx - 24, cy + 4, 26, tint)
    fill_circle(pixels, cx, cy - 6, 34, tint)
    fill_circle(pixels, cx + 28, cy + 2, 28, tint)


def write_png(path: Path, pixels: list[bytearray]) -> None:
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        raw.extend(row)

    def chunk(chunk_type: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + chunk_type
            + data
            + struct.pack(">I", zlib.crc32(chunk_type + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", WIDTH, HEIGHT, 8, 2, 0, 0, 0)
    data = b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            chunk(b"IHDR", ihdr),
            chunk(b"IDAT", zlib.compress(bytes(raw), level=9)),
            chunk(b"IEND", b""),
        ]
    )
    path.write_bytes(data)


def desert_dunes() -> list[bytearray]:
    pixels = make_canvas()
    paint_vertical_gradient(pixels, (255, 199, 112), (236, 137, 72), 0, HEIGHT // 2)
    fill_rect(pixels, 0, HEIGHT // 2, WIDTH, HEIGHT, (224, 182, 99))
    fill_circle(pixels, 612, 96, 48, (255, 244, 196))
    fill_band(pixels, HEIGHT // 2 + 36, 22, 7.2, 40, (231, 189, 108))
    fill_band(pixels, HEIGHT // 2 + 110, 28, 9.6, 46, (210, 154, 79), phase=0.6)
    fill_band(pixels, HEIGHT // 2 + 190, 18, 6.0, 48, (183, 124, 63), phase=1.4)
    return pixels


def island_lagoon() -> list[bytearray]:
    pixels = make_canvas()
    paint_vertical_gradient(pixels, (126, 226, 255), (18, 147, 213), 0, HEIGHT // 2)
    fill_rect(pixels, 0, HEIGHT // 2, WIDTH, HEIGHT, (25, 121, 168))
    fill_rect(pixels, 0, HEIGHT // 2 + 76, WIDTH, HEIGHT, (8, 83, 124))
    fill_circle(pixels, 160, 96, 42, (255, 255, 218))
    fill_circle(pixels, WIDTH // 2, HEIGHT // 2 + 36, 90, (79, 111, 62))
    fill_circle(pixels, WIDTH // 2 - 78, HEIGHT // 2 + 48, 54, (92, 130, 74))
    fill_rect(pixels, WIDTH // 2 - 4, HEIGHT // 2 - 30, WIDTH // 2 + 6, HEIGHT // 2 + 68, (84, 58, 36))
    fill_band(pixels, HEIGHT // 2 + 26, 10, 11.0, 10, (235, 224, 184))
    add_cloud(pixels, 320, 88, (246, 252, 255))
    add_cloud(pixels, 520, 132, (246, 252, 255))
    return pixels


def neon_streets() -> list[bytearray]:
    pixels = make_canvas()
    paint_vertical_gradient(pixels, (15, 22, 46), (56, 29, 83), 0, HEIGHT)
    fill_circle(pixels, 612, 88, 24, (246, 112, 255))
    for index, (x0, width, height, color) in enumerate(
        [
            (42, 76, 224, (37, 34, 68)),
            (142, 96, 268, (25, 33, 76)),
            (270, 84, 236, (50, 29, 59)),
            (388, 120, 310, (35, 48, 90)),
            (548, 82, 250, (28, 30, 58)),
            (650, 84, 292, (49, 36, 64)),
        ]
    ):
        fill_rect(pixels, x0, HEIGHT - height, x0 + width, HEIGHT, color)
        paint_windows(pixels, x0, HEIGHT - height, width, height, (255, 214 if index % 2 else 127, 125))
    for y in range(HEIGHT // 2, HEIGHT):
        half_width = int((y - HEIGHT // 2) * 0.95) + 40
        fill_rect(pixels, WIDTH // 2 - half_width, y, WIDTH // 2 + half_width, y + 1, (34, 31, 44))
    fill_band(pixels, HEIGHT - 92, 5, 20.0, 3, (67, 213, 255))
    fill_band(pixels, HEIGHT - 64, 4, 18.0, 3, (255, 67, 186), phase=0.8)
    return pixels


def canyon_overlook() -> list[bytearray]:
    pixels = make_canvas()
    paint_vertical_gradient(pixels, (144, 209, 255), (244, 175, 98), 0, HEIGHT // 2)
    fill_rect(pixels, 0, HEIGHT // 2, WIDTH, HEIGHT, (186, 112, 71))
    fill_band(pixels, HEIGHT // 2 + 10, 22, 9.0, 44, (156, 81, 56), phase=0.4)
    fill_band(pixels, HEIGHT // 2 + 118, 18, 7.8, 58, (115, 59, 43), phase=1.1)
    fill_rect(pixels, 0, HEIGHT - 120, WIDTH, HEIGHT, (74, 46, 30))
    fill_circle(pixels, 134, 118, 30, (255, 246, 225))
    return pixels


def alpine_snow() -> list[bytearray]:
    pixels = make_canvas()
    paint_vertical_gradient(pixels, (187, 227, 255), (108, 171, 230), 0, HEIGHT // 2)
    fill_rect(pixels, 0, HEIGHT // 2, WIDTH, HEIGHT, (227, 238, 246))
    for x0, peak, base, color in [
        (40, 146, 340, (119, 146, 176)),
        (220, 92, 398, (92, 123, 154)),
        (430, 130, 332, (128, 155, 183)),
        (580, 108, 372, (100, 126, 155)),
    ]:
        for y in range(base):
            t = y / max(1, base - 1)
            left = int(lerp(x0, x0 + 84, t))
            right = int(lerp(x0 + 220, x0 + 128, t))
            fill_rect(pixels, left, peak + y, right, peak + y + 1, color)
    fill_band(pixels, HEIGHT - 96, 12, 8.0, 50, (245, 248, 252))
    add_cloud(pixels, 214, 92, (245, 250, 255))
    add_cloud(pixels, 516, 132, (245, 250, 255))
    return pixels


def forest_trail() -> list[bytearray]:
    pixels = make_canvas()
    paint_vertical_gradient(pixels, (162, 221, 168), (76, 132, 81), 0, HEIGHT)
    fill_rect(pixels, 0, HEIGHT // 2, WIDTH, HEIGHT, (54, 86, 45))
    for x in [84, 168, 242, 328, 430, 522, 618, 704]:
        fill_rect(pixels, x, HEIGHT // 2 - 24, x + 12, HEIGHT - 44, (92, 58, 33))
        fill_circle(pixels, x + 6, HEIGHT // 2 - 40, 44, (37, 102, 53))
        fill_circle(pixels, x - 18, HEIGHT // 2 - 8, 34, (40, 119, 59))
        fill_circle(pixels, x + 24, HEIGHT // 2 - 8, 34, (45, 129, 66))
    for y in range(HEIGHT // 2 + 20, HEIGHT):
        half_width = int(32 + ((y - HEIGHT // 2) ** 1.15) * 0.12)
        fill_rect(pixels, WIDTH // 2 - half_width, y, WIDTH // 2 + half_width, y + 1, (153, 110, 69))
    return pixels


def harbor_docks() -> list[bytearray]:
    pixels = make_canvas()
    paint_vertical_gradient(pixels, (174, 219, 255), (96, 150, 205), 0, HEIGHT // 2)
    fill_rect(pixels, 0, HEIGHT // 2, WIDTH, HEIGHT, (25, 96, 138))
    fill_band(pixels, HEIGHT // 2 + 22, 6, 18.0, 4, (180, 220, 245))
    fill_rect(pixels, 90, HEIGHT // 2 + 42, 250, HEIGHT // 2 + 72, (104, 83, 64))
    fill_rect(pixels, 426, HEIGHT // 2 + 82, 696, HEIGHT // 2 + 118, (92, 73, 57))
    fill_rect(pixels, 228, HEIGHT // 2 - 46, 242, HEIGHT // 2 + 72, (85, 84, 94))
    fill_rect(pixels, 244, HEIGHT // 2 - 38, 334, HEIGHT // 2 - 26, (85, 84, 94))
    fill_rect(pixels, 560, HEIGHT // 2 - 58, 574, HEIGHT // 2 + 118, (82, 88, 102))
    fill_rect(pixels, 574, HEIGHT // 2 - 50, 666, HEIGHT // 2 - 38, (82, 88, 102))
    fill_circle(pixels, 612, 92, 28, (255, 233, 180))
    return pixels


def market_plaza() -> list[bytearray]:
    pixels = make_canvas()
    paint_vertical_gradient(pixels, (255, 224, 180), (248, 171, 117), 0, HEIGHT // 2)
    fill_rect(pixels, 0, HEIGHT // 2, WIDTH, HEIGHT, (208, 168, 116))
    for x0, width, height, color in [
        (24, 114, 188, (193, 123, 82)),
        (160, 96, 232, (211, 145, 90)),
        (286, 120, 208, (188, 111, 72)),
        (436, 132, 252, (214, 151, 99)),
        (600, 120, 198, (184, 108, 68)),
    ]:
        fill_rect(pixels, x0, HEIGHT // 2 - height, x0 + width, HEIGHT // 2 + 50, color)
    for x0, color in [(54, (240, 82, 92)), (204, (36, 140, 245)), (340, (244, 200, 89)), (498, (65, 183, 135))]:
        fill_rect(pixels, x0, HEIGHT // 2 + 24, x0 + 94, HEIGHT // 2 + 44, color)
    fill_circle(pixels, 620, 96, 36, (255, 249, 206))
    return pixels


def night_city() -> list[bytearray]:
    pixels = make_canvas()
    paint_vertical_gradient(pixels, (6, 10, 27), (27, 40, 81), 0, HEIGHT)
    fill_circle(pixels, 612, 88, 24, (241, 248, 255))
    for x0, width, height, color in [
        (34, 86, 248, (18, 27, 58)),
        (142, 96, 322, (25, 36, 74)),
        (270, 84, 280, (15, 23, 47)),
        (388, 118, 356, (20, 31, 68)),
        (536, 86, 304, (23, 36, 78)),
        (642, 88, 266, (18, 26, 60)),
    ]:
        fill_rect(pixels, x0, HEIGHT - height, x0 + width, HEIGHT, color)
        paint_windows(pixels, x0, HEIGHT - height, width, height, (255, 230, 139))
    fill_band(pixels, HEIGHT - 72, 5, 22.0, 3, (53, 167, 255))
    return pixels


def seaside_cliffs() -> list[bytearray]:
    pixels = make_canvas()
    paint_vertical_gradient(pixels, (141, 224, 255), (77, 170, 221), 0, HEIGHT // 2)
    fill_rect(pixels, 0, HEIGHT // 2, WIDTH, HEIGHT, (17, 110, 150))
    fill_band(pixels, HEIGHT // 2 + 18, 6, 19.0, 5, (196, 235, 247))
    fill_rect(pixels, 0, HEIGHT - 136, WIDTH, HEIGHT, (233, 211, 161))
    fill_rect(pixels, 84, HEIGHT // 2 - 18, 254, HEIGHT - 28, (132, 98, 79))
    fill_rect(pixels, 540, HEIGHT // 2 - 42, 768, HEIGHT - 58, (109, 88, 74))
    add_cloud(pixels, 182, 86, (245, 251, 255))
    add_cloud(pixels, 468, 122, (245, 251, 255))
    fill_circle(pixels, 644, 86, 30, (255, 247, 191))
    return pixels


SCENES = [
    ("01-desert-dunes.png", desert_dunes),
    ("02-island-lagoon.png", island_lagoon),
    ("03-neon-streets.png", neon_streets),
    ("04-canyon-overlook.png", canyon_overlook),
    ("05-alpine-snow.png", alpine_snow),
    ("06-forest-trail.png", forest_trail),
    ("07-harbor-docks.png", harbor_docks),
    ("08-market-plaza.png", market_plaza),
    ("09-night-city.png", night_city),
    ("10-seaside-cliffs.png", seaside_cliffs),
]


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for filename, factory in SCENES:
        write_png(OUTPUT_DIR / filename, factory())
    print(f"generated {len(SCENES)} fixtures in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
