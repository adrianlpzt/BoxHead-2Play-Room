# Boxhead 3D — 2Play Room

Recreación en 3D de *Boxhead: 2Play Rooms* sobre **Vite 5 + Three.js r169**, sin
frameworks de UI y sin assets externos: todo el arte es procedural
(`BoxGeometry` + texturas de `<canvas>`), todo el audio es síntesis con Web
Audio API.

**Jugable ahora mismo en:** https://boxhead-3d-production.up.railway.app

---

## Ejecutar en local

```bash
npm install
npm run dev       # servidor de desarrollo con recarga en caliente
npm run build     # build de producción en dist/
npm run start     # sirve el build de producción (lo que usa Railway)
```

## Controles

| Acción | Tecla |
|---|---|
| Mover (8 direcciones) | `W` `A` `S` `D` |
| Apuntar | Ratón |
| Disparar / lanzar / colocar | Clic izquierdo o `Espacio` |
| Cambiar arma | `1` Pistola · `2` Escopeta · `3` Uzi · `4` Barril · `5` Mina · `6` Granada · `7` Cohete |
| Soltar barril | `B` o clic derecho |
| **Pisar del Titán** (magia) | `Q` |
| **Nova de Hielo** (magia) | `E` |
| Esquiva / dash (patea barriles) | `Shift` |
| Modo nocturno con linterna | `L` |
| Silenciar sonido | `M` |
| Reiniciar tras morir | `R` |

## Progresión

Todo se desbloquea por **multiplicador de combo** (sube con bajas seguidas,
baja a x1 si se te enfría la racha 3,2 s):

| Desbloqueo | Multiplicador |
|---|---|
| Barril | x2 |
| Escopeta | x3 |
| **Pisar del Titán** | x3 |
| Mina | x4 |
| Granada | x5 |
| Uzi | x6 |
| **Nova de Hielo** | x7 |
| Cohete | x8 |

La munición de cada arma también se repone con el combo (ver
`ARQUITECTURA.md` para las cifras exactas) y con pickups que sueltan los
zombis al morir — incluidos orbes de **Esencia** para las magias.

---

## Despliegue — cómo está montado

- **Repo:** https://github.com/adrianlpzt/BoxHead-2Play-Room (rama `main`)
- **Railway:** proyecto `boxhead-3d`, un único servicio conectado a ese repo.
  Cada `git push` a `main` dispara un build y despliegue automáticos
  (Railway detecta Node vía `package.json`, corre `npm run build` y luego
  `npm run start`).
- **`vite.config.js`** tiene `preview.allowedHosts: true`. Es obligatorio:
  sin eso, `vite preview` rechaza cualquier petición cuyo header `Host` no
  sea `localhost` (protección anti DNS-rebinding), y Railway enruta con su
  propio dominio público. Si algún día veis "Blocked request" en el
  navegador, es esto.

### Cómo subir cambios

Si trabajáis con el código en un sandbox o entorno sin credenciales de
GitHub propias, la vía usada hasta ahora es:

1. `git add -A && git commit -m "..."`
2. `git push` a `https://<usuario>:<token>@github.com/adrianlpzt/BoxHead-2Play-Room.git main`
   con un token de acceso personal de grano fino (**Contents: Read and
   write**, restringido a este único repo).
3. Railway lo detecta solo — no hace falta ningún paso manual más.

Para cambios de un solo archivo pequeño (p. ej. un ajuste de config), editar
directamente desde la web de GitHub (**Add file → Create/Edit → Commit
directly to main**) es más rápido y no requiere token.

---

## Estructura del proyecto

```
index.html                  canvas + overlay del HUD
vite.config.js               allowedHosts:true para el preview en Railway
src/style.css                estilos del HUD
src/main.js                  bucle, escena, luces, cámara, combo, estado de partida
src/core/Input.js             teclado/ratón
src/core/HUD.js               actualización del DOM
src/core/Collision.js         círculo vs AABB en XZ, helpers matemáticos
src/core/SpatialHash.js       cuadrícula espacial para separación/colisión O(vecinos)
src/core/CameraRig.js         seguimiento de cámara (ya preparado para N objetivos)
src/world/Arena.js            suelo, muros, pilares y cajas destructibles
src/entities/Player.js        modelo, movimiento, dash, linterna
src/entities/Zombie.js        4 arquetipos + estado congelado + cadáver del bomber
src/entities/Barrel.js        barril: empuje físico, mecha, explosión
src/entities/Mine.js          mina de proximidad
src/entities/Pickup.js        recogidas sueltas por los zombis
src/systems/Weapons.js        pistola/escopeta/uzi/cohete (pool de balas)
src/systems/Grenades.js       granadas: arco en Y, rebote, mecha
src/systems/Fireballs.js      proyectiles a distancia del demonio
src/systems/Spells.js         Pisar del Titán y Nova de Hielo
src/systems/Explosion.js      daño radial compartido por barriles/minas/granadas/cohetes/bomber
src/systems/WaveManager.js    oleadas: presupuesto de enemigos y mezcla de arquetipos
src/systems/Particles.js      cubitos pequeños con gravedad
src/systems/Debris.js         trozos grandes que se posan (miembros, escombros, casquillos)
src/systems/Decals.js         sangre/quemaduras persistentes pintadas en el suelo
src/systems/Audio.js          todo el sonido, síntesis con Web Audio API
```

Para el detalle completo de cómo funciona cada sistema, decisiones de
diseño y bugs conocidos: **`ARQUITECTURA.md`**. Para qué falta y por qué:
**`ROADMAP.md`**.
