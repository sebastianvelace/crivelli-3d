# Reseña: el ojo matemático de Crivelli

**Sebastian Velandia Acevedo** · Electiva *Galileo*, Universidad Nacional de Colombia, Bogotá

## Objetivo

Mostrar que una pintura renacentista en perspectiva no es solo una imagen: es un **instrumento geométrico** que guarda dentro un espacio tridimensional y la posición exacta de un ojo. A partir de *La Anunciación con san Emigdio* de Carlo Crivelli (1486, National Gallery, Londres), el trabajo recupera ese espacio con métodos de la visión por computador y lo vuelve recorrible en una página web. Se puede entrar a la calle, rodear al arcángel Gabriel, asomarse al cuarto de María y, con un botón, **volver al ojo del pintor**, el único punto desde el cual todo el espacio se recompone en la pintura.

## Qué se hizo

1. Se marcaron 33 líneas que fugan hacia el fondo y se calculó su punto de fuga por **mínimos cuadrados** (coordenadas homogéneas y descomposición SVD). En las 33 líneas de la calibración, la desviación angular media es de 0,44°. Algunas juntas de las baldosas del primer plano pasan hasta a 89 px del punto de fuga. Las rectas arquitectónicas de esa muestra son más consistentes que las del piso.
2. Con las diagonales de las baldosas (los **puntos de distancia** de la *costruzione legittima* de Alberti) se obtuvo la distancia del ojo al cuadro. En el museo equivale a pararse a unos 111 cm del panel. Con alturas supuestas para dos figuras se estimó que el ojo está a unos 1,5 m.
3. Con una **homografía** se «enderezó» el piso y se obtuvo la planta de la calle vista desde arriba.
4. Se construyó la escena en three.js. Cada plano (piso, fachadas, techos) y cada figura (como un cartón recortado) recibe su trozo de la pintura por **proyección de texturas** desde el ojo. Lo que el pintor nunca mostró aparece en un color neutro.

## Relación con Galileo

- **El libro de la naturaleza.** En *El Ensayador* (1623) Galileo escribe que el universo está escrito en lengua matemática y que sus caracteres son triángulos, círculos y otras figuras geométricas. Este trabajo lee una pintura en ese mismo idioma: rectas, puntos de fuga y triángulos semejantes bastan para recuperar distancias que nadie midió.
- **La carta a Cigoli (1612).** En el debate sobre si es más noble la pintura o la escultura, Galileo defendió la pintura precisamente porque logra el **relieve** sobre una superficie plana, que es más difícil que tenerlo de verdad. El proyecto hace visible esa tesis: el relieve está en la geometría del plano, y al recorrer la escena 3D se ve cuánto «cartón» y cuánto artificio hay detrás de la ilusión.
- **El ojo como punto matemático.** Desde el punto de vista calculado, el modelo recompone la pintura. Al apartarse aparecen huecos y figuras planas. En la [Jornada Tercera del *Diálogo sobre los dos máximos sistemas del mundo* (1632)](https://www.ousia.it/SitoOusia/SitoOusia/TestiDiFilosofia/TestiHTML/Galilei/Dialogo/GiornataTerza.htm), Salviati se admira de que en Aristarco y Copérnico la razón hiciera «tanta violenza al senso», es decir, que se impusiera a lo que mostraban los sentidos.
- **Disegno: medir el 3D desde una imagen plana.** Galileo se formó en dibujo, fue amigo de Cigoli e ingresó en la [Accademia delle Arti del Disegno de Florencia](https://opac.museogalileo.it/imss/search?f=authority_group_names%3A116898&h=def&label=Accademia+delle+arti+del+disegno+%28Firenze%29&q=%2A%3A%2A&s=25) en 1613. En el [*Sidereus Nuncius* (1610)](https://library.si.edu/digital-library/book/sidereusnuncius00gali) dedujo del patrón de luz y sombra que la Luna tiene montañas y estimó que una cima superaba las cuatro millas italianas. El proyecto también recupera relieve y distancias a partir de la geometría de una imagen. En 1612 Cigoli pintó la [Luna con cráteres en la Capilla Paulina de Santa Maria Maggiore](https://press.vatican.va/various/basiliche/sm_maggiore/it/storia/cappella_borghese.htm).
- **Idealización y error.** Como en los *Discorsi*, el método parte de supuestos y mide cuánto se apartan los datos de la hipótesis.

## Fuentes

- A. Criminisi, I. Reid y A. Zisserman, «Single View Metrology», *International Journal of Computer Vision* 40(2), 2000.
- A. Criminisi, M. Kemp y A. Zisserman, «Bringing Pictorial Space to Life: Computer Techniques for the Analysis of Paintings», Proceedings of Computers and the History of Art (CHArt 2002), Londres, 2002.
- Y. Horry, K. Anjyo y K. Arai, «Tour Into the Picture», *SIGGRAPH* 1997.
- M. Kemp, *The Science of Art*, Yale University Press, 1990.
- E. Panofsky, *Galileo as a Critic of the Arts*, Martinus Nijhoff, 1954.
- Imagen: Wikimedia Commons, reproducción de dominio público de la National Gallery (NG739).
