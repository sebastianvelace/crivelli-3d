"""
Análisis geométrico de la Anunciación con san Emigdio (Carlo Crivelli, 1486, NG739).

Lee las líneas marcadas a mano (analysis/data/lines.json, generadas con
analysis/marcador.html) y calcula:

  1. El punto de fuga central por mínimos cuadrados (coordenadas homogéneas + SVD)
     y su residuo ("error de perspectiva").
  2. La línea del horizonte.
  3. La distancia del ojo (distancia focal f en píxeles) a partir de los puntos de
     distancia: las diagonales de baldosas cuadradas fugan a (x_pf ± f, y_h).
  4. La altura del ojo a partir de figuras de altura supuesta.
  5. La homografía del piso de la calle (analítica y por DLT con las baldosas)
     y la planta rectificada vista desde arriba.

Salidas:
  public/data/calibration.json   -> la usa la escena three.js
  docs/01_lineas_de_fuga.jpg     -> pintura con las líneas de fuga
  docs/02_planta_rectificada.png -> planta del piso vista desde arriba
  analysis/out/reporte.md        -> resumen numérico

Uso:  python analysis/geometry.py      (requiere numpy y Pillow)
"""

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from floor_plan import draw_floor_plan

ROOT = Path(__file__).resolve().parent.parent
LINES = ROOT / "analysis" / "data" / "lines.json"

# Dimensiones físicas según la ficha de Wikimedia Commons de la reproducción
# usada (207 x 146,5 cm). Solo se usan para traducir f (px) a una distancia real en cm.
PANEL_WIDTH_CM = 146.5
ZONE_COLORS = {
    'calle_izquierda': '#53dcaf',
    'fachada_maria': '#ffe05b',
    'logia': '#fb927a',
    'cuarto_maria': '#b6b0ff',
    'piso': '#64c7ff',
}


# ---------------------------------------------------------------------------
# Geometría proyectiva básica
# ---------------------------------------------------------------------------

def homogeneous_line(seg):
    """Recta por dos puntos: l = p1 x p2 (producto cruz en coordenadas homogéneas).
    Se normaliza para que (a, b) sea unitario; así l·p es la distancia en píxeles."""
    p1 = np.array([seg[0], seg[1], 1.0])
    p2 = np.array([seg[2], seg[3], 1.0])
    l = np.cross(p1, p2)
    return l / math.hypot(l[0], l[1])


def intersect(l1, l2):
    """Intersección de dos rectas: p = l1 x l2 (también un producto cruz)."""
    p = np.cross(l1, l2)
    return p / p[2]


def vanishing_point(segments):
    """Punto de fuga de N rectas por mínimos cuadrados.

    Cada recta l_i cumple l_i · v = 0 si pasa por v. Con N > 2 rectas ruidosas,
    buscamos el v (con |v| = 1) que minimiza sum (l_i · v)^2, es decir, el vector
    singular de menor valor singular de la matriz A (N x 3) con filas l_i.

    Para que el problema esté bien condicionado se normalizan las coordenadas
    (Hartley): se trasladan al centro de la imagen y se escalan a ~1.
    """
    pts = np.array(segments, dtype=float).reshape(-1, 2)
    c = pts.mean(axis=0)
    s = math.sqrt(2) / np.mean(np.linalg.norm(pts - c, axis=1))
    T = np.array([[s, 0, -s * c[0]], [0, s, -s * c[1]], [0, 0, 1]])

    A = []
    for seg in segments:
        p1 = T @ np.array([seg[0], seg[1], 1.0])
        p2 = T @ np.array([seg[2], seg[3], 1.0])
        l = np.cross(p1, p2)
        A.append(l / math.hypot(l[0], l[1]))
    A = np.array(A)
    _, _, Vt = np.linalg.svd(A)
    v = np.linalg.inv(T) @ Vt[-1]
    v = v / v[2]

    vp = v[:2]
    return vp, *vanishing_errors(segments, vp)


def vanishing_errors(segments, vp):
    # Residuo: distancia perpendicular (px) del punto de fuga a cada recta,
    # y ángulo entre cada segmento y la dirección hacia el punto de fuga.
    dists, angles = [], []
    for seg in segments:
        l = homogeneous_line(seg)
        dists.append(abs(l @ [*vp, 1]))
        mid = np.array([(seg[0] + seg[2]) / 2, (seg[1] + seg[3]) / 2])
        d_seg = np.array([seg[2] - seg[0], seg[3] - seg[1]])
        d_vp = vp - mid
        cosang = abs(d_seg @ d_vp) / (np.linalg.norm(d_seg) * np.linalg.norm(d_vp))
        angles.append(math.degrees(math.acos(min(1.0, cosang))))
    return np.array(dists), np.array(angles)


def summarize_vanishing(segments, reference):
    point, distances, angles = vanishing_point(segments)
    _, reference_angles = vanishing_errors(segments, reference)
    trials = [vanishing_point(segments[:i] + segments[i + 1:])[0] for i in range(len(segments))] if len(segments) >= 3 else []
    finite = [p for p in trials if np.all(np.isfinite(p))]
    covariance = np.cov(np.array(finite).T) if len(finite) >= 2 else None
    return {
        'lines': len(segments),
        'vanishingPoint': point.round(2).tolist(),
        'meanAngleDeg': round(float(angles.mean()), 3),
        'maxErrorPx': round(float(distances.max()), 2),
        'meanAngleAgainstCalibrationDeg': round(float(reference_angles.mean()), 3),
        'leaveOneOutCovariancePx2': covariance.round(3).tolist() if covariance is not None else None,
    }


def dlt_homography(src, dst):
    """Homografía H (3x3) con dst ~ H src por DLT normalizado (4 o más puntos)."""
    def normalizer(p):
        c = p.mean(axis=0)
        s = math.sqrt(2) / np.mean(np.linalg.norm(p - c, axis=1))
        return np.array([[s, 0, -s * c[0]], [0, s, -s * c[1]], [0, 0, 1]])

    src, dst = np.asarray(src, float), np.asarray(dst, float)
    Ts, Td = normalizer(src), normalizer(dst)
    rows = []
    for (x, y), (u, v) in zip(src, dst):
        x, y, _ = Ts @ [x, y, 1]
        u, v, _ = Td @ [u, v, 1]
        rows.append([-x, -y, -1, 0, 0, 0, u * x, u * y, u])
        rows.append([0, 0, 0, -x, -y, -1, v * x, v * y, v])
    _, _, Vt = np.linalg.svd(np.array(rows))
    Hn = Vt[-1].reshape(3, 3)
    H = np.linalg.inv(Td) @ Hn @ Ts
    return H / H[2, 2]


def apply_h(H, pts):
    pts = np.asarray(pts, float)
    ph = np.c_[pts, np.ones(len(pts))] @ H.T
    return ph[:, :2] / ph[:, 2:3]


# ---------------------------------------------------------------------------
# Programa principal
# ---------------------------------------------------------------------------

def main():
    data = json.loads(LINES.read_text(encoding="utf-8"))
    W, Himg = data["image"]["width"], data["image"]["height"]
    img_path = ROOT / data["image"]["file"]

    # 1) Punto de fuga central ------------------------------------------------
    segments = data['orthogonals']
    baseline_count = data.get('calibrationOrthogonalCount', len(segments))
    vp, dists, angles = vanishing_point(segments[:baseline_count])
    cx, cy = vp
    rms = float(np.sqrt(np.mean(dists ** 2)))

    # 2) Horizonte -------------------------------------------------------------
    # Con el cuadro vertical (costruzione legittima), el horizonte es la recta
    # horizontal y = cy que pasa por el punto de fuga central. El punto de fuga
    # es también el "punto céntrico" de Alberti: el pie de la perpendicular del
    # ojo al cuadro, es decir, el punto principal de la cámara.
    horizon = np.array([0.0, 1.0, -cy])

    # 3) Distancia del ojo -----------------------------------------------------
    # Supuesto: las baldosas del piso son CUADRADAS. Sus diagonales forman 45°
    # con el plano del cuadro, así que fugan a los "puntos de distancia"
    # (cx ± f, cy). La distancia horizontal entre el punto de fuga central y un
    # punto de distancia es exactamente la distancia del ojo al cuadro, f (en px).
    dps, fs = [], []
    for seg in data["diagonals"]:
        p = intersect(homogeneous_line(seg), horizon)
        dps.append(p[:2].tolist())
        fs.append(abs(p[0] - cx))
    fs = np.array(fs)
    f = float(np.mean(fs))

    # 4) Altura del ojo ----------------------------------------------------------
    # Una figura vertical de altura h, apoyada en el piso a profundidad D:
    #   v_pie - cy = f * Hc / D   y   v_pie - v_cabeza = f * h / D
    # dividiendo:  Hc = h * (v_pie - cy) / (v_pie - v_cabeza)
    # (no depende de D ni de f). Las alturas h son supuestos explícitos.
    eye = []
    for fig in data["figures"]:
        vf, vh = fig["foot"][1], fig["head"][1]
        eye.append(fig["height_m"] * (vf - cy) / (vf - vh))
    Hc = float(np.mean(eye))

    # 5) Homografía del piso -----------------------------------------------------
    # Cámara: ojo en (0, Hc, 0) mirando hacia -Z. Un punto del piso (X, 0, -D)
    # se proyecta en u = cx + f X / D,  v = cy + f Hc / D. En coordenadas
    # homogéneas eso es una homografía del plano (X, D) a la imagen:
    #        [u]   [f  cx    0  ] [X]
    #      w [v] = [0  cy  f*Hc ] [D]
    #        [1]   [0   1    0  ] [1]
    H_analytic = np.array([[f, cx, 0.0], [0.0, cy, f * Hc], [0.0, 1.0, 0.0]])

    # Comprobación independiente: DLT con las esquinas de baldosas medidas,
    # en unidades de baldosa. Tamaño de la baldosa en metros, a partir de la
    # hilera frontal: s = Hc * ancho_px / (v - cy).
    corners = np.array(data["tiles"]["corners"], float)
    H_dlt = dlt_homography(corners[:, :2], corners[:, 2:])
    row0 = corners[corners[:, 1] == 0]
    tile_px = np.mean(np.diff(np.sort(row0[:, 2])))
    tile_m = Hc * tile_px / (row0[0, 3] - cy)
    reproj = apply_h(H_dlt, corners[:, :2]) - corners[:, 2:]
    reproj_rms = float(np.sqrt(np.mean(np.sum(reproj ** 2, axis=1))))
    # Profundidad (D) del borde frontal de las baldosas y posición X de la junta 0
    D0 = f * Hc / (row0[0, 3] - cy)
    X0 = (row0[0, 2] - cx) * D0 / f
    # Diferencia entre ambas homografías en las esquinas medidas
    world = np.c_[X0 + corners[:, 0] * tile_m, D0 + corners[:, 1] * tile_m]
    diff = apply_h(H_analytic, world) - apply_h(H_dlt, corners[:, :2])
    h_diff = float(np.sqrt(np.mean(np.sum(diff ** 2, axis=1))))

    px_cm = PANEL_WIDTH_CM / W
    calib = {
        "imageWidth": W,
        "imageHeight": Himg,
        "vanishingPoint": [round(cx, 2), round(cy, 2)],
        "horizonY": round(cy, 2),
        "focalPx": round(f, 2),
        "focalPxSamples": [round(float(x), 1) for x in fs],
        "distancePoints": [[round(a, 1), round(b, 1)] for a, b in dps],
        "eyeHeightM": round(Hc, 3),
        "eyeHeightSamples": [round(float(x), 3) for x in eye],
        "perspectiveErrorRmsPx": round(rms, 2),
        "perspectiveErrorMaxPx": round(float(dists.max()), 2),
        "perspectiveErrorMeanDeg": round(float(angles.mean()), 3),
        "linesUsed": baseline_count,
        "tileSizeM": round(tile_m, 3),
        "floorFrontDepthM": round(D0, 3),
        "homographyFloor": H_analytic.round(4).tolist(),
        "homographyDltReprojRmsPx": round(reproj_rms, 2),
        "homographyAgreementRmsPx": round(h_diff, 2),
        "fovVerticalDeg": round(math.degrees(math.atan(cy / f) + math.atan((Himg - cy) / f)), 2),
        "fovHorizontalDeg": round(math.degrees(math.atan(cx / f) + math.atan((W - cx) / f)), 2),
        "viewingDistanceCm": round(f * px_cm, 1),
        "panelWidthCm": PANEL_WIDTH_CM,
    }
    focal_std = float(np.std(fs, ddof=1)) if len(fs) >= 2 else 0.0
    calib['focalPxStd'] = round(focal_std, 2)
    calib['viewingDistanceCmRange'] = [round((f - focal_std) * px_cm, 1), round((f + focal_std) * px_cm, 1)]
    # La razón pie–horizonte / pie–cabeza cancela f para esta estimación.
    calib['eyeHeightFocalRangeM'] = [calib['eyeHeightM']] * 2
    calib['eyeHeightByMethodM'] = {
        'fraile': round(eye[0], 3),
        'gabriel': round(eye[1], 3),
        'baldosa': round(0.292 * (row0[0, 3] - cy) / tile_px, 3),
    }
    if 'orthogonalZones' in data:
        by_zone = {key: [] for key in ZONE_COLORS}
        for segment, zone in zip(segments, data['orthogonalZones'], strict=True):
            if zone in by_zone:
                by_zone[zone].append(segment)
        calib['globalPerspective'] = summarize_vanishing(segments, vp)
        calib['zones'] = {
            zone: summarize_vanishing(selected, vp)
            if len(selected) >= 2 else {'lines': len(selected)}
            for zone, selected in by_zone.items()
        }
        draw_zone_figure(img_path, data, calib)
    out = ROOT / "public" / "data" / "calibration.json"
    out.write_text(json.dumps(calib, indent=2, ensure_ascii=False), encoding="utf-8")

    draw_lines_figure(img_path, data, calib)
    scene = json.loads((ROOT / 'public/data/scene.json').read_text(encoding='utf-8'))
    plan = draw_floor_plan(img_path, H_analytic, calib, scene['elements'], font)
    plan.save(ROOT / 'docs/02_planta_rectificada.png')
    plan.save(ROOT / 'public/data/planta.png')
    write_report(calib)
    print(json.dumps(calib, indent=2, ensure_ascii=False))


# ---------------------------------------------------------------------------
# Figuras para la presentación
# ---------------------------------------------------------------------------

def font(size):
    for name in ("DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def draw_lines_figure(img_path, data, calib):
    """Pintura con: segmentos marcados (verde), su prolongación hasta el punto de
    fuga (rojo), diagonales de baldosas hacia el punto de distancia (azul) y la
    línea del horizonte (amarillo)."""
    im = Image.open(img_path).convert("RGB")
    W, H = im.size
    pad = 0
    dr = ImageDraw.Draw(im, "RGBA")
    cx, cy = calib["vanishingPoint"]
    dr.line([0, cy, W, cy], fill=(255, 220, 0, 230), width=6)
    for s in data["orthogonals"][:calib['linesUsed']]:
        far = s[:2] if math.dist(s[:2], (cx, cy)) > math.dist(s[2:], (cx, cy)) else s[2:]
        dr.line([far[0], far[1], cx, cy], fill=(230, 30, 30, 170), width=4)
        dr.line(s, fill=(20, 230, 60, 255), width=10)
    for s, dp in zip(data["diagonals"], calib["distancePoints"]):
        dr.line([s[0], s[1], dp[0], dp[1]], fill=(40, 120, 255, 220), width=5)
        dr.line(s, fill=(40, 120, 255, 255), width=10)
    r = 34
    dr.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 0), width=10)
    f = font(70)
    dr.text((cx + 50, cy - 110), "punto de fuga", fill=(255, 255, 0), font=f,
            stroke_width=4, stroke_fill=(0, 0, 0))
    dr.text((40, cy + 20), "horizonte", fill=(255, 220, 0), font=f, stroke_width=4, stroke_fill=(0, 0, 0))
    txt = (f"f = {calib['focalPx']:.0f} px  ·  error RMS = {calib['perspectiveErrorRmsPx']:.1f} px "
           f"({calib['linesUsed']} rectas)")
    dr.text((40, H - 120), txt, fill=(255, 255, 255), font=font(64), stroke_width=4, stroke_fill=(0, 0, 0))
    im.thumbnail((1600, 2400))
    im.save(ROOT / "docs" / "01_lineas_de_fuga.jpg", quality=88)
    del pad


def draw_zone_figure(img_path, data, calib):
    photo = Image.open(img_path).convert('RGB')
    scale = 1500 / photo.width
    photo = photo.resize((1500, round(photo.height * scale)), Image.Resampling.LANCZOS)
    top = 136
    canvas = Image.new('RGB', (photo.width, photo.height + top), '#201a16')
    canvas.paste(photo, (0, top))
    draw = ImageDraw.Draw(canvas)
    draw.text((28, 18), 'Consistencia de la perspectiva por zonas', font=font(35), fill='#faf3ea')
    draw.text((28, 62), 'Elipse descriptiva de sensibilidad al excluir una recta · Cruz blanca: fuga de la calibración',
              font=font(19), fill='#e2d8c9')
    for i, (zone, color) in enumerate(ZONE_COLORS.items()):
        x = 28 + i * 296
        draw.line((x, 108, x + 21, 108), fill=color, width=5)
        draw.text((x + 30, 108), zone.replace('_', ' '), fill='#faf3ea', font=font(22), anchor='lm')

    def project(x, y):
        return x * scale, y * scale + top

    marks = []
    for segment, zone in zip(data['orthogonals'], data['orthogonalZones'], strict=True):
        if zone not in ZONE_COLORS:
            continue
        x, y, u, v = segment
        path = (*project(x, y), *project(u, v))
        draw.line(path, fill='#1a1411', width=7)
        draw.line(path, fill=ZONE_COLORS[zone], width=4)

    for zone, color in ZONE_COLORS.items():
        stats = calib['zones'][zone]
        if 'vanishingPoint' not in stats:
            continue
        center = np.asarray(stats['vanishingPoint'])
        cov = stats['leaveOneOutCovariancePx2']
        if cov is not None:
            values, axes = np.linalg.eigh(cov)
            theta = np.linspace(0, 2 * np.pi, 81)
            circle = np.vstack([np.cos(theta), np.sin(theta)])
            points = center[:, None] + axes @ (np.sqrt(5.991 * np.maximum(values, 0))[:, None] * circle)
            draw.line([project(x, y) for x, y in points.T], fill=color, width=3)
        marks.append((project(*center), color))
    for (x, y), color in marks:
        draw.ellipse((x - 7, y - 7, x + 7, y + 7), fill=color, outline='#1a1411', width=2)
    x, y = project(*calib['vanishingPoint'])
    for stroke in ('#1a1411', '#fff7eb'):
        width = 5 if stroke == '#1a1411' else 2
        draw.line((x - 12, y, x + 12, y), fill=stroke, width=width)
        draw.line((x, y - 12, x, y + 12), fill=stroke, width=width)
    canvas.save(ROOT / 'docs/16_consistencia_por_zonas.png')


def write_report(c):
    lines = [
        "# Reporte del análisis geométrico",
        "",
        f"- Punto de fuga central: ({c['vanishingPoint'][0]:.1f}, {c['vanishingPoint'][1]:.1f}) px",
        f"- Error de perspectiva: RMS {c['perspectiveErrorRmsPx']} px, máximo {c['perspectiveErrorMaxPx']} px, "
        f"ángulo medio {c['perspectiveErrorMeanDeg']}° ({c['linesUsed']} rectas)",
        f"- Distancia del ojo f = {c['focalPx']} ± {c['focalPxStd']} px (media ± desviación estándar muestral de "
        f"{len(c['focalPxSamples'])} diagonales: {c['focalPxSamples']})",
        f"- Puntos de distancia: {c['distancePoints']}",
        f"- Distancia de observación en el museo ≈ {c['viewingDistanceCm']} cm (panel de {c['panelWidthCm']} cm)",
        f"- Altura del ojo ≈ {c['eyeHeightM']} m (muestras: {c['eyeHeightSamples']})",
        f"- Campo visual: {c['fovHorizontalDeg']}° horizontal x {c['fovVerticalDeg']}° vertical",
        f"- Baldosa ≈ {c['tileSizeM']} m; borde frontal del piso a {c['floorFrontDepthM']} m del ojo",
        f"- Homografía DLT: reproyección RMS {c['homographyDltReprojRmsPx']} px; "
        f"diferencia con la analítica {c['homographyAgreementRmsPx']} px",
        f"- Distancia de observación para f ± una desviación: {c['viewingDistanceCmRange']} cm.",
        f"- Rango de altura del ojo al variar solo f: {c['eyeHeightFocalRangeM']} m; la razón de alturas cancela f.",
    ]
    if 'zones' in c:
        lines.extend([
            '', '## Consistencia de la perspectiva', '',
            'Las 33 rectas de referencia calibran el visor. El ajuste global ampliado incluye las nuevas marcas '
            'de la derecha. La elipse muestra la sensibilidad al omitir una recta, no una región de confianza.', '',
            '| Zona | Rectas | Fuga local (px) | Error angular medio (°) | Error máximo (px) | Ángulo medio frente a la calibración (°) |',
            '| --- | ---: | --- | ---: | ---: | ---: |',
        ])
        for zone, row in [('global_ampliado', c['globalPerspective']), *c['zones'].items()]:
            name = zone.replace('_', ' ')
            if 'vanishingPoint' not in row:
                lines.append(f"| {name} | {row['lines']} | Sin ajuste | — | — | — |")
                continue
            x, y = row['vanishingPoint']
            lines.append(f"| {name} | {row['lines']} | ({x:.2f}; {y:.2f}) | {row['meanAngleDeg']:.3f} | "
                         f"{row['maxErrorPx']:.2f} | {row['meanAngleAgainstCalibrationDeg']:.3f} |")
    heights = c['eyeHeightByMethodM']
    lines.extend([
        '', '## Validación cruzada de la escala', '',
        f'- Solo con el fraile (1,65 m de pie): {heights["fraile"]:.3f} m.',
        f'- Solo con Gabriel (1,20 m de rodillas): {heights["gabriel"]:.3f} m.',
        f'- Solo con una baldosa de 29,2 cm (medio brazo florentino): {heights["baldosa"]:.3f} m.',
        '', 'Cada prueba cambia la referencia métrica y usa el mismo horizonte. La baldosa introduce un '
        'supuesto histórico alternativo, no una medida física del espacio pintado.',
    ])
    (ROOT / "analysis" / "out" / "reporte.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
