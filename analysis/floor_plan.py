"""Planta métrica con el piso visible, las huellas y los puntos de las figuras."""

import math

import numpy as np
from PIL import Image, ImageDraw

from scene3d import PictureSpace, lift, resolve_planes

FIGURES = {
    'fraile': 'Fraile', 'hombre_dorado': 'Hombre del manto dorado', 'puente_figuras': 'Figuras del puente',
    'balcon_figuras': 'Figuras del balcón', 'nino': 'Niño', 'emigdio': 'San Emigdio',
    'gabriel': 'Gabriel', 'atril': 'Atril', 'maria': 'María',
}


def visible_floor(im, H_floor, space, elements, planes, bounds, ppm):
    """Proyecta la malla de suelo y conserva solo la superficie más cercana al ojo."""
    left, right, far = bounds
    width, height = round((right - left) * ppm), round(far * ppm)
    xs = left + (np.arange(width) + 0.5) / ppm
    ds = far - (np.arange(height) + 0.5) / ppm
    X, D = np.meshgrid(xs, ds)
    U = H_floor[0, 0] * X / D + H_floor[0, 1]
    V = H_floor[1, 1] + H_floor[1, 2] / D
    valid = (D >= 1.5) & (U >= 0) & (U < im.width) & (V >= 0) & (V < im.height)
    ux = np.clip(U.astype(int), 0, im.width - 1)
    vy = np.clip(V.astype(int), 0, im.height - 1)
    floor = np.zeros(U.shape, dtype=bool)
    hidden = floor.copy()
    for element in elements:
        mask = Image.new('1', im.size)
        draw = ImageDraw.Draw(mask)
        draw.polygon([tuple(p) for p in element['polygon']], fill=1)
        for hole in element.get('holes', []):
            draw.polygon([tuple(p) for p in hole], fill=0)
        covered = valid & np.asarray(mask)[vy, ux]
        plane = planes[element['id']]
        if plane['type'] == 'horizontal' and math.isclose(plane['c'], 0, abs_tol=1e-6):
            floor |= covered
        elif element['kind'] == 'figure':
            # Una silueta pintada tapa la textura de suelo, aun si su plano es aproximado.
            hidden |= covered
        elif np.any(covered):
            depth = space.ray_t(U[covered], V[covered], plane)
            hidden[covered] |= (depth > 0) & (depth < D[covered] - 0.005)

    colors = np.full((*X.shape, 3), [232, 226, 214], dtype=np.uint8)
    show = floor & ~hidden
    colors[show] = np.asarray(im)[vy[show], ux[show]]
    return Image.fromarray(colors)


def draw_floor_plan(image_path, H_floor, calib, elements, font):
    """Dibuja los elementos en la misma escala que el piso y evita rótulos cruzados."""
    space = PictureSpace(calib)
    planes = resolve_planes(space, elements)
    d_max = -planes['arco_fondo']['c']
    x_min, x_max, ppm = -3, 4, 96
    texture = visible_floor(Image.open(image_path).convert('RGB'), H_floor, space,
                            elements, planes, (x_min, x_max, d_max), ppm)
    margin, top, footer = 255, 86, 54
    w, h = texture.size
    canvas = Image.new('RGB', (w + 2 * margin, h + top + footer), '#f7f2e9')
    canvas.paste(texture, (margin, top))
    dr = ImageDraw.Draw(canvas, 'RGBA')

    def plot(x, depth):
        return margin + (x - x_min) * ppm, top + (d_max - depth) * ppm

    for x in range(x_min, x_max + 1):
        px, _ = plot(x, 0)
        dr.line((px, top, px, top + h), fill=(60, 52, 44, 70), width=1)
        dr.text((px, top + h + 9), f'{x}', font=font(14), fill='#3e352c', anchor='mt')
    for d in range(1, math.floor(d_max) + 1):
        _, py = plot(0, d)
        dr.line((margin, py, margin + w, py), fill=(60, 52, 44, 70), width=1)
        dr.text((margin - 7, py), f'{d}', font=font(14), fill='#3e352c', anchor='rm')

    for pixel, edge in ((0, x_min), (space.W, x_max)):
        slope = (pixel - space.cx) / space.f
        depth = min(d_max, edge / slope)
        dr.line((*plot(0, 0), *plot(slope * depth, depth)), fill='#98702b', width=3)

    labels = [[], []]
    for element in elements:
        key = element['id']
        plane = planes[key]
        if element['kind'] == 'architecture' and plane['type'] in ('side', 'frontal'):
            extent = lift(space, element['polygon'], plane)
            if plane['type'] == 'side':
                x = plane['c']
                near, far = max(0, -extent[:, 2].max()), min(d_max, -extent[:, 2].min())
                if not x_min <= x <= x_max or near > far:
                    continue
                a, b = plot(x, near), plot(x, far)
            else:
                depth = -plane['c']
                left, right = max(x_min, extent[:, 0].min()), min(x_max, extent[:, 0].max())
                if not 0 <= depth <= d_max or left > right:
                    continue
                a, b = plot(left, depth), plot(right, depth)
            dr.line((*a, *b), fill='#5e4334', width=5)
            branch = 0 if (a[0] + b[0]) / 2 < margin + w / 2 else 1
            labels[branch].append((a if branch == 0 else b, key, '#5e4334'))
        elif key in FIGURES:
            p = lift(space, element.get('roi', element['polygon']), plane).mean(axis=0)
            if not x_min <= p[0] <= x_max or not 0 <= -p[2] <= d_max:
                continue
            x, y = plot(p[0], -p[2])
            dr.ellipse((x - 5, y - 5, x + 5, y + 5), fill='#235c63', outline='#faf6ef', width=1)
            labels[int(p[0] > 0.2)].append(((x, y), FIGURES[key], '#235c63'))

    eye_x, eye_y = plot(0, 0)
    dr.polygon([(eye_x, eye_y - 11), (eye_x - 8, eye_y + 3), (eye_x + 8, eye_y + 3)], fill='#98702b')
    labels[1].append(((eye_x, eye_y), 'Ojo de Crivelli', '#79531d'))
    for side, entries in enumerate(labels):
        entries.sort(key=lambda entry: entry[0][1])
        gap = 24
        heights = []
        for index, (point, _, _) in enumerate(entries):
            lower = top + 10 if not heights else heights[-1] + gap
            upper = top + h - (len(entries) - index - 1) * gap
            heights.append(min(max(point[1], lower), upper))
        for ((px, py), label, color), y in zip(entries, heights):
            x = margin + w + 20 if side else margin - 32
            dr.line(((px, py), (x, y)), fill=(76, 61, 47, 115), width=1)
            dr.text((x + (6 if side else -4), y), label, fill=color, font=font(14), anchor='lm' if side else 'rm')

    dr.text((margin, 17), 'Planta rectificada de la Anunciación', fill='#32271e', font=font(25))
    dr.text((margin, 52), 'Textura visible · Huellas de muros · Figuras · Cono del ojo',
            fill='#4f4134', font=font(15))
    dr.text((margin + w, top + h + 29), 'Cuadrícula de 1 m · El patio queda más allá del arco',
            fill='#4f4134', font=font(14), anchor='rt')
    return canvas
