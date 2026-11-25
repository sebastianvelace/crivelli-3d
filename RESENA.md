# Reseña: el ojo matemático de Crivelli

**Sebastian Velandia Acevedo** · Electiva *Galileo*, Universidad Nacional de Colombia, Bogotá

## Objetivo

Mostrar que una pintura renacentista en perspectiva no es solo una imagen: es un **instrumento geométrico** que guarda dentro un espacio tridimensional y la posición exacta de un ojo. A partir de *La Anunciación con san Emigdio* de Carlo Crivelli (1486, National Gallery, Londres), el trabajo recupera ese espacio con métodos de la visión por computador y lo vuelve recorrible en una página web. Se puede entrar a la calle, rodear al arcángel Gabriel, asomarse al cuarto de María y, con un botón, **volver al ojo del pintor**, el único punto desde el cual todo el espacio se recompone en la pintura.

## Qué se hizo

1. Se marcaron 33 líneas que fugan hacia el fondo y se calculó su punto de fuga por **mínimos cuadrados** (coordenadas homogéneas y descomposición SVD). La desviación angular media es de 0,44°: Crivelli construyó con mucho rigor.
2. Con las diagonales de las baldosas (los **puntos de distancia** de la *costruzione legittima* de Alberti) se obtuvo la distancia del ojo al cuadro. En el museo equivale a pararse a unos 111 cm del panel. Con dos figuras de altura conocida se estimó la altura del ojo: unos 1,5 m.
3. Con una **homografía** se «enderezó» el piso y se obtuvo la planta de la calle vista desde arriba.
4. Se construyó la escena en three.js. Cada plano (piso, fachadas, techos) y cada figura (como un cartón recortado) recibe su trozo de la pintura por **proyección de texturas** desde el ojo. Lo que el pintor nunca mostró aparece en un color neutro.

## Relación con Galileo

- **El libro de la naturaleza.** En *El Ensayador* (1623) Galileo escribe que el universo está escrito en lengua matemática y que sus caracteres son triángulos, círculos y otras figuras geométricas. Este trabajo lee una pintura en ese mismo idioma: rectas, puntos de fuga y triángulos semejantes bastan para recuperar distancias que nadie midió.
- **La carta a Cigoli (1612).** En el debate sobre si es más noble la pintura o la escultura, Galileo defendió la pintura precisamente porque logra el **relieve** sobre una superficie plana, que es más difícil que tenerlo de verdad. El proyecto hace visible esa tesis: el relieve está en la geometría del plano, y al recorrer la escena 3D se ve cuánto «cartón» y cuánto artificio hay detrás de la ilusión.
- **El ojo como punto matemático.** La ilusión solo funciona desde un punto. Fuera de él aparecen huecos, figuras planas y paredes que no cierran. Galileo insistió en que los sentidos engañan (el remo «roto» en el agua del *Diálogo*) y en que la razón matemática corrige la apariencia. Aquí ese punto se calcula, no se adivina.
- **Idealización y error.** Como en el plano inclinado de los *Discorsi*, el método parte de supuestos ideales (baldosas cuadradas, un único punto de fuga, figuras de altura típica) y luego **mide el error** contra los datos. La reconstrucción es una hipótesis matemática *ex suppositione* que se contrasta con la pintura.

## Fuentes

- A. Criminisi, I. Reid y A. Zisserman, «Single View Metrology», *International Journal of Computer Vision* 40(2), 2000.
- A. Criminisi, M. Kemp y A. Zisserman, «Bringing Pictorial Space to Life: Computer Techniques for the Analysis of Paintings», 2003.
- Y. Horry, K. Anjyo y K. Arai, «Tour Into the Picture», *SIGGRAPH* 1997.
- M. Kemp, *The Science of Art*, Yale University Press, 1990.
- E. Panofsky, *Galileo as a Critic of the Arts*, Martinus Nijhoff, 1954.
- Imagen: Wikimedia Commons, reproducción de dominio público de la National Gallery (NG739).
