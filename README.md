# Boxhead 3D — vertical slice

Recreación en 3D de *Boxhead: 2Play Rooms* con Vite + Three.js puro (sin frameworks de UI).
Todo el arte es procedural a base de `BoxGeometry`; no hay assets externos.

## Arrancar

```bash
npm install
npm run dev
```

## Controles

| Acción | Tecla |
|---|---|
| Mover (8 direcciones) | `W` `A` `S` `D` |
| Apuntar | Ratón (raycast contra el plano del suelo) |
| Disparar | Clic izquierdo o `Espacio` |
| Cambiar arma | `1` pistola · `2` escopeta · `3` uzi · `4` barril |
| Soltar barril | `B` o clic derecho |
| Esquiva / dash (patea barriles) | `Shift` |
| Modo nocturno con linterna | `L` |
| Reiniciar tras morir | `R` |

## Arquitectura

```
index.html            canvas + overlay del HUD
src/style.css         estilos del HUD
src/main.js           loop, escena, luces, cámara, combo y estado de partida
src/core/Input.js     teclado/ratón, con eventos de un solo frame
src/core/HUD.js       actualización del DOM
src/core/Collision.js círculo vs AABB en XZ, helpers matemáticos
src/world/Arena.js    suelo procedural, muros y cajas; puntos de spawn
src/entities/Player.js   modelo, movimiento con aceleración, apuntado y balanceo
src/entities/Zombie.js   zombis y demonios: IA de persecución directa
src/entities/Barrel.js   colocación, vida, mecha y explosión radial encadenada
src/systems/Weapons.js   definición de armas, pool de proyectiles, muzzle flash
src/systems/WaveManager.js  presupuesto de enemigos por oleada y goteo de spawn
src/systems/Particles.js    pool de cubitos con gravedad y rebote
src/systems/Debris.js       trozos grandes que rebotan y se posan (miembros, escombros, casquillos)
src/systems/Decals.js       sangre, quemaduras y marcas pintadas sobre un canvas del suelo
src/systems/Explosion.js    daño radial compartido por barriles y zombis bomba
```

## Decisiones de diseño

- **Colisiones 2D.** Todo ocurre sobre el plano XZ, así que las colisiones son
  círculo contra AABB. Más barato y más predecible que cualquier motor de física.
- **Pools en todo lo que se repite.** Balas (240), partículas (700) y luces de
  explosión (4) se reservan al inicio y se reciclan. En mitad de una oleada no se
  crea geometría nueva.
- **Combo como motor de progresión.** Cada baja sube el multiplicador (tope x10) y
  reinicia una ventana de 3,2 s. El multiplicador desbloquea armas (x2 barriles,
  x3 escopeta, x6 uzi) y reparte munición. Si la barra se vacía, vuelve a x1.
- **Subpasos en los proyectiles.** Las balas avanzan en tramos de ≤0,5 unidades por
  frame para que a 58 u/s no atraviesen a un zombi.
- **Materiales por enemigo.** Cada zombi tiene sus propios materiales para que el
  destello de impacto sea individual y no tiña a toda la horda.

## Añadidos sobre el original de Flash

- **Desmembramiento vóxel.** Al morir, cada pieza visible del zombi se convierte en
  un trozo con física propia que rebota y se posa. Un impacto de 30+ puede arrancar
  un brazo sin matar.
- **Coberturas destructibles.** Las cajas son bloques de vóxeles con vida: se
  deshacen cubo a cubo con los disparos y los manotazos de la horda, y al caer
  desaparece también su colisión.
- **Persistencia.** Sangre, quemaduras y casquillos se acumulan durante toda la
  partida sobre un canvas de 1024² que se sube como textura del suelo.
- **Modo nocturno con linterna.** Un spotlight con sombras montado en el arma. No es
  luz volumétrica: eso necesitaría postproceso.
- **Knockback real.** Cada perdigón empuja, y el empuje se propaga entre zombis en
  la fase de separación: un escopetazo a bocajarro descoloca a toda la fila.
- **Esquiva.** 0,17 s de dash con i-frames y 1,5 s de recarga. Si atraviesas un
  barril durante el dash, sale rodando.
- **Barriles físicos.** Se empujan a tiros, con la onda expansiva o de una patada, y
  atropellan a lo que pillen por encima de 4 u/s.
- **Zombi bomba y zombi acorazado.** El primero deja un cadáver con mecha de 2 s; el
  segundo rebota las balas que le entran de frente (y la bala desviada sigue viva).

## Siguientes pasos naturales

- Rebote de balas contra muros metálicos, reutilizando el código de la placa frontal.
- Segundo jugador local (el "2Play" del título): el `Input` ya está aislado, bastaría
  con un segundo mapa de teclas y una cámara que encuadre a ambos.
- Sonido: `THREE.PositionalAudio` para disparos y explosiones.
- Armas restantes del original: lanzagranadas, torreta, rifle de plasma.
- Guardar la puntuación máxima en `localStorage`.
