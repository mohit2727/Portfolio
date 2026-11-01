import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

function splatTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(245,247,255,0.95)';
  g.lineWidth = 3;
  g.translate(64, 64);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * 58, Math.sin(a) * 58);
    g.stroke();
  }
  g.lineWidth = 2;
  for (const r of [16, 32, 48]) {
    g.beginPath();
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.stroke();
  }
  return new THREE.CanvasTexture(c);
}

// The web line from the hero's hand to an anchor, plus the splat where it sticks.
export function createWeb(scene) {
  const geo = new THREE.CylinderGeometry(0.07, 0.07, 1, 5, 1, true);
  geo.translate(0, 0.5, 0);
  const rope = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xf2f4ff }));
  rope.frustumCulled = false;
  const splat = new THREE.Sprite(new THREE.SpriteMaterial({ map: splatTexture(), transparent: true, depthWrite: false }));
  splat.scale.setScalar(5);
  rope.visible = splat.visible = false;
  scene.add(rope, splat);
  const d = new THREE.Vector3();

  return {
    show(from, to) {
      d.subVectors(to, from);
      const len = d.length();
      if (len < 0.01) return;
      rope.position.copy(from);
      rope.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / len));
      rope.scale.set(1, len, 1);
      splat.position.copy(to);
      rope.visible = splat.visible = true;
    },
    hide() {
      rope.visible = splat.visible = false;
    },
  };
}
