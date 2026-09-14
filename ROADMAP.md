# Roadmap

Orden de prioridad fijado por Adrián: **1. Armas → 2. Magias → 3. Enemigos
→ 4. Mapas**. Dentro de cada bloque, se ha ido acotando por coste técnico
real en vez de metiendo todo a la vez — ver el porqué en cada sección.

## Estado actual (commit `73cc3fb`)

| Bloque | Hecho | Pendiente |
|---|---|---|
| 1. Armas | Lanzagranadas, Lanzacohetes, Minas | Torreta, Barricadas, Rifle de plasma |
| 2. Magias | Pisar del Titán, Nova de Hielo | Vórtice Gravitatorio, Círculo de Almas |
| 3. Enemigos | — | Nigromante, Volador, Engendro de baba, Juggernaut |
| 4. Mapas | — | Tight, Columns, Rooftop, Reactor |

---

## 1. Armas

### Hecho
- **Lanzagranadas** (`Grenades.js`) — arco parabólico real en Y, rebota en
  muros y suelo, detona a 1,2 s o al contacto directo.
- **Lanzacohetes** (extensión de `Weapons.js` vía flag `splash`) — bala que
  al impactar detona con `explodeAt` en vez de dañar a un único objetivo.
  Ignora el blindaje del acorazado (la explosión no rebota).
- **Minas** (`Mine.js`) — se arman en 1 s, detonan por proximidad (zombi o
  jugador), encadenan con explosiones cercanas.

### Pendiente — por qué se dejó fuera
- **Torreta**: entidad autónoma con su propia IA de apuntado (buscar
  objetivo más cercano, rotar, disparar). No reutiliza nada existente tal
  cual — hay que decidir cómo interactúa con el `SpatialHash` para elegir
  blanco sin recorrer todos los zombis cada frame.
- **Barricadas**: es básicamente una `Crate` colocable por el jugador — el
  más barato de los tres pendientes, buen candidato para la próxima pasada
  de armas.
- **Rifle de plasma**: no es una bala, es un rayo continuo que debe
  atravesar a todos los enemigos en línea recta. Ahora mismo el único
  modelo de colisión que existe es punto-contra-círculo (balas) o
  radio-contra-círculo (explosiones); un rayo necesita segmento-contra-
  círculo, que no existe en `Collision.js` todavía.

## 2. Magias

### Hecho
- **Barra de Esencia** — recarga con combos (`+2 + multiplicador×0.6` por
  baja) y con orbes que sueltan los zombis (22% de probabilidad por baja,
  independiente del resto de sueltas).
- **Pisar del Titán** (`Q`) — cono frontal de 110° y radio 5,5, daña y
  empuja con caída lineal por distancia, levanta baldosas decorativas.
- **Nova de Hielo** (`E`) — congela todo en radio 6 durante 3 s (quedan
  inmóviles, tintados en cian). Cualquier daño mientras están congelados es
  crítico garantizado (×3, ignora blindaje) y los hace añicos.

### Pendiente — por qué se dejó fuera
- **Vórtice Gravitatorio**: aplicar una fuerza de atracción continua hacia
  un punto sin que se rompa la resolución de colisión contra muros
  mientras el zombi es arrastrado (`resolveCircleBox` asume movimiento
  propio del enemigo, no una fuerza externa empujándolo cada frame).
- **Círculo de Almas**: hoy solo hay dos bandos — el jugador y la horda.
  Esqueletos que luchan *contra* otros zombis introduce una tercera
  facción con targeting amigo-enemigo, un concepto que no existe en
  ninguna parte del código actual (`Zombie.update()` persigue
  incondicionalmente `game.player.position`).

## 3. Enemigos — sin empezar

Por coste, de menor a mayor:

- **Engendro de baba**: el demonio (`devil`) ya se para y dispara a
  distancia (`cfg.ranged` en `Zombie.js`) — es literalmente el mismo
  patrón con textura distinta, más un debuff de velocidad en `Player.js`
  (campo nuevo, no existe) y un tipo de decal "charco" en `Decals.js`
  (hoy solo hay `blood`, `burn`, `scorch`).
- **Juggernaut**: cubo 3×3, ignora el knockback (una línea: no aplicar
  `opts.knock` si `type === 'juggernaut'`) y atraviesa cajas/barriles en
  vez de chocar — hay que decidir si simplemente no se le aplica
  `resolveCircleBox` contra `game.walls`/`game.barrels`, dañándolos al
  pasar por encima en su lugar.
- **Nigromante**: primera IA que *huye* del jugador en vez de perseguir.
  `Zombie.update()` solo sabe ir hacia `game.player.position`; hace falta
  una rama de movimiento nueva, más la habilidad de resucitar cadáveres o
  invocar refuerzos cada 5 s.
- **Volador** (gárgola/murciélago): el más caro de los cuatro. Todo el
  juego vive en un plano XZ con colisión en `y = 0`
  (`resolveCircleBox`, `distXZ`, el raycast de apuntado contra
  `groundPlane`). Un enemigo a `y = 2.5` es la primera entidad con altura
  real — afecta a colisión, a qué armas pueden alcanzarlo, y
  probablemente a la cámara.

## 4. Mapas — sin empezar

- **Tight / Columns / Reactor**: básicamente `Arena.js` con otra
  disposición de `#buildCrates()`/`#buildWalls()` y otra textura de
  `#tileTexture()`. Barato — es contenido, no arquitectura nueva.
- **Rooftop** (bordes abiertos, caída al vacío): el único de los cuatro
  que no es solo reordenar cajas. Ahora mismo `Arena` siempre tiene los
  cuatro muros perimetrales cerrando el nivel; quitarlos exige un primer
  estado de "fuera de límites" — detectar que alguien ha cruzado el borde
  y darle una caída en Y con su propia física, algo que no existe en
  ningún sitio del código actual.

---

## Deuda técnica conocida (no roadmap de features, pero pendiente)

- **Bug: zombis atascados en esquinas, bloquean el fin de ronda.**
  Reportado por Adrián: algunos zombis quedan "detrás de los muros" y las
  balas no llegan. Diagnóstico (sin repro en vivo, por lectura de código):
  el sistema anti-atasco de `Zombie.js` recalcula la dirección de
  deslizamiento **cada frame contra la posición actual del jugador**, no
  contra una dirección fija de "bordear este obstáculo". Funciona bien
  contra un muro plano; contra un vértice de 90° (todas las cajas y
  pilares del mapa son rectangulares, no hay nada redondo) puede quedar
  oscilando indefinidamente si el jugador está relativamente parado —
  cada frame el ángulo hacia el jugador cambia lo justo para que el
  chequeo "¿sigo atascado?" parpadee entre sí/no sin llegar a rodear la
  esquina de verdad. Desde la posición fija del jugador, ese zombi está
  efectivamente al otro lado de un vértice sólido de forma persistente.
  **Arreglo propuesto**: que el deslizamiento, una vez activado, mantenga
  una dirección fija durante todo el intento de rodeo (wall-following de
  verdad) en vez de recalcularla cada frame. Añadir además un **failsafe
  duro**: atasco acumulado >6-8s → empujón directo hacia el jugador,
  garantiza que ninguna ronda puede quedar bloqueada pase lo que pase con
  el resto de la lógica.
- **Bug: el acorazado no se puede flanquear.** (Sin cambios desde la
  última vez — ver más arriba.)
- **CSS del arsenal sin verificar visualmente con 7 armas.**
- **Bundle único de ~530 KB.**

---

## Próxima tanda pedida (priorizada)

- [x] **1. Fix del atasco en esquinas** — `Zombie.js`: el deslizamiento ahora
  fija UNA dirección de rodeo al bloquearse (wall-following real) en vez de
  recalcularla cada frame contra el jugador; invierte de lado si no progresa
  tras 0,8 s. Failsafe duro: >7 s de atasco acumulado → empujón directo hacia
  el jugador ignorando muros. Además `Arena.randomSpawn` empuja el punto de
  aparición fuera de cualquier muro/caja para no spawnear dentro de geometría.
- [x] **2. Audio + música** — motor de música en `Audio.js` (clase `AudioKit`):
  drone grave en dos capas desafinadas con un filtro cuyo brillo sube con la
  intensidad (nº de enemigos), pulso de kick sintetizado que acelera con la
  presión, y stinger de acorde ascendente al despejar oleada (`waveCleared`).
  Bus de música propio bajo el master, se silencia con `M` como el resto.
  Honesto: es tensión de arena, no melodía — para eso harían falta pistas
  reales aportadas.
- [x] **3. VFX de magias** — sistema `Shockwaves.js` (anillos de geometría
  propia que crecen y se desvanecen, pool de 14). Nova de Hielo: doble anillo
  + esquirlas sobre cada congelado. Pisar del Titán: onda de polvo + grieta
  radial en el suelo (nuevo `Decals.crack`). Todas las explosiones ganan
  también su anillo vía `explodeAt`.
- [x] **4. Apagones automáticos** — `main.js`: máquina de estados
  clear→warn→blackout. A partir de la oleada 6, cada 42 s la luz parpadea 2,5 s
  de aviso y se corta 24 s obligando a la linterna. La tecla `L` sigue
  funcionando como override manual (desactiva el ciclo automático).

### Pendiente en esta tanda

- [x] **5. Barricadas** — `Arena.spawnBarricade`: una `Crate` colocable de 2×2×1
  vóxeles, hereda daño de balas/explosión y el desregistro de su AABB. Arma 6.
- [x] **6. Torreta** — `entities/Turret.js`: cabezal que gira hacia el enemigo
  más cercano (vía spatial hash), dispara ráfagas por el pool de balas
  (`WeaponSystem.spawnBullet`, método nuevo), se agota a los 60 disparos y la
  horda la derriba a golpes. Arma 7.
- [x] **7. Rifle de plasma** — `systems/Plasma.js`: hitscan puro que atraviesa a
  TODOS los enemigos en línea recta hasta el primer muro (colisión
  segmento-contra-círculo nueva en `Collision.js`: `segPointDist2` +
  `rayWallDist`). Daño marcado como explosivo → derrite la placa del acorazado.
  Arma 10 (tecla `0`). Haz visual efímero.

### Pendiente

8. **Vórtice Gravitatorio y Círculo de Almas** (magias que faltan —
   arquitectura nueva de verdad en ambos).
9. **Menú principal** — estado nuevo antes de `playing`, autocontenido.
10. **Más mapas** (Tight/Columns/Reactor primero, Rooftop es el caro).
11. **Ruleta de selección de arma estilo GTA** (slowmo + blur + radial) —
    requiere postprocesado (`EffectComposer`), que el proyecto aún no tiene.
    Ahora más útil que antes: con 10 armas, un selector radial gana peso.
12. **Enemigos nuevos** (Nigromante, Volador, Baba, Juggernaut) — el Volador
    sigue siendo el ítem más caro (primera vez con altura real en Y).

> Con el rifle de plasma quedan **cerradas las 3 armas pendientes del bloque 1**.
> El arsenal completo son 10 armas: pistola, escopeta, uzi, barril, mina,
> barricada, torreta, granada, cohete, plasma (teclas 1-9 y 0).

> Nota tras esta tanda: los VFX de magia, los apagones y la música **no se han
> podido verificar visual/sonoramente** (el entorno de desarrollo no tiene
> navegador — solo build + smoke test por HTTP). Compilan y arrancan; el
> comportamiento en pantalla habrá que confirmarlo jugando.


---

## Sesión de correcciones (post-armas)

- [x] **Atasco en esquinas — segundo intento.** El primer arreglo (rodeo
  perpendicular al jugador) redujo el problema pero no lo eliminó: esa
  perpendicular es al objetivo, no al muro. El segundo calcula la dirección de
  rodeo a partir de la **normal real del obstáculo** (la componente del avance
  que la colisión se comió apunta hacia dentro del muro; su perpendicular corre
  a lo largo de la pared), y el failsafe pasó a ser **persistente**: desde 4 s
  de atasco acumulado empuja hacia el jugador atravesando geometría un poco cada
  frame, sin auto-resetearse, hasta despegarse. Pendiente de confirmar en vivo.
- [x] **Rifle de plasma ELIMINADO.** No se veía bien (orientación del haz).
  Retirado por completo: `systems/Plasma.js` borrado, referencias limpiadas,
  arsenal de vuelta a 9 armas. Las utilidades `segPointDist2`/`rayWallDist` se
  conservan en `Collision.js` (genéricas, útiles a futuro).
- [x] **Ruleta de selección de arma** (`core/WeaponWheel.js`) — overlay SVG
  radial estilo GTA. Se abre manteniendo `Tab`, ralentiza el tiempo a 0,2×
  (slowmo real), resalta el sector bajo el cursor y selecciona al soltar. Solo
  muestra armas desbloqueadas. El "blur" es oscurecido + viñeta + backdrop-
  filter por CSS, no postprocesado (el desenfoque óptico real necesitaría
  `EffectComposer`, pendiente por si el CSS no convence en pantalla).
