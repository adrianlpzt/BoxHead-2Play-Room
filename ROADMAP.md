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

- **Bug: el acorazado no se puede flanquear.** `Zombie.update()` fija
  `this.group.rotation.y = Math.atan2(dx, dz)` cada frame sin límite de
  velocidad de giro, así que la placa del acorazado siempre mira al
  jugador. El bloqueo frontal en `takeDamage()` (`dot < -0.4`) nunca falla
  a favor del jugador con balas normales — solo cae con explosivos o con
  la Nova de Hielo (que bypassa el blindaje). Arreglo: limitar el giro a
  unos 2-3 rad/s y, opcionalmente, dar vida propia a la placa para que
  salte tras varios impactos frontales. Detectado hace varias pasadas,
  todavía sin tocar.
- **CSS del arsenal sin verificar visualmente con 7 armas.** `.hud-arsenal`
  es una columna vertical; con 4 slots cabía de sobra, con 7 debería seguir
  cabiendo pero no se ha comprobado en pantalla (no hay navegador/capturas
  en el entorno de desarrollo, solo build + smoke test por curl).
- **Bundle único de ~530 KB.** Vite avisa en cada build
  ("Some chunks are larger than 500 kB"). No es un problema funcional,
  pero si el proyecto sigue creciendo merece la pena mirar
  `build.rollupOptions.output.manualChunks`.
