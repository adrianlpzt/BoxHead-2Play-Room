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

---

## Sesión menú/móvil/mapas

- [x] **Bug spawn fuera del escenario — arreglado de raíz.** Una simulación de
  100k spawns confirmó que el spawn NO era el culpable (0% caía fuera). El
  problema real: no existía límite duro de mundo, así que un knockback fuerte
  cerca del borde o el failsafe de atasco (que empuja atravesando geometría)
  podían sacar a un zombi por la cara exterior del muro. Solución: **clamp duro
  de límites** al final de `Zombie.update` y `Player.update` — nadie puede salir
  del rectángulo jugable pase lo que pase. El spawn además nace con clamp dentro.
- [x] **Menú de inicio** (`core/Menu.js`) — estado `menu` que envuelve el juego.
  Partida nueva (pide nombre 1ª vez, persistente), Ranking, Multijugador
  (placeholder honesto), Instrucciones. Game over rehecho con registro de
  puntuación y botones reintentar/menú.
- [x] **Ranking local** (`core/Ranking.js`) — top 10 en localStorage.
- [x] **Controles táctiles / móvil** (`core/TouchControls.js`) — dos joysticks
  flotantes (mover / apuntar-disparar) + botones Q/E/dash/ruleta. Auto-activa en
  pantallas táctiles. SIN PROBAR en móvil real: funcional en código, el feeling
  táctil está por confirmar.
- [x] **Mapas distintos** (`world/Maps.js`) — 3 arenas: La Caja (original),
  Templo (rejilla de columnas), Reactor (núcleo central). Selector en el menú,
  `Arena.rebuild` reconstruye reutilizando los arrays existentes. El jugador se
  empuja fuera de muros al arrancar (crítico en Reactor).

## Pendiente / sin trabajar aún

### Online (FASE PROPIA — no una feature suelta)
Requiere servidor con estado (WebSocket) o P2P con host (WebRTC), netcode
(reconciliación, interpolación), y separar simulación de render. Con 150 zombis
mandar todo cada frame satura la red. Plan recomendado: empezar por **co-op P2P
con host** (un jugador es la autoridad) antes que servidor autoritativo. Semanas
de trabajo hecho bien; se aborda como fase, no intercalado.

### Roguelike mode (NUEVO — a diseñar)
Idea a desarrollar: una tirada = varias oleadas con **mejoras elegibles entre
rondas** (subir cadencia, vida máxima, daño explosivo, velocidad de dash…),
muerte permanente, y quizá modificadores de arena aleatorios (más oscuridad, más
demonios, barriles infinitos). Encaja bien con lo que ya hay: el combo, los
apagones y los arquetipos dan variables de sobra para escalar. Decisiones
abiertas: ¿mejoras con carta a elegir 1 de 3 estilo Vampire Survivors / Slay the
Spire? ¿run corre en un mapa fijo o rota? ¿las mejoras son la progresión o
conviven con el desbloqueo por combo actual?

### ¿Comprar armas al final de ronda vs. el sistema actual? (a decidir)
Pregunta de Adrián. Mi lectura honesta como diseño:

- **Sistema actual (desbloqueo + munición por combo):** premia jugar bien EN
  TIEMPO REAL. Mantener la cadena es lo que te da el arsenal y las balas. Es
  tenso, inmediato, y muy fiel al arcade original de Boxhead. Contra: si pierdes
  el combo en una oleada mala, te quedas seco y entras en espiral (ya mitigado
  con los pickups de suelo).
- **Comprar entre rondas (tienda):** premia la ESTRATEGIA. Acumulas puntos como
  moneda y decides en qué gastarlos en la pausa entre oleadas. Da control y
  planificación, reduce la frustración del "me quedé sin nada", y es la base
  natural para el roguelike (la tienda ES el momento de mejora). Contra: rompe
  el ritmo arcade, mete una pantalla de menú cada ronda, y quita algo de la
  tensión de "gestiono la munición mientras me comen".

**Mi recomendación:** no elegir uno u otro globalmente, sino por MODO. El modo
arcade actual se queda como está (es coherente y bueno). El **roguelike estrena
la tienda/mejoras entre rondas** — ahí la compra tiene todo el sentido y no
canibaliza el arcade. Así cada modo tiene su identidad económica en vez de un
compromiso tibio para ambos.

---

## Sesión: rework del arcade estilo Boxhead original

- [x] **Multiplicador con decay acelerado.** Se separó multiplicador y racha:
  cada baja sube el multiplicador (hasta x99) y rellena una barra de
  mantenimiento que drena a `0.25 + mult·0.015` por segundo — a x1 dura ~4s, a
  x50 apenas ~1s. Al vaciarse, el multiplicador baja UN escalón (no a x1 de
  golpe). Fuerza el playstyle agresivo del original: para sostener un
  multiplicador alto hay que matar sin parar.
- [x] **Milestones de desbloqueo reescalados** (antes lineales x2-x8, ahora
  hitos altos): barril x3, escopeta x5, barricada x8, mina x10, uzi x15,
  granada x20, torreta x30, cohete x50. Magias: Titán x12, Nova x35.
- [x] **Upgrades de arma por milestone extremo (todos > x50).** Sistema
  `effWeapon()`: fusiona props de `upgrade` sobre la base sin mutar WEAPONS
  (estado por partida en `game.upgraded`). Tabla:
  - Pistola → **Dual Pistols** (x55): +daño, mucha más cadencia, 2 balas.
  - Súper Escopeta (x60): 9 perdigones, más dispersión y knockback 12.
  - Minigun (x65): cadencia casi duplicada, dispersión reducida.
  - Granadas de Racimo (x70): al detonar esparce 5 submuniciones encadenadas
    (`cluster` en Grenades.js; las hijas no re-fragmentan).
  - Torreta Pesada (x75): x2 vida y munición, +cadencia, +daño, color ámbar.
- [x] **Regeneración de vida.** Tras 5 s sin recibir daño, +5 vida/s
  (`timeSinceHurt` en Player). Se reinicia con cada golpe.
- [x] **Vida y esencia como barras flotantes 3D** sobre el jugador
  (`entities/FloatingBars.js`), billboard hacia la cámara, fuera del overlay.
  La vida vira ámbar→rojo al bajar.

---

## PLAN — Online (Fase A) + rebalanceo de oleadas

Acordado con Adrián: el próximo bloque de trabajo (a implementar, probablemente
con Opus) cubre estas dos piezas. Documentado aquí con detalle suficiente para
empezar sin tener que releer toda la conversación.

### 1. Rebalanceo de densidad de oleadas (prioridad alta, barato)

**Diagnóstico con números reales** (no intuición): en la oleada 20 el
presupuesto es 96 zombis, soltados a 8,3/s → todo el lote sale en 11,5s. Pero
la distancia media esquina→centro (34 unidades) tarda ~10-12s en cruzarse
caminando a la velocidad de un zombi normal. El lote entero llega casi de
golpe, se limpia rápido (los desbloqueos por multiplicador son permanentes
aunque el combo decaiga después, así que el arsenal en oleada 20 ya es fuerte),
y luego hay un hueco muerto hasta el siguiente lote. Es un ciclo de
atracón-y-ayuno, no un flujo sostenido — rompe los combos largos, que a
multiplicador alto necesitan una baja cada 1-1,5s. Además, `spawnInterval`
toca su suelo (0,12s) desde ~oleada 16: a partir de ahí el único mando que
queda es el presupuesto total, no la cadencia.

**Cambios propuestos** (`systems/WaveManager.js`, `world/Arena.js`):
1. **Puntos de spawn dinámicos más cercanos al jugador**, no solo las 4
   esquinas fijas. P. ej. un anillo de puntos calculado a partir de la
   posición actual del jugador (radio medio, no encima suyo ni al otro lado
   del mapa) — es la palanca de mayor impacto: reduce el tiempo de viaje de
   ~10-12s a unos pocos segundos.
2. **Más puntos de spawn** (8 en vez de 4) para evitar que el lote llegue
   agrupado desde un único vector.
3. **Trickle continuo en vez de front-loaded**: en lugar de soltar todo el
   presupuesto al principio de la oleada a intervalo fijo, mantener una
   población mínima objetivo cerca del jugador — soltar más cuando la
   densidad cercana cae por debajo de un umbral, no solo por temporizador.
4. **`MAX_ALIVE` y crecimiter del presupuesto para oleadas muy altas**: 150
   ya no es el cuello de botella a la 20 (presupuesto 96 < tope), pero para
   "más dificultad" real en tiradas largas, subir el crecimiento del
   presupuesto y/o el propio tope en oleadas avanzadas.

### 2. Multijugador online — Fase A (señalización + sala)

Modelo acordado: **host-P2P estilo COD antiguo**, no servidor autoritativo
(reescribiría toda la simulación). El host juega su partida normal; el
invitado dejará de simular zombis y solo pintará lo que el host le manda.
Ancho de banda comprobado: snapshot compacto ~9 bytes/zombi × 150 a 15Hz ≈
20KB/s — no es el problema.

**Fase A — objetivo de esta pasada: que dos navegadores se digan "hola" por
un código de sala. Cero lógica de juego todavía.**

- **Servicio de señalización nuevo en Railway** (proyecto ya existe,
  `03af9a16-d97a-43d8-bfd6-e4f8109c733e` — crear un segundo servicio, no
  tocar el del juego). Node mínimo con `ws`: `create-room` devuelve un
  código corto, `join-room(code)` conecta al segundo socket a la sala y
  reenvía SDP offer/answer + candidatos ICE entre ambos. En cuanto el
  WebRTC DataChannel queda establecido, la señalización ya no hace falta —
  los datos van directos entre los dos PCs.
- **Cliente**: `src/core/Net.js` — envuelve `RTCPeerConnection` +
  `RTCDataChannel`, usa STUN público (`stun:stun.l.google.com:19302`),
  intercambia SDP/ICE vía el WebSocket de señalización, expone una interfaz
  por eventos (`onConnected`, `onData`, `send`).
- **Sin TURN en esta primera versión** — decisión consciente. Algunos NAT
  estrictos no podrán conectar directo; se acepta con un mensaje claro de
  error en vez de gastar en infraestructura de relé antes de validar que el
  resto funciona.
- **`core/Menu.js`**: la pantalla "Multijugador" (hoy placeholder) pasa a
  tener Crear sala (genera código, espera) / Unirse a sala (introducir
  código).
- **Entregable de la Fase A**: dos pestañas/dispositivos intercambian un
  mensaje de prueba por el DataChannel usando un código de sala. Nada de
  zombis, nada de sincronización de mundo todavía.

**Fases siguientes (no en esta pasada, solo para contexto):**
- Fase B: el host manda snapshots del mundo; el invitado solo pinta (modo
  espectador).
- Fase C: el invitado manda sus inputs; el host genera un segundo jugador
  real que los obedece.
- Fase D: pulido — predicción local en el invitado si el input-a-host-y-
  vuelta se nota, solo después de que la tubería funcione de punta a punta.

---

## Sesión: rebalanceo de oleadas + Online Fase A

### Completado

- [x] **Rebalanceo de densidad de oleadas.** Dos mecanismos simultáneos:
  1. **Spawn clásico ampliado**: 8 puntos en vez de 4 (esquinas + bordes),
     presupuesto más agresivo (oleada 20: 126 zombis → 126, oleada 30: 211,
     oleada 50: 411).
  2. **Trickle de densidad** (NUEVO): vigila cuántos zombis hay a <14u del
     jugador; si son menos del `nearbyTarget` (escalado con la oleada, hasta
     20 en oleadas altas), rellena desde puntos a **media distancia** (10-18u)
     por detrás/laterales del jugador, a un ritmo proporcional al déficit.
     No gasta presupuesto: es spawn extra para mantener el flujo. Esto elimina
     el hueco muerto entre olas que impedía sostener combos largos.
  3. **Spawn cercano** (`Arena.nearSpawn`): genera un punto a 10-18u del
     jugador en un ángulo aleatorio, pero nunca justo delante (±90° de donde
     mira), para que no se materialicen a la vista.
- [x] **Online Fase A — señalización + código de sala + WebRTC handshake.**
  - **Servidor** (`server/signal.mjs`): WebSocket con `ws`, protocolo JSON.
    `create` genera código de 4 caracteres, `join` empareja, `signal` reenvía
    SDP/ICE. Limpieza de salas zombis cada 5 min. Desplegado como segundo
    servicio en Railway (`boxhead-signal`,
    `f447f9e8-0518-4ed2-bd00-4c90bfd89319`), dominio
    `boxhead-signal-production.up.railway.app`.
  - **Cliente** (`src/core/Net.js`): envuelve WebSocket + RTCPeerConnection +
    DataChannel. STUN público (Google), sin TURN. API por callbacks
    (`onConnected`, `onData`, `send`, `onDisconnected`).
  - **Menú** (`core/Menu.js`): "Multijugador" ahora tiene **Crear sala** y
    **Unirse** con campo de código. Muestra el estado en tiempo real (sala
    creada, esperando, conectado, error).
  - **Entregable**: dos pestañas/dispositivos intercambian un `hello` con su
    nombre por DataChannel usando un código de sala. Cero lógica de juego —
    eso es Fase B/C.

### Infraestructura Railway actual (2 servicios en el mismo proyecto)

| Servicio | ID | Dominio | Root | Función |
|---|---|---|---|---|
| boxhead-3d | b18388ec… | boxhead-3d-production.up.railway.app | `/` (raíz) | El juego (Vite build estático) |
| boxhead-signal | f447f9e8… | boxhead-signal-production.up.railway.app | `/server` | Señalización WebSocket |

### Fases siguientes del online (no implementadas)

- **Fase B**: el host manda snapshots del mundo (posiciones de zombis,
  barriles, proyectiles); el invitado solo pinta. Modo espectador.
- **Fase C**: el invitado manda inputs (`{move, aim, fire, spell}`); el host
  genera un segundo jugador real (`Player2`) que los obedece. Ambos ven a
  ambos jugadores y a los mismos zombis.
- **Fase D**: predicción local — el invitado mueve su personaje localmente sin
  esperar al host, y reconcilia cuando llega la confirmación. Solo si el
  input-lag se nota en la práctica (con DataChannel `ordered:false` debería
  ser <50ms en la mayoría de conexiones domésticas).

---

## Online Fase B+C — partida cooperativa funcional

- [x] **HostSession** (`net/HostSession.js`): crea Player2 como avatar del
  guest en la simulación del host. Envía snapshots del mundo entero a 15Hz
  (todos los zombis, barriles, minas, torretas, pickups, cadáveres + ambos
  jugadores). Recibe inputs del guest y los aplica a Player2 (movimiento,
  apuntado, disparo, dash, magias). Añade Player2 al CameraRig para que la
  cámara encuadre a ambos.
- [x] **GuestSession** (`net/GuestSession.js`): recibe los snapshots y
  sincroniza entidades ghost (crea/actualiza/destruye objetos Three.js sin
  simular IA ni física). El player local se mueve por predicción
  (respuesta instantánea al input) y se corrige suavemente con los datos
  del host. Envía inputs empaquetados cada frame.
- [x] **Snapshot** (`net/Snapshot.js`): serialización compacta del estado
  del mundo (posiciones cuantizadas a cm, rotaciones a 1 decimal).
- [x] **Zombie persigue al más cercano** de ambos jugadores y ataca a
  cualquiera de los dos si está en contacto.
- [x] **main.js**: rama guest/host en el bucle — el guest no simula mundo
  (sin oleadas, sin IA, sin explosiones), solo mueve su player y pinta lo
  que dice el snapshot. El host ejecuta la simulación completa más el
  update de la sesión de red.
- [x] **Desconexión limpia**: al volver al menú se destruyen los ghosts/
  Player2 y se cierra la conexión.

### Qué falta aún del online
- **Fase D (predicción)**: si el input-lag se nota, añadir reconciliación
  local en el guest. Con DataChannel unreliable debería ser <50ms en la
  mayoría de conexiones — quizá no haga falta.
- **Reconexión**: si el WebRTC se cae, no hay intento de reconectar.
- **Más de 2 jugadores**: la señalización ya solo acepta 1 host + 1 guest.
