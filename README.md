# Crivelli 3D: entrar en la *Anunciación con san Emigdio*

Reconstrucción 3D recorrible de *La Anunciación con san Emigdio* de Carlo Crivelli (1486, National Gallery, Londres, NG739) a partir de la geometría de su perspectiva.

La portada permite entrar libremente al museo o iniciar el recorrido guiado. La sala muestra el cuadro colgado a su tamaño real. En el piso hay una marca: el punto exacto donde estaba el ojo del pintor, calculado a partir de la pintura. El botón **«Ojo»** lleva la cámara hasta ahí. Desde ese punto el cuadro se vuelve transparente y la imagen no cambia, porque detrás hay un espacio 3D que proyecta exactamente la pintura. Después se puede entrar a la calle, recorrerla, medirla y volver al ojo, donde el espacio vuelve a convertirse en la pintura.

Demo: <https://crivelli-3d.vercel.app/>

Es el trabajo final de la electiva *Galileo* (Universidad Nacional de Colombia, Bogotá). Autor: **Sebastian Velandia Acevedo**.

Inspirado en el trabajo de Criminisi, Kemp y Zisserman sobre la *Flagelación* de Piero della Francesca y la *Trinidad* de Masaccio.

![Vista desde el ojo](docs/03_vista_desde_el_ojo.png)

---

## Uso

```bash
npm install
npm run dev
```

- Visor: `http://localhost:5173/`
- Marcador: `http://localhost:5173/analysis/marcador.html`. Tiene dos modos: *Líneas de fuga* y *Polígonos de la escena*. El segundo es un editor: arrastrar vértices, clic en una arista para agregar uno, `Alt`+clic para borrarlo.

| Control | Acción |
| --- | --- |
| *Ojo* (o tecla `R`) | Anima la cámara de regreso al punto de vista del pintor |
| *Caminar* | En escritorio, haz clic para mirar con el mouse. Usa `WASD` para moverte, `Shift` para correr y `Q`/`E` para bajar o subir la vista. Usa la rueda para acercar o alejar. Pulsa `Esc` para soltar el mouse. En una pantalla táctil, arrastra para mirar y usa las flechas para avanzar o retroceder. |
| *Opciones → Perspectiva y geometría → Vista en órbita* | Girar, acercar y desplazar con el mouse |
| *Maqueta* | Vista casi axonométrica de toda la reconstrucción |
| *Opciones → Superficies ocultas* | Modo fiel, colores vecinos (por defecto) o inferido |
| *Medir* | Selecciona dos puntos para obtener una distancia en metros. Al caminar, apunta con la mira y selecciona cada punto con un clic. También hay mediciones sugeridas. |
| *Opciones → Perspectiva y geometría* | Superponer la pintura, marcar lo inferido, ver aristas medidas y supuestas, líneas de fuga y planta reconstruida. Haz clic en la planta para ampliarla. |
| *Recorrido guiado* | 15 paradas en 89 s de reproducción. Usa **Pausar**, **Siguiente** o **Detener**. `Esc` también detiene el recorrido. |
| *Opciones* | Perspectiva aérea dentro de «Perspectiva y geometría», captura PNG y créditos |

Para volver a la sala desde la calle, camina hacia el cuadro y cruza el marco abierto.

### Publicar gratis

```bash
npm run build
```

Genera `dist/` con rutas relativas (`base: './'`), así que sirve igual en **GitHub Pages** (por ejemplo, subiendo `dist/` a la rama `gh-pages`) que en **Vercel** (preset de Vite, comando `npm run build` y salida `dist`). No usa backend, servicios de pago ni claves de API.

### Repetir el análisis geométrico

```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python analysis/geometry.py
```

Lee `analysis/data/lines.json` y escribe `public/data/calibration.json`, `docs/01_lineas_de_fuga.jpg`, `docs/02_planta_rectificada.png` y `analysis/out/reporte.md`. Si marcas líneas nuevas con `marcador.html`, exporta el JSON, reemplaza `analysis/data/lines.json` y vuelve a ejecutar el script.

### Repetir el modo inferido

```bash
.venv/bin/python analysis/infer.py
```

Lee `scene.json` y `calibration.json`, y hornea `public/textures/*.jpg`, `public/data/textures.json` y `docs/07_mascaras_de_evidencia.jpg` (tarda alrededor de un minuto). Hay que volver a correrlo cada vez que cambie la escena.

---

## Tres modos: lo pintado y lo inferido

Desde el ojo de Crivelli los modos son indistinguibles: todo lo que se ve es la pintura. La diferencia aparece al entrar y mirar lo que el pintor no mostró. El selector *Superficies ocultas* ofrece tres opciones:

| Modo | Qué se ve donde no hay pintura |
| --- | --- |
| **Fiel al cuadro** | Se ven las superficies asignadas a la pintura y los huecos de información. Las aristas medidas son blancas y las supuestas o inferidas son ámbar discontinuo. |
| **Colores vecinos** — por defecto | Completa las superficies ocultas con colores suavizados de las regiones adyacentes. |
| **Inferido** | Conserva más contraste de las texturas que genera `analysis/infer.py`. *Marcar lo inferido* traza en rosa las zonas completadas en ambos modos de relleno. |

Cada elemento de `scene.json` lleva:
- `evidence`: `measured`, `assumed` o `inferred`, con una `note` que explica su procedencia.
- `fill`: la regla para completar lo oculto en el modo inferido.

**Un intento descartado: la regla de las baldosas.** Se probó completar el piso oculto repitiendo una baldosa real rectificada con su ancho de 36 cm. El tono no coincide con el piso pintado y al caminar se veía el contorno de las figuras. El relleno vigente suaviza los colores de los bordes vecinos. El código de la prueba sigue en `infer.py` (`fill: "tiles"`).

Las superficies arquitectónicas propagan y suavizan el color visible más próximo. Lejos del borde, el relleno se funde con el color medio de la superficie. Los recortes de figuras conservan *Frequency Selective Reconstruction* (OpenCV xphoto) para completar oclusiones pequeñas.

**Cómo se sabe qué vio el pintor.** `infer.py` genera `public/data/proyeccion.png`. Cada píxel tiene un único identificador, resuelto por oclusión anotada y profundidad. El visor y el horneado consultan el mismo mapa, de modo que el techo y el fondo dejan de tomar los colores de los pilares y las macetas que los tapan. El respaldo del cuadro, reservado para la vista desde el ojo, cubre el 2,8 % que queda fuera de las superficies asignadas.

La lámina `docs/07_mascaras_de_evidencia.jpg` muestra la fracción asignada a cada elemento. En la edición actual es del 28 % para el piso de la calle y del 99 % para la fachada de María.

El borde lejano del muro derecho se recortó donde empieza el puente para dejar a la vista al hombre del manto dorado y la maceta. En el balcón izquierdo, las figuras se adelantaron 1,1 m respecto de su anclaje en la pared lateral. Ese desplazamiento es un supuesto para mantenerlas visibles.

---

## Siluetas, medición y museo

### Siluetas con GrabCut (`analysis/segment.py`)

Los recortes de las figuras empezaron como polígonos trazados a mano (de 6 a 49 vértices), que arrastraban fondo: la franja del pilar detrás de Gabriel, el piso entre sus alas. Ahora cada polígono a mano es solo la región de interés (`roi`) con la que se inicializa **GrabCut** (OpenCV), que separa figura y fondo modelando sus colores y cortando un grafo. El contorno resultante, simplificado a 1,5 px, reemplaza al polígono (hasta 362 vértices en Gabriel). No necesita descargar ningún modelo. Lo que GrabCut no resuelva (por ejemplo, el niño arrastra un poco del muro blanco) se corrige con el editor del marcador. `docs/11_siluetas.jpg` muestra cada resultado junto a su ROI.

Las diez siluetas de base se corrigieron a mano en el editor del marcador, partiendo de GrabCut (entre 49 y 879 vértices por figura). Quedan marcadas como `"silhouette": "manual"`, así que `segment.py` solo las modifica si se le pide una figura por nombre.

```bash
.venv/bin/python analysis/segment.py && .venv/bin/python analysis/infer.py
```

### Medir dentro de la pintura

Es la idea central de la *single view metrology* de Criminisi: cada clic es un rayo que corta el plano del elemento que toca, así que dos clics dan una distancia en metros. Desde el ojo de Crivelli equivale a medir **sobre la pintura**. Mediciones sugeridas (`src/app/measure.js`):

| Medición | Resultado |
| --- | --- |
| Ancho de una baldosa | 36 cm |
| Ancho de la calle | 2,30 m |
| La Virgen, arrodillada | 1,22 m |
| Gabriel, arrodillado | 1,23 m |
| Fraile, de pie | 1,63 m |
| Hombre del manto dorado, de pie (a 12 m del ojo) | 1,83 m |
| Profundidad del cuarto de María | 1,57 m |
| Alto del techo del cuarto | 2,03 m |
| Puente sobre la plataforma | 7,23 m |

Las etiquetas muestran las alturas **supuestas** para fijar la escala (fraile de pie, 1,65 m y Gabriel arrodillado, 1,20 m) junto a las longitudes de los segmentos trazados sobre sus recortes. La baldosa de 36 cm es una **predicción** a partir de esa escala. La validación cruza el resultado con un supuesto alternativo de 29,2 cm para la baldosa.

## Validación cruzada

| Referencia métrica | Altura del ojo |
| --- | ---: |
| Fraile de pie, 1,65 m | 1,529 m |
| Gabriel arrodillado, 1,20 m | 1,497 m |
| Baldosa de 29,2 cm, medio *braccio* florentino | 1,241 m |

Las dos referencias humanas difieren en 3,2 cm y su media de **1,513 m** fija la escala del visor. Con medio *braccio*, la altura baja alrededor de un **18 %**, por lo que la escala absoluta es sensible al tamaño supuesto de la baldosa. Las tres estimaciones comparten el horizonte. María (1,22 m de rodillas) es una predicción condicionada a la escala. El hombre del manto dorado (1,83 m) y el fraile son personas distintas. La evidencia de inconsistencia geométrica está en la dispersión de las líneas de fuga.


### El museo y la ventana de Alberti (`src/scene/museum.js`)

El cuadro de la sala funciona como la ventana de Alberti calculada. El visor conserva un ancho de calibración de 146,5 cm, una distancia de 111 cm al ojo y un punto de fuga a 1,51 m de altura. Por eso el piso de la sala es el mismo plano que el piso de la calle pintada, y la base del cuadro queda a unos 56 cm del suelo. Al llegar al ojo se oculta la cédula y el cuadro se abre. La placa de latón y el anillo señalan el punto en el piso. La maqueta conserva la línea vertical auxiliar y la esfera para leer la altura del ojo respecto del suelo.

Un portal de stencil restringe el dibujo de la calle al interior del marco cuando se mira desde la sala. Al caminar, los límites amortiguan el movimiento hacia las paredes. El marco permite cruzar en ambos sentidos una vez abierto y el paso sobre los escalones del fondo eleva al visitante hasta la plataforma. El umbral entre el marco y el piso pintado y las continuaciones de la calle se ven desde el interior. En órbita y maqueta se ocultan la sala, el portal y las continuaciones.

La sala se inspira en la [Sala 59 de la National Gallery](https://www.nationalgallery.org.uk/visiting/floorplans/level-2/room-59) y en las molduras de pietra serena del [ala Sainsbury](https://www.nationalgallery.org.uk/about-us/press-and-media/press-releases-archive/a-world-class-welcome-to-the-national-gallery-as-sainsbury-wing-reopens-after-two-years-of-closure). Tiene piso de roble, luz difusa desde el lucernario, un vano hacia una segunda sala y una banca con colisión. Las texturas se generan localmente. La cédula se dibuja a 2048 px y se reduce a 640 px antes de subirla a la GPU para respetar el presupuesto.

En Chrome a 1920 × 1080 con SwiftShader se midieron **79 llamadas de dibujo** y **1,0 fps** durante el muestreo inicial de la sala. Se activó la reducción automática a una escala de píxel de 1, sin sombras, con **72 llamadas de dibujo**. La meta de 60 fps en GPU integrada queda pendiente de una prueba en ese equipo. La sala usa un único mapa de sombras de 1024 × 1024 con filtro PCF, compatible con la versión de Three.js del proyecto.

El Crivelli cuelga solo en el muro principal, con su foco propio y aire a su alrededor. Los muros laterales y el muro posterior forman una galería decorativa de 12 obras del Renacimiento italiano (`src/scene/gallery.js`). Esas obras no se abren, no tienen modo Ojo ni mediciones.

- **Imágenes:** copias en `public/gallery/` en WebP, de 1600 px como máximo en el lado largo (sin ampliar las más pequeñas). La *Madonna della Rondine* ya no se rasteriza a 256 px: usa la misma copia de 1600 px.
- **Carga diferida:** la sala y la calle se construyen sin esperar a las imágenes. Unos 2,5 s después de abrir el visor, las obras se cargan una por una en segundo plano (con una pausa corta entre cada una para no causar tirones). En pantallas táctiles no se cargan las del muro posterior.
- **Luz:** cada obra tiene un foco de riel visible apuntando a ella y un halo cálido aditivo sobre el muro. Son materiales, no luces: la sala conserva una única luz con sombras (la del Crivelli) y ninguna obra lateral proyecta sombra. Es una decisión de rendimiento; la contrapartida es que el foco no ilumina de verdad el cuadro ni el muro.
- **Materiales:** pinturas, cédulas y halos usan `toneMapped: false`; la anisotropía es 4.
- **Cédulas:** tipografía Baskervville en un canvas de 800 × 468 px. La medida real solo se escribe cuando se conoce con certeza (Crivelli, *Rondine* y la reducción de la *Trinidad*); en las demás obras la cédula dice «Escala de exhibición aproximada».

#### Obras de la galería

Todas son reproducciones de dominio público (Wikimedia Commons).

| Autor | Obra | Fecha | Colección | Archivo en Commons |
|---|---|---|---|---|
| Carlo Crivelli | *La Madonna della Rondine* | Después de 1490 | The National Gallery, Londres · NG724.1 | [La Madonna della Rondine (The Madonna of the Swallow).jpg](https://commons.wikimedia.org/wiki/File:La_Madonna_della_Rondine_%28The_Madonna_of_the_Swallow%29.jpg) |
| Paolo Uccello | *Milagro de la hostia profanada (escena 1)* | 1465–1469 | Galleria Nazionale delle Marche, Urbino | [Paolo Uccello - Miracle of the Desecrated Host (Scene 1) - WGA23222.jpg](https://commons.wikimedia.org/wiki/File:Paolo_Uccello_-_Miracle_of_the_Desecrated_Host_%28Scene_1%29_-_WGA23222.jpg) |
| Piero della Francesca | *La flagelación de Cristo* | Hacia 1455–1460 | Galleria Nazionale delle Marche, Urbino | [Piero della Francesca 042.jpg](https://commons.wikimedia.org/wiki/File:Piero_della_Francesca_042.jpg) |
| Masaccio | *La Trinidad* | 1425–1428 | Santa Maria Novella, Florencia | [Masaccio, trinità.jpg](https://commons.wikimedia.org/wiki/File:Masaccio,_trinit%C3%A0.jpg) |
| Leonardo da Vinci | *Estudio de perspectiva para la Adoración de los Magos* | 1481 | Gallerie degli Uffizi, Florencia | [Leonardo, Studio per l'Adorazione dei Magi, Uffizi.jpg](https://commons.wikimedia.org/wiki/File:Leonardo,_Studio_per_l%27Adorazione_dei_Magi,_Uffizi.jpg) |
| Giovanni Bellini | *La agonía en el huerto* | Hacia 1458–1460 | The National Gallery, Londres · NG726 | [Bellini,Giovanni - Agony in the Garden - National Gallery.jpg](https://commons.wikimedia.org/wiki/File:Bellini,Giovanni_-_Agony_in_the_Garden_-_National_Gallery.jpg) |
| Andrea Mantegna | *La agonía en el huerto* | Hacia 1455–1456 | The National Gallery, Londres | [Mantegna, Andrea - Agony in the Garden - National Gallery, London.jpg](https://commons.wikimedia.org/wiki/File:Mantegna,_Andrea_-_Agony_in_the_Garden_-_National_Gallery,_London.jpg) |
| Antonello da Messina | *San Jerónimo en su estudio* | Hacia 1475 | The National Gallery, Londres · NG1418 | [Antonello da Messina - St Jerome in his study - National Gallery London.jpg](https://commons.wikimedia.org/wiki/File:Antonello_da_Messina_-_St_Jerome_in_his_study_-_National_Gallery_London.jpg) |
| Duccio di Buoninsegna | *La Última Cena (reverso de la Maestà)* | 1308–1311 | Museo dell'Opera del Duomo, Siena | [Duccio di Buoninsegna - Last Supper - WGA06786.jpg](https://commons.wikimedia.org/wiki/File:Duccio_di_Buoninsegna_-_Last_Supper_-_WGA06786.jpg) |
| Carlo Crivelli | *Retablo Demidoff* | sin fecha indicada | The National Gallery, Londres | [Carlo Crivelli 005.jpg](https://commons.wikimedia.org/wiki/File:Carlo_Crivelli_005.jpg) |
| Cima da Conegliano | *La incredulidad de santo Tomás* | 1502–1504 | The National Gallery, Londres · NG816 | [Cima da Conegliano London NG Incredulita STommaso 1504.jpg](https://commons.wikimedia.org/wiki/File:Cima_da_Conegliano_London_NG_Incredulita_STommaso_1504.jpg) |
| Andrea Mantegna | *La Virgen con el Niño, la Magdalena y san Juan Bautista* | Hacia 1490–1505 | The National Gallery, Londres · NG274 | [Andrea Mantegna 107.jpg](https://commons.wikimedia.org/wiki/File:Andrea_Mantegna_107.jpg) |

| | |
| --- | --- |
| ![Museo](docs/12_museo.png) | ![Mediciones](docs/13_mediciones.png) |
| ![Silueta de Gabriel](docs/14_gabriel_silueta.png) | ![Desde la calle al museo](docs/15_desde_la_calle_al_museo.png) |

---

## Imagen

- Archivo: `analysis/source/crivelli_ng739.jpg` (2996 × 4226 px). Para la web se usa una copia reducida, `public/painting/crivelli_ng739_2048.jpg`.
- Fuente: Wikimedia Commons, [*The Annunciation, with Saint Emidius - Carlo Crivelli - National Gallery.jpg*](https://commons.wikimedia.org/wiki/File:The_Annunciation,_with_Saint_Emidius_-_Carlo_Crivelli_-_National_Gallery.jpg). Crédito: National Gallery. Licencia: **dominio público**.
- La National Gallery registra 207 × 146,7 cm y fecha al pintor hacia 1430/1435 – hacia 1494. El ancho de calibración de 146,5 cm procede de la ficha de la reproducción. [Ficha de la obra](https://www.nationalgallery.org.uk/paintings/carlo-crivelli-the-annunciation-with-saint-emidius)

---

## Resultados

| Magnitud | Valor |
| --- | --- |
| Punto de fuga central | (791,4; 2284,3) px |
| Error de perspectiva | 0,44° de desviación angular media en 33 rectas (RMS de 20,6 px medido sobre las rectas prolongadas hasta el punto de fuga) |
| Distancia del ojo *f* | 2266 px (cuatro diagonales: 2212, 2217, 2273 y 2365 px) |
| Distancia de observación frente al panel real | ≈ 111 cm |
| Altura del ojo | ≈ 1,51 m (fraile: 1,53 m; Gabriel: 1,50 m) |
| Campo visual | 63° horizontal × 86° vertical |
| Tamaño de la baldosa | ≈ 36 cm |
| Homografía del piso | la DLT reproyecta con 5,7 px RMS y difiere de la analítica en 8,0 px |


| | |
| --- | --- |
| ![Líneas de fuga](docs/01_lineas_de_fuga.jpg) | ![Planta rectificada](docs/02_planta_rectificada.png) |
| ![Dentro de la calle](docs/04_dentro_de_la_calle.png) | ![Maqueta](docs/05_maqueta_con_lineas_de_fuga.png) |

`docs/06_volviendo_al_ojo.png` muestra un cuadro de la animación de regreso al ojo.

| Modo fiel | Modo inferido |
| --- | --- |
| ![Fiel](docs/08_modo_fiel.png) | ![Inferido](docs/09_modo_inferido.png) |

![Lo inferido, marcado](docs/10_inferido_marcado.png)

---

## Las matemáticas

### 1. Rectas y puntos en coordenadas homogéneas

Un punto de la imagen es **p** = (u, v, 1). La recta que pasa por dos puntos es el producto cruz **l** = **p₁** × **p₂**, y la intersección de dos rectas también: **p** = **l₁** × **l₂**. Normalizamos **l** = (a, b, c) para que a² + b² = 1; así |**l** · **p**| es la distancia en píxeles del punto a la recta.

### 2. Punto de fuga por mínimos cuadrados (SVD)

Las ortogonales (rectas perpendiculares al cuadro) deberían cortarse todas en un mismo punto **v**, es decir, **l**ᵢ · **v** = 0. Con N rectas ruidosas armamos la matriz A (N × 3) cuyas filas son las **l**ᵢ y resolvemos

  min ‖A **v**‖² sujeto a ‖**v**‖ = 1.

La solución es el vector singular derecho de A con el menor valor singular. Antes normalizamos las coordenadas (Hartley) para que el problema esté bien condicionado. El **error de perspectiva** es la distancia de **v** a cada recta (RMS y máximo, en px) y el ángulo entre cada segmento y la dirección hacia **v**. El ángulo es la medida más justa, porque no depende de qué tan lejos del punto de fuga esté el segmento.

### 3. Horizonte y punto principal

En la *costruzione legittima* de Alberti el cuadro es vertical y las ortogonales son perpendiculares a él. Entonces el punto de fuga central es el **punto céntrico**, el pie de la perpendicular del ojo al cuadro (el *punto principal* de la cámara), y el horizonte es la recta horizontal y = v_y que pasa por él.

### 4. Distancia del ojo: los puntos de distancia

**Supuesto:** las baldosas son cuadradas. Sus diagonales forman 45° con el cuadro, así que fugan a los **puntos de distancia** (cx ± f, cy) sobre el horizonte. Por eso la distancia horizontal entre el punto de fuga y un punto de distancia es exactamente la distancia del ojo al cuadro, *f*, medida en píxeles. Usamos el promedio de cuatro diagonales.

### 5. Altura del ojo

Una figura vertical de altura h, parada sobre el piso a profundidad D, cumple

  v_pie − cy = f · Hc / D  y  v_pie − v_cabeza = f · h / D,

y dividiendo, **Hc = h · (v_pie − cy) / (v_pie − v_cabeza)**, que no depende ni de D ni de f.

**Supuestos:** el fraile del fondo mide 1,65 m con gorro y Gabriel arrodillado, 1,20 m. Los dos dan casi lo mismo (1,53 y 1,50 m).

Toda la escena hereda esta escala: con una sola vista, las longitudes absolutas solo se conocen salvo un factor, y ese factor lo fija Hc.

### 6. La cámara

Usamos un modelo estenopeico con el ojo en **E** = (0, Hc, 0), mirando hacia −Z, con distancia focal f y punto principal (cx, cy). El rayo por el píxel (u, v) es

  **d** = ((u − cx)/f, −(v − cy)/f, −1).

En three.js, el frustum de la cámara del pintor es exactamente el rectángulo de la imagen. En el plano *near* n:

  left = −cx·n/f, right = (W − cx)·n/f, top = cy·n/f, bottom = −(H − cy)·n/f

Es un frustum descentrado, porque el punto de fuga no está en el centro de la pintura. La cámara del visitante interpola esos bordes con los de una cámara simétrica normal. Así, al volver al ojo, el encuadre «se convierte» de manera continua en la pintura.

### 7. Homografía del piso y planta

Un punto del piso (X, 0, −D) se proyecta en u = cx + fX/D, v = cy + f·Hc/D. En coordenadas homogéneas eso es una homografía del plano (X, D) a la imagen:

```
      [u]   [ f   cx    0   ] [X]
    w [v] = [ 0   cy   f·Hc ] [D]
      [1]   [ 0    1    0   ] [1]
```

La [planta rectificada](docs/02_planta_rectificada.png) aplica H en una cuadrícula de 1 m. Muestrea únicamente el piso a altura cero visible desde el ojo, entre 1,5 m y el arco, con X entre −3 y 4 m. El gris claro marca las superficies sin dato de piso visible. Las huellas de los muros provienen de los planos de la escena, y los puntos de las figuras representan el centro en planta de sus regiones de interés. El cono indica el campo horizontal del cuadro. La comprobación por DLT usa 11 esquinas de baldosas y difiere de la homografía analítica en 8 px RMS.

### 8. Construcción de la escena (*Tour Into the Picture*)

`public/data/scene.json` describe cada elemento como un **polígono en píxeles** más un **plano**:

- `horizontal` (y = cte): piso, plataforma y techos.
- `side` (x = cte): las fachadas paralelas a la calle.
- `frontal` (z = cte): la fachada de María, el arco, el fondo y los cartones de las figuras.

Cada plano se fija con un **ancla**: un píxel que se proyecta sobre un elemento ya construido. Por ejemplo, la pared derecha se ancla en el punto donde su base toca el piso; el techo del cuarto, en la fachada; y la pared del fondo del cuarto, en el techo. Cada vértice se lleva a 3D cortando su rayo con el plano («lifting») y el polígono se triangula con sus huecos (la puerta, el arco).

Por construcción, cada vértice visto desde el ojo cae sobre su píxel. **Por eso la vista inicial coincide con la pintura.**

### 9. Texturas proyectivas y zonas ocultas

Cada fragmento se proyecta con la matriz (proyección · vista) del pintor. Sus coordenadas NDC, llevadas a [0, 1], son la coordenada de textura dentro de la pintura: es la ventana de Alberti al revés.

Desde cualquier punto de vista, el mapa de proyección determina qué superficie recibe cada píxel pintado. Las superficies ocultas se completan con los colores de su vecindad. Las caras traseras de los cartones usan el color medio de su recorte. La opción *Marcar lo inferido* señala estas zonas en rosa.

### La logia y la columna de la esquina

La profundidad de la logia **medida sobre la pintura es de 0,71 m**, condicionada a la escala del visor. Con la homografía del piso, el pie de la columna en (1556, 3890) px fija la arista de la fachada a 2,136 m del ojo. A partir de las marcas de la cornisa frontal, el techo se sitúa a 3,637 m sobre el piso. La homografía horizontal a esa altura rectifica los encuentros de los casetones con el fondo y sitúa ese muro a 2,845 m del ojo.

El [marcador](http://localhost:5173/analysis/marcador.html) permite enfocar la logia y revisar las cinco ortogonales añadidas. El ajuste de las diez líneas de la zona da una fuga en (809,1; 2223,0) px, con un residuo RMS de 14,6 px. Queda a 63,8 px de la fuga global, por lo que los 0,71 m son una estimación en el modelo de un punto. La medición se reproduce con `python analysis/geometry.py --logia`.

La columna tiene caras frontal y lateral. En la logia, los casetones y el muro del fondo tienen máscaras de lo visible y contornos físicos que se encuentran en 3D. Los pilares quedan en la fachada. Las macetas y la jaula tienen sus propios recortes y profundidades estimadas. Los laterales, la repisa y las continuaciones de la calle se identifican como inferidos. La escena conserva íntegros los 21 elementos ajenos a la corrección de los cuatro contornos editados.

![Logia en Caminar, con los casetones y las plantas detrás de los pilares](docs/17_logia_reconstruida.png)

---

## Consistencia de la perspectiva

Las 33 ortogonales originales calibran el visor. Hay 16 segmentos adicionales en la mitad derecha, diez en la logia y seis en el cuarto. El ajuste global ampliado usa las 49 marcas. Los errores se calculan respecto del punto ajustado de cada fila.

| Zona | Rectas | Punto de fuga (px) | Error angular medio | Error máximo (px) |
| --- | ---: | --- | ---: | ---: |
| Global ampliado | 49 | (790,64; 2270,42) | 0,750° | 83,21 |
| Calle izquierda | 9 | (801,15; 2311,56) | 0,071° | 4,59 |
| Fachada de María | 20 | (778,03; 2307,87) | 0,242° | 12,07 |
| Logia | 10 | (809,15; 2223,03) | 0,234° | 30,57 |
| Cuarto de María | 6 | (811,91; 2263,97) | 0,525° | 29,40 |
| Piso | 4 | (793,98; 2121,02) | 0,657° | 36,23 |

La calle izquierda y la fachada convergen localmente entre 2308 y 2312 px de altura en la imagen. La logia converge en 2223 px, el cuarto en 2264 px y las cuatro juntas del piso en 2121 px, con más dispersión. Cada elipse muestra la sensibilidad al retirar una recta del ajuste de su zona.

Las cuatro diagonales dan una focal de **2266,45 ± 71,16 px** (media y desviación estándar muestral). Ese margen da **107,3–114,3 cm** de distancia de observación. La altura de **1,513 m** calculada a partir de las figuras queda fija al variar solo la focal, porque esta se cancela en la razón de alturas.

![Ortogonales y ajustes por zonas](docs/16_consistencia_por_zonas.png)

## Supuestos y decisiones

1. **Un único punto de fuga para el visor.** La calle y la fachada tienen fugas cercanas. La logia, el cuarto y el piso se apartan del ajuste de referencia en los valores indicados en la sección de consistencia.
2. **Baldosas cuadradas** para calcular la distancia del ojo.
3. **Alturas de las figuras:** el fraile del fondo mide 1,65 m (con gorro) y Gabriel arrodillado, 1,20 m. Fijan la escala.
4. **Escalones:** se modelan como un solo plano frontal (la contrahuella) más una plataforma horizontal. La altura que resulta, ≈ 0,6 m para tres escalones, es razonable.
5. **Pared del fondo de la logia:** se estima a 0,71 m detrás de la fachada mediante la homografía del techo. Los laterales, la repisa y la separación de los objetos se infieren de su apoyo y oclusión en la pintura.
6. **Cuarto de María:** el techo se ancla en el borde superior de la puerta (sobre la fachada) y la pared del fondo, en la línea donde termina el techo. El cuarto resulta de ≈ 1,4 m de fondo y ≈ 2 m de alto.
7. **Paredes laterales:** la pintura no es perfectamente coherente. El muro derecho no sigue exactamente una sola recta hacia el punto de fuga a lo largo de toda la calle, así que tomamos la base cercana, la más nítida. Por eso al caminar aparecen algunas juntas.
8. **Lo que no se modela:** las cornisas y los relieves conservan su representación plana, y la torre lejana va pintada sobre el fondo del cielo. Las figuras son cartones frontales recortados con polígonos trazados a mano.
9. **Profundidad del fondo:** el cielo y la ciudad lejana están en un plano a 70 m. Cualquier valor grande da la misma vista desde el ojo.

---

## Estructura

```
analysis/
  source/crivelli_ng739.jpg   imagen original (dominio público)
  data/lines.json             ortogonales, diagonales, esquinas de baldosas y figuras
  geometry.py                 punto de fuga, distancia, altura del ojo, homografía y planta
  marcador.html / .js         herramienta para marcar líneas sobre la pintura
  out/reporte.md              resumen numérico
  scene3d.py                  la geometría de la escena en Python (igual que pictureSpace.js)
  infer.py                    modo inferido: z-buffer, texturas planas, regla de baldosas e inpainting
  segment.py                  siluetas de las figuras con GrabCut
  polygonEditor.js            editor de polígonos del marcador
public/
  data/calibration.json       resultado del análisis (lo lee la escena)
  data/scene.json             polígonos y planos de la reconstrucción
  data/planta.png             planta rectificada (panel del visor)
  data/textures.json          límites y estadísticas de las texturas inferidas
  textures/                   texturas planas por elemento (modo inferido)
  painting/                   textura de la pintura (2048 px)
src/
  core/pictureSpace.js        rayos, planos, anclas, lifting y triangulación
  core/projectiveMaterial.js  shader de textura proyectiva y zonas ocultas
  core/cameras.js             cámara del pintor y cámara interpolable del visitante
  scene/perspectiveHelpers.js ventana de Alberti, ortogonales, puntos de distancia
  app/Viewer.js               modos (ojo, caminar, órbita, maqueta) y animaciones
  app/tour.js                 recorrido guiado
  app/measure.js              herramienta de medición y mediciones sugeridas
  scene/museum.js             sala de museo con el cuadro como ventana de Alberti
  scene/gallery.js            obras decorativas, marcos, cédulas y focos de la galería
  main.js, style.css, viewer.css   portada, controles del visor y superposiciones HTML
docs/                         capturas para la presentación
RESENA.md                     reseña de una página (objetivo y relación con Galileo)
```

---

## Trabajo futuro

- Cerrar el cuarto de María con caras laterales.
- Dar grosor a pilastras y cornisas.
- Explorar la sensibilidad a la escala y la distancia focal.

---

## Fuentes

- A. Criminisi, I. Reid y A. Zisserman, «Single View Metrology», *International Journal of Computer Vision* 40(2), 2000.
- A. Criminisi, M. Kemp y A. Zisserman, «Bringing Pictorial Space to Life: Computer Techniques for the Analysis of Paintings», Proceedings of Computers and the History of Art (CHArt 2002), Londres, 2002.
- Y. Horry, K. Anjyo y K. Arai, «Tour Into the Picture», *SIGGRAPH* 1997.
- M. Kemp, *The Science of Art: Optical Themes in Western Art from Brunelleschi to Seurat*, Yale University Press, 1990.
- E. Panofsky, *Galileo as a Critic of the Arts*, Martinus Nijhoff, 1954.
- L. B. Alberti, *De pictura*, 1435.

## Licencia

Código bajo licencia MIT. La imagen de la pintura es de dominio público (ver arriba).
