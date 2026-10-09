import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CreditCard } from 'lucide-react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { DocumentItem } from '../lib/types';

const palette = [['#142a51', '#466dae'], ['#225950', '#6cb6a1'], ['#563961', '#b98bc8'], ['#594834', '#c4ab83']];
function cardTexture(item: DocumentItem, index: number) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 640;
  const ctx = canvas.getContext('2d')!;
  const colors = palette[index % palette.length], gradient = ctx.createLinearGradient(0, 0, 1024, 640);
  gradient.addColorStop(0, colors[1]); gradient.addColorStop(.6, colors[0]); gradient.addColorStop(1, colors[0]);
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1024, 640);
  ctx.strokeStyle = '#ffffff12'; ctx.lineWidth = 2;
  for (let n = 0; n < 6; n++) { ctx.beginPath(); ctx.ellipse(920, 500, 190 + n * 75, 200 + n * 50, -.6, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = '#ffffffbb'; ctx.font = '500 27px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.fillText('Exchange life', 70, 85);
  ctx.fillStyle = '#ffffff88'; ctx.textAlign = 'right'; ctx.fillText('证件卡包', 950, 85); ctx.textAlign = 'left';
  ctx.fillStyle = '#d5deee'; ctx.beginPath(); ctx.roundRect(70, 145, 85, 66, 12); ctx.fill();
  ctx.strokeStyle = '#7789a6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(98, 145); ctx.lineTo(98, 211); ctx.moveTo(127, 145); ctx.lineTo(127, 211); ctx.moveTo(70, 167); ctx.lineTo(155, 167); ctx.moveTo(70, 189); ctx.lineTo(155, 189); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.font = '600 52px -apple-system, BlinkMacSystemFont, sans-serif';
  let title = item.name;
  while (ctx.measureText(title).width > 875 && title.length > 1) title = title.slice(0, -1);
  if (title !== item.name) title = title.slice(0, -1) + '…';
  ctx.fillText(title, 70, 310);
  ctx.font = '400 37px monospace'; ctx.fillStyle = '#e1eaff'; ctx.fillText(item.number ? `••••  ${item.number.slice(-4)}` : '••••  ••••', 70, 386);
  ctx.font = '400 22px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.fillStyle = '#ffffff88'; ctx.fillText('有效期', 70, 505); ctx.fillText('我的交换生活', 720, 505);
  ctx.font = '500 29px -apple-system, BlinkMacSystemFont, sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText(item.expiryDate || '未设置', 70, 548);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

export default function WalletScene({ items, selected, onSelect }: { items: DocumentItem[]; selected: string | null; onSelect: (id: string) => void }) {
  const container = useRef<HTMLDivElement>(null), selectRef = useRef(onSelect);
  const [fallback, setFallback] = useState(false);
  selectRef.current = onSelect;
  const selectedIndex = Math.max(0, items.findIndex(item => item.id === selected));
  useEffect(() => {
    const host = container.current;
    if (!host || !items.length) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' }); } catch { setFallback(true); return; }
    setFallback(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-hidden', 'true'); host.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, .1, 30);
    camera.position.set(0, .1, 5.3); camera.lookAt(0, -.08, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 2.4));
    const light = new THREE.DirectionalLight(0xffffff, 4); light.position.set(-3, 5, 5); scene.add(light);
    const rim = new THREE.DirectionalLight(0xadc9ff, 2); rim.position.set(4, -1, 2); scene.add(rim);
    const group = new THREE.Group(); scene.add(group);
    const textures: THREE.Texture[] = [], geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
    const indices = [selectedIndex, ...items.map((_, i) => i).filter(i => i !== selectedIndex)].slice(0, 5);
    indices.reverse().forEach((index, depth) => {
      const item = items[index], back = indices.length - depth - 1;
      const card = new THREE.Group(); card.userData.id = item.id;
      const box = new RoundedBoxGeometry(3.6, 2.25, .075, 3, .15); geometries.push(box);
      const base = new THREE.MeshPhysicalMaterial({ color: palette[index % 4][0], metalness: .25, roughness: .32, clearcoat: 1, clearcoatRoughness: .2 }); materials.push(base);
      card.add(new THREE.Mesh(box, base));
      const shape = new THREE.Shape(), w = 1.79, h = 1.115, r = .14;
      shape.moveTo(-w + r, -h); shape.lineTo(w - r, -h); shape.quadraticCurveTo(w, -h, w, -h + r); shape.lineTo(w, h - r); shape.quadraticCurveTo(w, h, w - r, h); shape.lineTo(-w + r, h); shape.quadraticCurveTo(-w, h, -w, h - r); shape.lineTo(-w, -h + r); shape.quadraticCurveTo(-w, -h, -w + r, -h);
      const face = new THREE.ShapeGeometry(shape, 16), position = face.attributes.position, uv = face.attributes.uv;
      for (let i = 0; i < position.count; i++) uv.setXY(i, (position.getX(i) + w) / (w * 2), (position.getY(i) + h) / (h * 2));
      geometries.push(face);
      const texture = cardTexture(item, index); textures.push(texture);
      const ink = new THREE.MeshBasicMaterial({ map: texture }); materials.push(ink);
      const front = new THREE.Mesh(face, ink); front.position.z = .043; front.userData.id = item.id; card.add(front);
      card.position.set(back * .09, back * .22 - .18, -back * .19); card.rotation.set(-.05, -.12, -back * .035);
      group.add(card);
    });
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let targetX = 0, targetY = -.06, startX = 0, startY = 0, dragged = false, pressed = false, frame = 0, visible = true, lost = false;
    const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
    function render() {
      frame = 0;
      if (lost || !visible || document.hidden) return;
      group.rotation.x += (targetX - group.rotation.x) * .13; group.rotation.y += (targetY - group.rotation.y) * .13;
      renderer.render(scene, camera);
      if (Math.abs(targetX - group.rotation.x) + Math.abs(targetY - group.rotation.y) > .001) frame = requestAnimationFrame(render);
    }
    const invalidate = () => { if (!frame) frame = requestAnimationFrame(render); };
    function resize() { const bounds = host!.getBoundingClientRect(); renderer.setSize(bounds.width, bounds.height); camera.aspect = bounds.width / Math.max(bounds.height, 1); camera.updateProjectionMatrix(); invalidate(); }
    function down(event: PointerEvent) { if (!event.isPrimary) return; pressed = true; dragged = false; startX = event.clientX; startY = event.clientY; renderer.domElement.setPointerCapture(event.pointerId); }
    function move(event: PointerEvent) {
      if (!pressed || reduced) return;
      const dx = event.clientX - startX, dy = event.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 8) dragged = true;
      targetY = THREE.MathUtils.clamp(dx / 220, -.55, .55); targetX = THREE.MathUtils.clamp(dy / 320, -.2, .2); invalidate();
    }
    function up(event: PointerEvent) {
      if (!pressed) return; pressed = false;
      if (!dragged) {
        const bounds = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
        ray.setFromCamera(pointer, camera); const hit = ray.intersectObjects(group.children, true).find(result => result.object.userData.id);
        if (hit) selectRef.current(hit.object.userData.id);
      }
      targetX = 0; targetY = -.06; invalidate();
    }
    const cancel = () => { pressed = false; targetX = 0; targetY = -.06; invalidate(); };
    const contextLost = (event: Event) => { event.preventDefault(); lost = true; setFallback(true); };
    const contextRestored = () => { lost = false; setFallback(false); invalidate(); };
    const observer = new ResizeObserver(resize); observer.observe(host);
    const intersection = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) invalidate(); }); intersection.observe(host);
    renderer.domElement.addEventListener('pointerdown', down); renderer.domElement.addEventListener('pointermove', move); renderer.domElement.addEventListener('pointerup', up); renderer.domElement.addEventListener('pointercancel', cancel);
    renderer.domElement.addEventListener('webglcontextlost', contextLost); renderer.domElement.addEventListener('webglcontextrestored', contextRestored); document.addEventListener('visibilitychange', invalidate);
    resize();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); intersection.disconnect(); document.removeEventListener('visibilitychange', invalidate);
      renderer.domElement.removeEventListener('pointerdown', down); renderer.domElement.removeEventListener('pointermove', move); renderer.domElement.removeEventListener('pointerup', up); renderer.domElement.removeEventListener('pointercancel', cancel);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost); renderer.domElement.removeEventListener('webglcontextrestored', contextRestored);
      textures.forEach(texture => texture.dispose()); geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); renderer.dispose(); renderer.domElement.remove();
    };
  }, [items, selectedIndex]);
  if (!items.length) return null;
  const selectedItem = items[selectedIndex];
  return <section className="wallet-stage" aria-label="立体证件卡包">
    <div className="wallet-stage-caption"><span><CreditCard size={17} />我的卡包</span><span>{selectedIndex + 1} / {items.length}</span></div>
    <div className="wallet-canvas" ref={container}>{fallback && <div className="wallet-fallback"><CreditCard size={32} /><strong>{selectedItem.name}</strong><span>{selectedItem.number ? `•••• ${selectedItem.number.slice(-4)}` : '未填写号码'}</span></div>}</div>
    <div className="wallet-controls"><button className="icon-button" disabled={items.length < 2} aria-label="上一张证件" onClick={() => onSelect(items[(selectedIndex - 1 + items.length) % items.length].id)}><ChevronLeft size={21} /></button><div><strong>{selectedItem.name}</strong><small>{fallback ? '选择卡片查看详情' : '拖动旋转 · 点选下方卡片查看'}</small></div><button className="icon-button" disabled={items.length < 2} aria-label="下一张证件" onClick={() => onSelect(items[(selectedIndex + 1) % items.length].id)}><ChevronRight size={21} /></button></div>
  </section>;
}
