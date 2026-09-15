# Arquitectura — Boxhead 3D

Documento de continuidad completo. Si se pierde el hilo de conversación
donde se construyó esto, este archivo + `README.md` + `ROADMAP.md` deberían
bastar para retomarlo sin preguntar nada.

Stack: **Vite 5 + Three.js r169**, JavaScript puro (sin TypeScript), sin
frameworks de UI. Todo el arte es procedural (`BoxGeometry`/`CylinderGeometry`
+ texturas de `<canvas>`), todo el sonido es síntesis con Web Audio API. Cero
assets externos, cero dependencias de runtime salvo `three`.

Commit de referencia de este documento: `73cc3fb` (rama `main`).

---

## 1. Despliegue — infraestructura real, con IDs

- **GitHub:** `adrianlpzt/BoxHead-2Play-Room`, rama `main`, repo público.
- **Railway** (workspace *Adrián López's Projects*,
  `e0828f46-a510-4521-8219-fb97799851cd`):
  - Proyecto `boxhead-3d` — `03af9a16-d97a-43d8-bfd6-e4f8109c733e`
  - Environment `production` — `2951b277-2448-44f9-b7f2-6a4538d8f431`
  - Servicio `boxhead-3d` — `b18388ec-d561-45f0-8170-5ea3f7aa8003`
  - Conectado directamente al repo de GitHub (no Docker, no CLI): cada push
    a `main` dispara un build con **Railpack** (el builder actual de
    Railway, sucesor de Nixpacks) que detecta Node vía `package.json`,
    corre `npm install`, `npm run build` y luego `npm run start`.
  - Dominio público generado por Railway:
    `boxhead-3d-production.up.railway.app` — DNS y TLS gestionados por
    ellos, sin registros que configurar.
- **`vite.config.js`** — pieza crítica, sin ella el despliegue no sirve
  nada:
  ```js
  export default defineConfig({
    preview: { allowedHosts: true },
  });
  ```
  `vite preview` (lo que ejecuta `npm run start`) rechaza por defecto
  cualquier petición cuyo header `Host` no sea `localhost`/`127.0.0.1`
  (protección anti DNS-rebinding). Railway enruta con su propio hostname
  público, así que sin este flag toda petición real devuelve
  `403 Blocked request`. Se detectó y arregló en producción — si reaparece
  el error, es que esta config se ha perdido o se ha vuelto a poner
  `allowedHosts` como array sin incluir el dominio real.
- **`package.json`** scripts relevantes:
  ```json
  "build": "vite build",
  "start": "vite preview --host 0.0.0.0 --port ${PORT:-4173}"
  ```
  El `${PORT:-4173}` es obligatorio: Railway inyecta `PORT` (típicamente
  8080) y sin leerlo el contenedor escucha en el puerto equivocado.

### Cómo se ha estado subiendo el código

No hay integración de GitHub con credenciales propias en el entorno de
desarrollo — el flujo real ha sido:
1. Editar en el sandbox, `npm run build` para verificar, a veces un smoke
   test local (`npm run start` en background + `curl localhost:4173`).
2. `git add -A && git commit -m "..."`.
3. `git push` a una URL con un **token de acceso personal de GitHub de
   grano fino** embebido (`https://usuario:TOKEN@github.com/...`), pedido
   puntualmente al usuario, con permiso **Contents: Read and write**
   restringido a este único repo. El token nunca se guarda en
   `.git/config` (se pasa inline en el comando de push, no vía
   `git remote add` con credenciales).
4. Railway detecta el push solo y redespliega. Verificación vía las
   herramientas MCP de Railway: `list-deployments` → `get-status` →
   `get-logs` (build y luego deploy) hasta ver `SUCCESS` y logs de arranque
   limpios.

Para cambios de un único archivo pequeño, la alternativa sin token ha sido
crear/editar el archivo directamente desde la web de GitHub
("Commit directly to the main branch").

---

## 2. Estructura de archivos

```
index.html                  canvas + overlay del HUD (DOM puro, pointer-events:none)
vite.config.js               allowedHosts:true — ver sección 1
src/style.css                estilos del HUD
src/main.js                  bucle, escena, luces, cámara, combo, estado de partida — el orquestador
src/core/Input.js             teclado/ratón, eventos de un solo frame (tapped vs pressed)
src/core/HUD.js               lee `game` cada frame y escribe al DOM
src/core/Collision.js         círculo-vs-AABB en XZ, helpers matemáticos (lerp/clamp/rand/distXZ)
src/core/SpatialHash.js       cuadrícula espacial 2D, celda=2, para separación y colisión de balas
src/core/CameraRig.js         seguimiento de cámara — ya generalizado a N objetivos (ver 4)
src/world/Arena.js            suelo, muros, pilares, cajas destructibles por vóxeles
src/entities/Player.js        modelo, movimiento, dash, linterna
src/entities/Zombie.js        los 4 arquetipos de enemigo + estado congelado + cadáver del bomber
src/entities/Barrel.js        barril: empuje físico, mecha, explosión
src/entities/Mine.js          mina de proximidad
src/entities/Pickup.js        recogidas que sueltan los zombis (ammo/salud/esencia)
src/systems/Weapons.js        pistola/escopeta/uzi/cohete — pool de balas compartido
src/systems/Grenades.js       granadas — arco en Y real, rebote, mecha
src/systems/Fireballs.js      proyectiles a distancia del demonio
src/systems/Spells.js         Pisar del Titán y Nova de Hielo
src/systems/Explosion.js      explodeAt() — daño radial compartido por TODO lo que explota
src/systems/WaveManager.js    oleadas: presupuesto de enemigos, mezcla de arquetipos
src/systems/Particles.js      pool de 900 cubitos pequeños con gravedad
src/systems/Debris.js         pool de trozos grandes que rebotan y se posan (dos instancias, ver 10)
src/systems/Decals.js         sangre/quemaduras persistentes pintadas sobre un canvas del suelo
src/systems/Audio.js          todo el sonido — Web Audio API pura
```

~3360 líneas de JS en `src/` a fecha de este commit.

El objeto `game` en `main.js` es el punto de encuentro de todo: cada
sistema recibe `game` como parámetro en su `update(dt, game)` y lee/escribe
lo que necesita ahí (`game.zombies`, `game.player`, `game.audio`,
`game.shake()`, etc.) en vez de tener referencias cruzadas entre sistemas.

---

## 3. Render, cámara e iluminación

- `WebGLRenderer` con antialias, `pixelRatio` capado a 2, sombras
  `PCFSoftShadowMap`.
- Cámara perspectiva `fov 42`. **`CameraRig`** (no la cámara directamente)
  calcula la posición: offset fijo `(0, 27, 15.6)` multiplicado por un
  `zoom` que crece con la dispersión entre todos los `targets` registrados
  (`rig.addTarget(player)`). Con un solo target se comporta como
  seguimiento suave clásico (60° de inclinación isométrica); con varios,
  encuadra el punto medio y aleja la cámara — preparado para el
  cooperativo local aunque hoy solo hay un jugador.
- **Screen shake**: acumulador `game.trauma` (0-1, decae a 1,6/s),
  desplazamiento aplicado **cuadrático** (`trauma²`) dentro de
  `CameraRig.update()` — los golpes pequeños casi no se notan, las
  explosiones sacuden de verdad.
- **Hitstop**: `game.freeze(seconds)` (tope duro 0,075 s) pone `dt = 0`
  para toda la simulación de ese frame mientras el render y el propio
  shake siguen vivos. Se dispara automáticamente desde dentro de
  `explodeAt()` (0,055 s por defecto) y desde `Player.takeDamage()` cuando
  el golpe es ≥18 de daño (0,05 s) o menor (0,03 s).
- **Sol**: `DirectionalLight` que **sigue al jugador** cada frame
  (`sun.position = jugador + (24,46,18)`), así el shadow map de 2048² se
  concentra siempre donde se juega en vez de cubrir los 56×56 completos.
- **8 `PointLight` reutilizables** (`flashPool`) para fogonazos, impactos
  y explosiones — **nunca se ocultan con `visible=false`**, solo bajan a
  `intensity=0`. Cambiar el número de luces visibles de una escena fuerza
  a Three a recompilar shaders; hacerlo en mitad de un tiroteo provocaría
  un tirón perceptible. Esta regla se repite en la linterna del jugador y
  en la luz de boca de `WeaponSystem`.
- **Modo nocturno** (`L`): baja ambient/hemi/sol y activa un `SpotLight`
  de intensidad 130 montado en el arma del jugador (sombras 1024², alcance
  34, penumbra 0,45) más un `PointLight` halo corto de alcance 7 para no
  quedar completamente ciego cuerpo a cuerpo.

---

## 4. Escenario (`Arena.js`)

Sala de **56×56**, cuatro muros perimetrales de 2 de grosor, dos pilares
centrales indestructibles en `z=±9` (8×2,6×2,5).

**Coberturas destructibles** (clase `Crate`, interna a `Arena.js`): cada
caja es una rejilla de vóxeles de **1,25 unidades** (constante `VOXEL`),
4×4 en planta × 2 alturas = 32 cubos, `maxHp = 32×26 = 832`. `damage()`
resta vida y **iguala la proporción de cubos visibles a la vida
restante** — arrancando siempre desde los de arriba, así la caja se
desmorona en vez de perforarse por el centro. Cada cubo arrancado se
convierte en un `Debris` físico real. Al llegar a 0, se elimina también su
AABB del array `game.walls` — jugador, zombis y balas dejan de colisionar
en el mismo frame.

El AABB de cada caja lleva una propiedad `.crate` apuntando a su dueña, así
el sistema de balas distingue en O(1) si lo que ha golpeado es hormigón
(indestructible, solo deja marca de quemadura) o cobertura (recibe daño
real).

Cuatro puntos de spawn en las esquinas; `randomSpawn()` elige el más
alejado del jugador ponderando con un factor aleatorio.

---

## 5. Jugador (`Player.js`)

Radio de colisión 0,55, `maxHp = 100`. Movimiento con aceleración
(`SPEED=9.5`, `ACCEL=55`) — no es instantáneo, da peso sin hacerlo pesado.
Apuntado por `Raycaster` contra `Plane(0,1,0)`, rotación con `lerp(16·dt)`
normalizada a `[-π,π]`.

**Dash**: `DASH_SPEED=30`, `DASH_TIME=0.17s`, `DASH_COOLDOWN=1.5s`,
invulnerabilidad `0,17+0,08s`. Durante el dash, atravesar un barril lo
patea con fuerza 20 en vez de colisionar — vía de escape de esquinas
bloqueadas y arma ofensiva a la vez.

**Daño**: 0,35 s de invulnerabilidad tras cada golpe, destello rojo por
`emissive` 0,28 s, mancha de sangre en el suelo, dispara hitstop (ver §3).

**Linterna**: ver §3. Se activa/desactiva con `player.setFlashlight(on)`
desde `main.js` cuando se pulsa `L`.

---

## 6. Enemigos (`Zombie.js`)

| Tipo | Vida | Vel. | Daño | Puntos | Radio | Aparece desde oleada |
|---|---|---|---|---|---|---|
| `zombie` | 42 | 2,9 | 9 | 10 | 0,55 | 1 |
| `bomber` | 58 | 3,4 | 10 | 25 | 0,62 | ~3 (curva, ver abajo) |
| `armored` | 95 | 2,4 | 14 | 30 | 0,66 | ~5 |
| `devil` | 130 | 5,0 | 20 | 40 | 0,72 | ~4 |

Cada uno con variación aleatoria de velocidad ±12%. Materiales
**compartidos por tipo** (`SHARED`, un objeto por arquetipo, no por
instancia) — con hasta 150 en pantalla, instanciar materiales por
individuo dispararía el trabajo del recolector de basura.

**IA**: persecución directa a `game.player.position`, sin pathfinding.
**Deslizamiento anti-atasco**: si el avance real cae por debajo del 45%
del deseado durante >1,1 s (`stuckTimer`), el zombi se desliza en
perpendicular (`slideSign`, que invierte de lado si tampoco funciona) —
evita que la horda se quede clavada contra los pilares centrales
indefinidamente.

**Separación**: en `main.js`, vía `SpatialHash` — O(vecinos) en vez de
O(n²), es lo que permite escalar de 34 a 150 enemigos vivos. El knockback
se propaga entre zombis pegados (18% de transferencia) para que un
escopetazo a bocajarro descoloque a toda la fila.

### `devil` — ataque a distancia
`cfg.ranged = { cooldown:3, windup:0.45, min:6.5, max:24, damage:18, speed:13 }`.
Se para, se hincha con una curva de seno durante 0,45 s (ventana de esquiva
real, no se mueve durante el conjuro) y dispara una bola de fuego
(`Fireballs.js`) que impacta al jugador o a un muro.

### `armored` — placa frontal
Lleva `parts.plate`/`parts.helm`. En `takeDamage()`, si el ataque no es
explosivo, no viene de congelado, y `dot(dirBala, facing) < -0.4` (entra de
cara), la bala rebota (`return 'block'`) sin hacer daño. La bala reflejada
en `Weapons.js` conserva 60% de daño y sigue siendo letal para el zombi de
al lado.

> ⚠️ **Bug conocido, sin arreglar** — ver `ROADMAP.md` §"Deuda técnica":
> `Zombie.update()` fija la rotación al jugador cada frame sin límite de
> velocidad de giro, así que la placa *siempre* mira al jugador. El
> `armored` es efectivamente inmune a balas normales por cualquier ángulo;
> solo cae con explosivos o con Nova de Hielo.

### `bomber` — cadáver con mecha
Al morir no se despedaza: `die()` empuja un `BomberCorpse` (clase al final
de `Zombie.js`) a `game.corpses` (array separado de `game.zombies` a
propósito — si vivieran juntos, una mecha pendiente bloquearía el fin de
oleada). Late cada vez más rápido durante 2 s y detona vía `explodeAt`
(radio 5, daño 95, 34 al jugador).

### Estado congelado (Nova de Hielo)
Campos `frozen`/`frozenUntil` en el constructor. `freeze(seconds)` (método
público, llamado desde `Spells.js`) tiñe todas las piezas con el material
compartido `FROZEN` (cian, `emissive` 0x1c4a5a) y activa el flag.
`update()` comprueba `frozen` **antes que cualquier otra cosa**: si sigue
activo, descuenta el timer y hace `return` sin mover/atacar/disparar; al
expirar, restaura `p.material = p.userData.base` en cada pieza.

En `takeDamage()`, si `this.frozen` es true: el daño se multiplica ×3
(`shatter`), **se salta el chequeo de blindaje del acorazado** (el hielo
lo bypasea), se usan partículas cian en vez de las del color de piel, y se
omite el destello blanco normal (el tinte cian ya comunica el golpe). La
muerte por shatter (`die(game, dir, {shatter:true})`) usa partículas cian
en el burst final y **no** pinta mancha de sangre en el suelo.

### Desmembramiento (todos los tipos salvo `bomber`)
`detach(name, game, dir)` oculta una pieza, lee su posición de mundo y sus
dimensiones reales de `geometry.parameters` (escaladas), y lanza un
`Debris` físico con el color de `part.userData.base` (el material
*original* de esa pieza, guardado una vez en `#build()` — nunca se
sobreescribe, así que sigue siendo correcto aunque el material visible en
pantalla sea `FLASH` o `FROZEN` en ese instante). Un impacto ≥30 de daño
tiene 30% de probabilidad de arrancar un brazo sin matar. Al morir se
sueltan todas las piezas visibles en orden.

### LOD de sombras
Con `game.crowded` (`zombies.length > 60`), cada zombi apaga `castShadow`
en sus piezas si está a más de 20 unidades del jugador — el shadow map es
el primer cuello de botella con más de un centenar de enemigos.

---

## 7. Armas (`Weapons.js` + `Grenades.js` + `Mine.js`)

| Arma | Cadencia | Daño | Splash | Se desbloquea | Notas |
|---|---|---|---|---|---|
| Pistola | 0,20s | 34 | — | x0 | munición infinita |
| Escopeta | 0,72s | 28×5 perdigones | — | x3 | alcance corto vía `life=0.42` (no chequeo de distancia) |
| Uzi | 0,072s | 17 | — | x6 | automática |
| Barril | — (colocable) | 35 hp propia | radio 6,5 / 160 dmg | x2 | empujable a tiros/explosión/patada |
| Mina | — (colocable) | — | radio 4 / 110 dmg | x4 | se arma en 1s, detona por proximidad (¡también al jugador!) |
| Granada | 0,6s lanzamiento | — | radio 5,5 / 130 dmg | x5 | arco real en Y, rebota, mecha 1,2s |
| Cohete | 1,15s | — | radio 6 / 190 dmg | x8 | vive en el pool de balas normal, flag `splash` |

**Pool de 240 balas** reciclado circular, subpasos de colisión de ≤0,5
unidades por frame (a 58 u/s un paso entero atravesaría a un zombi de
radio 0,55). Orden de comprobación por subpaso: muros → zombis (vía
`grid.near()`, no el array completo) → barriles.

**`splash`** (usado por el cohete): cada bala lleva un campo `splash` con
`{radius, damage, playerDamage, color}` o `null`. Si está presente, al
tocar cualquier cosa (muro, zombi, barril) la bala **no** aplica daño
directo — llama a `explodeAt()` en el punto de impacto y listo. Esto
significa que el cohete ignora por completo la mecánica de rebote del
acorazado (la explosión no comprueba ángulo de impacto). Deja estela de
humo (partículas grises, 70% de probabilidad por frame en vuelo).

**Casquillos**: cada disparo normal expulsa un casquillo de latón por el
lateral del arma, en un pool de `Debris` **separado** (`game.shells`, 150
de capacidad) del de escombros generales (`game.debris`, 420). Separados a
propósito: con todo en el mismo pool, los casquillos persistentes de la
uzi llenaban los 300 huecos originales en ~20s y expulsaban los miembros
desmembrados de los zombis.

**Granadas** (`Grenades.js`, sistema aparte): a diferencia de las balas
planas, viven en 3D real — gravedad `-18`, rebote en muros
(`circleHitsBox`) y en el suelo con fricción, detonan por mecha o al
tocar a un zombi directamente. Pool de 16.

**Minas** (`Mine.js`, entidad, no pool — como `Barrel`): disco de
`CylinderGeometry`, LED que parpadea lento mientras arma (1s) y rápido
cuando está lista. Trigger: `distXZ < radio_del_otro + 1.15` contra
zombis cercanos (vía `grid.near`) y contra el propio jugador — riesgo real
de fuego amigo si te descuidas cerca de una tuya. Las minas se registran
en `Explosion.js`: cualquier explosión dentro de radio×1,1 de una mina la
detona también (mismo mecanismo de cadena que los barriles).

---

## 8. Magias (`Spells.js`)

| Conjuro | Tecla | Coste | Cooldown | Desbloquea |
|---|---|---|---|---|
| Pisar del Titán | `Q` | 20 esencia | 0,9s | x3 |
| Nova de Hielo | `E` | 35 esencia | 1,4s | x7 |

**Esencia**: recurso en `game.essence` (máx. `game.maxEssence=100`,
empieza en 20). Se regenera con **cada baja**:
`essence += 2 + multiplicador×0,6` (en `registerKill()`, `main.js`) y con
**orbes** que sueltan los zombis (22% de probabilidad por baja,
independiente del resto de sueltas — `Pickup` tipo `essence`, +18 al
recogerlo). Cada conjuro tiene su **propio cooldown**
(`game.spellCooldowns.{stomp,frostnova}`), no comparten uno global como sí
hacen armas/colocables entre sí.

**Pisar del Titán**: cono frontal de 110° (`halfAngleDeg=55`) y radio 5,5.
Para cada zombi dentro del cono: daño 45 y knockback 14, ambos con caída
lineal por distancia. Puramente decorativo: 10 baldosas de `Debris`
(color gris oscuro) saltan dentro del cono simulando el suelo levantándose
— no tienen colisión, es solo lectura visual.

**Nova de Hielo**: radio 6 desde el jugador, llama a `z.freeze(3)` en cada
zombi dentro. No aplica daño ni knockback por sí misma — el daño viene
después, de quien dispare a los enemigos ya congelados (ver §6, shatter
×3).

Ninguno de los dos usa `explodeAt()` (no son explosiones con daño radial
estándar) — cada uno tiene su propia función de efectos en `Spells.js`.

---

## 9. Explosión compartida (`Explosion.js`)

`explodeAt(game, pos, opts)` es la única función de daño radial de todo el
juego — la usan barril, mina, granada, cohete y el cadáver del bomber, con
distintos `opts`. Por orden, en cada llamada:

1. Partículas de fuego + humo, luz de impacto, `game.shake()`,
   `game.audio.explosion(radius/6.5)`, **hitstop** (`game.freeze()`,
   0,055s por defecto), marca de quemadura en el suelo.
2. Daño a cada zombi en radio con **caída lineal** (`1 - d/radius`) y
   knockback 16×caída — pasa `{explosive:true, gib:true}` a
   `takeDamage()`, lo que hace que el desmembramiento sea total y que el
   chequeo de blindaje se salte (las explosiones siempre ignoran la placa
   del acorazado).
3. Si `chain !== false` (por defecto sí): cualquier barril o mina dentro
   de radio×1,1-1,2 se arma con un pequeño retardo aleatorio —
   encadenados escalonados, no todos a la vez.
4. Daño a coberturas (`arena.damageCrates`, 55% del daño base).
5. Daño al jugador si está dentro del radio.

Valores por defecto si `opts` no los especifica: radio 6,5, daño 160,
daño-jugador 45, shake 0,6, freeze 0,055 — son los del barril; el resto de
llamadores los sobreescriben.

---

## 10. Sistemas de partículas y escombros

**`Particles.js`**: pool de 900 cubitos pequeños, gravedad -26, rebote
-0,32 con fricción 0,72, fundido por escala en los últimos 0,25s.

**`Debris.js`**: clase reutilizada en **dos instancias independientes**:
- `game.debris` (420) — miembros desmembrados, vóxeles de caja, baldosas
  del Pisar del Titán.
- `game.shells` (150) — casquillos, persistentes (`ttl:999`).

Separadas a propósito (ver §7). Gravedad -30; cuando la velocidad vertical
del rebote cae por debajo de 2,2, el trozo **se acuesta y se congela**
(deja de calcularse) — así una partida larga no acumula coste de física
indefinidamente.

---

## 11. Persistencia visual (`Decals.js`)

En vez de una malla por mancha, se pinta sobre un **canvas de 1024²**
representando los 56×56 de la sala, subido como textura de un único plano
a `y=0.02` con `polygonOffset` y `depthWrite:false`. `blood()`,
`burn()`, `scorch()` — cada una pinta con gradientes radiales en el
contexto 2D. La subida a la GPU (`texture.needsUpdate`) está acotada a
como mucho una vez cada 0,12s, no por cada mancha.

---

## 12. Colisión (`Collision.js`) y cuadrícula (`SpatialHash.js`)

Todo el juego ocurre en el plano XZ — no hay motor de física, es
círculo-contra-AABB (`resolveCircleBox`, `circleHitsBox`, `pointInBox`).

`SpatialHash` (celda=2): `build(items)` asigna cada entidad a una celda y
un índice estable `_gi`; `near(x,z,radius)` devuelve (en un array
reutilizado, no copiar el resultado) las entidades de las celdas
cercanas; `forEachPair()` recorre cada par de vecinos exactamente una vez.
Se reconstruye **dos veces por frame** en `main.js`: antes de mover balas
(para que sus consultas de impacto sean O(vecinos)) y otra vez dentro de
`separateZombies()` después de que los zombis se hayan movido ese frame.

---

## 13. Oleadas (`WaveManager.js`)

Estados `intermission`/`active`. Descanso 4s entre rondas. Presupuesto de
la oleada *n*: `6 + round(n×4.5)` enemigos, soltados cada
`max(0.12, 1.4 - n×0.085)` segundos, tope **150 vivos** simultáneos (antes
34 — la cuadrícula espacial es lo que permitió subir el límite). La oleada
acaba cuando el presupuesto se agota **y** no quedan ni zombis ni
cadáveres con mecha pendiente (`game.corpses`).

Mezcla de arquetipos por probabilidad acumulada, todas con tope:
`devil` hasta 32% (crece desde oleada 3), `armored` hasta 22% (desde
oleada 4), `bomber` hasta 24% (desde oleada 2); el resto, `zombie` común.

---

## 14. Combo y economía (sistema arcade estilo Boxhead)

- **Multiplicador con decay acelerado** (reescrito respecto al modelo viejo de
  ventana fija). Cada baja: `combo+=1`, `multiplier = min(99, multiplier+1)`, y
  la barra de mantenimiento `decay` se rellena a 1. En el bucle, `decay` drena a
  `decayRate() = 0.25 + multiplier·0.015` por segundo (a x1 dura ~4s, a x50
  ~1s). Al llegar a 0, el multiplicador baja UN escalón y `decay` se rellena a
  0.55; solo al caer a x1 se resetea `combo`. Fuerza el playstyle agresivo.
- Puntos por baja = puntos del enemigo × multiplicador.
- **Desbloqueo por milestone** (`unlockByMultiplier`): barril x3, escopeta x5,
  barricada x8, mina x10, uzi x15, granada x20, torreta x30, cohete x50.
  Magias: Titán x12, Nova x35.
- **Upgrades por milestone extremo** (misma función, campo `upgradeAt`/`upgrade`
  en WEAPONS, estado en `game.upgraded`, aplicado vía `effWeapon()`): Dual
  Pistols x55, Súper Escopeta x60, Minigun x65, Granadas de Racimo x70, Torreta
  Pesada x75. `effWeapon(game,id)` fusiona el upgrade sobre la base sin mutar
  WEAPONS. Casos especiales: `cluster` (granada, en Grenades.js — fragmenta en
  submuniciones que no re-fragmentan) y `heavy` (torreta, flag en el
  constructor de Turret que dobla vida/munición y sube cadencia/daño).
- Munición por combo (en `registerKill()`): +1 escopeta cada 2 bajas, +3
  uzi por baja, +1 barril cada 6, +1 mina cada 5, +1 barricada cada 8, +1
  turret cada 15, +1 granada cada 7, +1 cohete cada 12.
- Esencia por combo: `+2 + multiplicador×0.4` cada baja (ver §8).
- **Regeneración de vida**: tras 5s sin recibir daño (`player.timeSinceHurt`),
  +5 vida/s. Se reinicia con cada golpe.
- Al limpiar oleada *n*: `+50×n` puntos, +6 escopeta, +40 uzi, +2 barril,
  +1 mina, +2 granada, +1 cohete.
- **Vida y esencia en barras flotantes 3D** (`entities/FloatingBars.js`), no en
  el overlay: billboard sobre la cabeza del jugador, la vida vira ámbar→rojo.
- **Pickups** (`Pickup.js`, `maybeDrop()` en `main.js`): orbe de esencia
  22% independiente; luego, si `shotgun<6 && uzi<25` ("seco") 50% de
  probabilidad de soltar algo — prioriza salud si `hp<45`, si no uzi/
  escopeta según cuál falte más, si no un tipo aleatorio entre
  barril/escopeta/uzi/mina/granada/cohete. Si no está seco, 14% de
  probabilidad con la misma lógica. Recoger munición de un arma no
  desbloqueada la desbloquea automáticamente (`game.unlocked.add(kind)`
  dentro de `Pickup.collect()`).

Munición inicial: pistola infinita, escopeta 12, uzi 90, barril 2, mina 2,
granada 3, cohete 1. Esencia inicial 20.

---

## 15. HUD (`index.html` + `style.css` + `HUD.js`)

DOM puro con `pointer-events:none`, sin tarjetas ni sombras — barras
sólidas y números grandes. Bloques por posición:
- **Abajo izquierda**: vida, barra de dash.
- **Izquierda, centro-bajo** (`hud-magic`): barra de esencia + los 2 slots
  de conjuro (`Q`/`E`, con coste, y clases `locked`/`cooling`/`ready`).
- **Arriba centro**: multiplicador (52px, elemento dominante), barra de
  tiempo de combo, contador de bajas.
- **Arriba derecha**: oleada, puntos, enemigos vivos.
- **Abajo derecha** (`hud-arsenal`): los 7 slots de arma, generados
  **dinámicamente** desde `WEAPON_ORDER` en el constructor de `HUD` — añadir
  un arma nueva a `Weapons.js` no requiere tocar `HUD.js` ni `index.html`
  para que aparezca. Mismo patrón para los slots de conjuro vía
  `SPELL_ORDER`.
- Avisos de oleada/desbloqueo con fundido, pantalla de fin de partida,
  ayuda de controles que se desvanece a los 12s.

> Nota: el layout de `hud-arsenal` con 7 filas no se ha verificado
> visualmente (sin navegador en el entorno de desarrollo) — ver
> `ROADMAP.md`.

---

## 16. Audio (`Audio.js`)

Web Audio API pura — cero archivos. Un único `AudioContext`, creado al
primer gesto del usuario (`unlock()`, enganchado a `pointerdown`/`keydown`
en `main.js` por la política de autoplay de los navegadores). Un buffer de
1s de ruido blanco (`Math.random()`) generado una vez y reutilizado por
todos los efectos percusivos vía `#burst()` (ruido filtrado) y `#tone()`
(oscilador con barrido de frecuencia). Cada sonido tiene su propio
antirrebote (`#ready(key, minGap)`) para no saturar en ráfagas de uzi.

Métodos: `shot(weapon)` (rama por arma: pistola/escopeta/uzi/cohete),
`ricochet`, `gib`, `hit`, `shatter`, `frostNova`, `titanStomp`,
`explosion(scale)`, `hurt`, `dash`, `fireball`, `place`, `pickup`, `wave`,
`unlockWeapon`. `toggleMute()` silencia bajando la ganancia maestra a 0
(tecla `M`).

---

## 17. Decisiones técnicas para recordar

1. **Las luces nunca se ocultan, solo bajan a intensidad 0** — cambiar el
   número de luces visibles fuerza recompilación de shaders (§3, §7).
2. **Subpasos en proyectiles**, no colisión continua completa — suficiente
   y barato (§7).
3. **Dos pools de `Debris`** separados (escombros vs casquillos) por el
   problema de desalojo descrito en §7/§10.
4. **Decals pintados en canvas**, no mallas — coste fijo, subida acotada
   a ~8/s (§11).
5. **`game.corpses` es un array aparte de `game.zombies`** para que una
   mecha de bomber pendiente no bloquee el fin de oleada (§6).
6. **El AABB de cada caja lleva `.crate`** — "¿esto que he golpeado es
   destructible?" es un acceso a propiedad, no una búsqueda (§4).
7. **El sol sigue al jugador** para concentrar la resolución del shadow
   map donde se juega (§3).
8. **Los escombros se congelan al posarse** — una partida larga no cuesta
   CPU de más (§10).
9. **`explodeAt()` es la única fuente de daño radial** — cualquier cosa
   nueva que explote (torreta destruida, barricada, lo que sea) debería
   llamarla en vez de reinventar la lógica de daño/cadena/hitstop (§9).
10. **`part.userData.base` nunca se sobreescribe** — guarda el material
    *real* de cada pieza aunque visualmente esté mostrando `FLASH` o
    `FROZEN`, así el desmembramiento siempre saca el color correcto (§6).
11. **`SpatialHash.near()` devuelve un array reutilizado** — no guardar
    una referencia al resultado entre llamadas, se sobreescribe (§12).

---

## 18. Qué NO está hecho, y por qué exactamente

Ver `ROADMAP.md` para el desglose completo por bloque (armas, magias,
enemigos, mapas) con la razón técnica específica de cada pieza pendiente.
Resumen de los tres motivos que se repiten:
- **Necesita un modelo de colisión que no existe** (rifle de plasma:
  segmento-contra-círculo; volador: colisión con altura real en Y).
- **Necesita una fuerza continua sin romper la resolución de muros**
  (vórtice gravitatorio).
- **Necesita un concepto que no existe en ninguna parte del código**
  (tercera facción amigo-enemigo para el Círculo de Almas; estado de
  "fuera de límites" para el mapa Rooftop; movimiento de huida para el
  Nigromante).

---

## 19. Referencia rápida — "quiero cambiar X"

| Quiero cambiar… | Archivo y sitio |
|---|---|
| Daño/cadencia/alcance/splash de un arma | `systems/Weapons.js`, objeto `WEAPONS` |
| Parámetros de granada (arco, mecha, explosión) | `systems/Weapons.js`, `WEAPONS.grenade` |
| Radio/mecha/daño de las minas | `entities/Mine.js`, constantes de cabecera |
| Coste/cooldown/efecto de un conjuro | `systems/Spells.js`, objeto `SPELLS` y `castStomp`/`castFrostNova` |
| Duración/multiplicador del shatter congelado | `entities/Zombie.js`, `takeDamage()` (busca `shatter`) |
| Vida/velocidad/puntos/aparición de un enemigo | `entities/Zombie.js`, `ENEMY_TYPES` + `WaveManager.js#pickType` |
| Ritmo y tamaño de las oleadas | `systems/WaveManager.js`, `#startWave`/`spawnInterval`/`MAX_ALIVE` |
| Radio/daño de cualquier explosión | `systems/Explosion.js`, `explodeAt()` (afecta a todo) |
| Ventana de combo y recompensas | `main.js`, `registerKill()` y `comboWindow` |
| Regeneración/gasto de esencia | `main.js` (`registerKill`, `maybeDrop`) + `systems/Spells.js` (coste) |
| Probabilidad/tipos de pickup | `main.js`, `maybeDrop()` + `entities/Pickup.js`, `PICKUP_TYPES` |
| Ángulo/distancia de cámara | `core/CameraRig.js`, constructor (`height`/`back`/`maxZoom`) |
| Intensidad del modo nocturno | `main.js`, función `setNight` |
| Dureza de las coberturas | `world/Arena.js`, `Crate` (`maxHp = voxels.length * 26`) |
| Velocidad/duración/recarga del dash | `entities/Player.js`, constantes de cabecera |
| Cualquier sonido nuevo | `systems/Audio.js` — usar `#burst()`/`#tone()` existentes, no crear nodos nuevos a mano |
