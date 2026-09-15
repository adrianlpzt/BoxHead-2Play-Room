import * as THREE from 'three';

/**
 * Barras de vida (roja) y esencia/maná (cian) flotando sobre la cabeza del
 * jugador, en el mundo 3D. Cada barra es un par de planos: fondo oscuro + relleno
 * que se escala. El grupo hace billboard (mira siempre a la cámara) para que las
 * barras se lean desde el ángulo isométrico sin deformarse.
 */
const W = 1.6;    // ancho de barra
const H = 0.18;   // alto de barra
const GAP = 0.06;

function bar(color, y) {
  const group = new THREE.Group();
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 0.08, H + 0.06),
    new THREE.MeshBasicMaterial({ color: 0x0b0d12, transparent: true, opacity: 0.75, depthTest: false })
  );
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshBasicMaterial({ color, depthTest: false })
  );
  // Anclamos el relleno por la izquierda para escalarlo sin recentrar.
  fill.geometry.translate(W / 2, 0, 0);
  fill.position.x = -W / 2;
  fill.position.z = 0.001;
  group.add(bg, fill);
  group.position.y = y;
  group.renderOrder = 999;
  return { group, fill };
}

export class FloatingBars {
  constructor(scene) {
    this.group = new THREE.Group();
    this.health = bar(0xc8321f, GAP / 2 + H / 2);
    this.essence = bar(0x6fd8f0, -(GAP / 2 + H / 2));
    this.group.add(this.health.group, this.essence.group);
    this.group.visible = false;
    scene.add(this.group);
  }

  setVisible(v) {
    this.group.visible = v;
  }

  update(player, game, camera) {
    // Flota sobre la cabeza del jugador.
    this.group.position.set(player.position.x, 3.1, player.position.z);
    // Billboard: orienta el grupo hacia la cámara.
    this.group.quaternion.copy(camera.quaternion);

    const hp = Math.max(0, player.hp) / player.maxHp;
    this.health.fill.scale.x = Math.max(0.001, hp);
    // La vida vira a amarillo/rojo cuando baja.
    this.health.fill.material.color.setHex(hp > 0.5 ? 0xc8321f : hp > 0.25 ? 0xe0a92f : 0xd42f1f);

    const ess = Math.max(0, Math.min(1, game.essence / game.maxEssence));
    this.essence.fill.scale.x = Math.max(0.001, ess);
  }
}
