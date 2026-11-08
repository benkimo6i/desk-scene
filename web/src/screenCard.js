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
    const gapShare = 0.16; // relative to the type size
    context.font = `700 100px ${family}`;
    const capShare = context.measureText('H').actualBoundingBoxAscent / 100;
    const perSize = context.measureText(label).width / 100 + capShare + gapShare;
    const size = Math.min(height * 0.34, (width - 2 * margin) / perSize);
    context.font = `700 ${size}px ${family}`;
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';
    const baseline = height - margin;
    context.fillText(label, margin, baseline);

    // The arrow is a little smaller than the capitals, hung from the cap height at the right
    // edge of the space a cap-height square would take.
    const cap = size * capShare;
    const square = cap * 0.8;
    const nudge = hover * size * 0.07;
    const right = margin + context.measureText(label).width + size * gapShare + cap + nudge;
    const top = baseline - cap - nudge;
    const left = right - square, bottom = top + square;
    // Proportions from the copy arrow (pages.js): a 1.5-unit stroke on 5.5-unit arms, so 1.5 of
    // the 7 units the ink spans, with the shaft cut to the arms' length. The ink fills the square:
    // the corner sits half a stroke in, and the shaft's slanted cut just touches the edges.
    const stroke = square * (1.5 / 7);
    const half = stroke / 2, cut = stroke / (2 * Math.SQRT2);
    context.strokeStyle = context.fillStyle;
    context.lineWidth = stroke;
    context.lineCap = 'butt';
    context.lineJoin = 'miter';
    context.beginPath();
    context.moveTo(left + cut, bottom - cut);
    context.lineTo(right - half, top + half);
    context.moveTo(left, top + half);
    context.lineTo(right - half, top + half);
    context.lineTo(right - half, bottom);
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
