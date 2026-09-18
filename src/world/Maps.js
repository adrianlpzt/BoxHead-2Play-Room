/**
 * Definiciones de mapas. Cada una describe la paleta del suelo y la disposición
 * de pilares (indestructibles). La Arena las consume; añadir un mapa nuevo es
 * añadir una entrada aquí, sin tocar la lógica.
 *
 * Formato de pilar: [x, z, anchoX, anchoZ]. Los pilares llevan color aparte.
 * (Las cajas destructibles se eliminaron: estorbaban sin aportar a la partida.)
 */
export const MAPS = {
  box: {
    name: 'La Caja',
    floor: '#2b2f38',
    floorLine: '#1a1d24',
    pillarColor: 0x4d525c,
    pillars: [
      [0, -9, 8, 2.5],
      [0, 9, 8, 2.5],
      [-15, -15, 4, 4],
      [15, -15, 4, 4],
      [-15, 15, 4, 4],
      [15, 15, 4, 4],
    ],
    crates: [],
  },

  columns: {
    name: 'Templo',
    floor: '#33302a',
    floorLine: '#211f1a',
    pillarColor: 0x6b6152,
    // Rejilla regular de columnas: la horda serpentea entre ellas.
    pillars: (() => {
      const out = [];
      for (const x of [-16, -5.3, 5.3, 16]) {
        for (const z of [-16, -5.3, 5.3, 16]) {
          out.push([x, z, 2.5, 2.5]);
        }
      }
      return out;
    })(),
    crates: [],
  },

  reactor: {
    name: 'Reactor',
    floor: '#1f2a24',
    floorLine: '#132019',
    pillarColor: 0x3c5a48,
    // Núcleo central grande + cuatro soportes: arena abierta con un obstáculo
    // dominante en el medio alrededor del cual gira todo el combate.
    pillars: [
      [0, 0, 7, 7],
      [-18, -18, 3, 3],
      [18, -18, 3, 3],
      [-18, 18, 3, 3],
      [18, 18, 3, 3],
    ],
    crates: [],
  },
};

export const MAP_ORDER = ['box', 'columns', 'reactor'];
