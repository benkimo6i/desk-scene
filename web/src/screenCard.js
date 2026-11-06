// The title shown on a 3D screen, drawn live so it can follow the palette, invert
// on hover and fade to a blank screen before the camera pushes in.
import * as THREE from 'three';

const mix = (a, b, t) => a.clone().lerp(b, t);

export function createScreenCard(mesh, label, aspect) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.round(1024 / aspect);
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false; // glTF texture coordinates start at the top
  texture.anisotropy = 8;
  mesh.material = new THREE.MeshBasicMaterial({ map: texture });

  const paper = new THREE.Color('#EFE6D2');
  const ink = new THREE.Color('#0B4C92');
  let drawn = '';
  // Canvas text doesn't wait for web fonts, so redraw once the bold cut has loaded.
  document.fonts?.load("700 100px 'Inter Tight Variable'").then(() => { drawn = ''; });

  function draw(hover, blank) {
    const key = `${hover.toFixed(3)}|${blank.toFixed(3)}|${paper.getHexString()}|${ink.getHexString()}`;
    if (key === drawn) return;
    drawn = key;
    const { width, height } = canvas;
    const background = mix(paper, ink, hover * (1 - blank));
    const text = mix(ink, paper, hover);
    const margin = width * 0.05;
    context.globalAlpha = 1;
    context.fillStyle = `#${background.getHexString()}`;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 1 - blank;
    context.fillStyle = `#${text.getHexString()}`;

    const family = "'Inter Tight Variable', Helvetica, Arial, sans-serif";
    // Label and slanted arrow sit on one line, sized together to fit the width.
    const arrowShare = 0.72, gapShare = 0.16; // relative to the type size
    context.font = `700 100px ${family}`;
    const perSize = context.measureText(label).width / 100 + arrowShare + gapShare;
    const size = Math.min(height * 0.34, (width - 2 * margin) / perSize);
    context.font = `700 ${size}px ${family}`;
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';
    const baseline = height - margin;
    context.fillText(label, margin, baseline);

    // Thin slanted arrow, drawn to sit on the label's line.
    const box = size * arrowShare;
    const nudge = hover * size * 0.07;
    const left = margin + context.measureText(label).width + size * gapShare + nudge;
    const bottom = baseline - nudge;
    const barb = box * 0.62;
    context.strokeStyle = context.fillStyle;
    context.lineWidth = size * 0.08;
    context.lineCap = 'butt';
    context.lineJoin = 'miter';
    context.beginPath();
    context.moveTo(left, bottom);
    context.lineTo(left + box, bottom - box);
    context.moveTo(left + box - barb, bottom - box);
    context.lineTo(left + box, bottom - box);
    context.lineTo(left + box, bottom - box + barb);
    context.stroke();
    texture.needsUpdate = true;
  }

  return {
    draw,
    setColors(paperColor, inkColor) {
      paper.set(paperColor);
      ink.set(inkColor);
      drawn = '';
    },
  };
}

// The phone has no title. It stays dark until hovered, then blanks to the page color before the push.
export function createPhoneCard(mesh) {
  const material = new THREE.MeshBasicMaterial();
  mesh.material = material;
  const page = new THREE.Color();
  const off = new THREE.Color();
  const on = new THREE.Color();
  return {
    draw(hover, blank) {
      material.color.copy(off).lerp(on, hover).lerp(page, blank);
    },
    setColors(paper, _ink, light, dark) {
      page.set(paper);
      on.set(light);
      off.set(dark);
    },
  };
}
