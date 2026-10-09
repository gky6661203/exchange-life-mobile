import { useEffect, useRef } from 'react';
import * as THREE from 'three';
export default function SpatialMark({ hero=false, tone='blue' }: {hero?:boolean;tone?:string}) {
  const host=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!host.current)return;const target=host.current;let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.3));renderer.outputColorSpace=THREE.SRGBColorSpace;target.appendChild(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.1,30),group=new THREE.Group();scene.add(group);camera.position.set(0,0,hero?7:4.8);
    scene.add(new THREE.AmbientLight(0xffffff,2.4));const light=new THREE.DirectionalLight(0xffffff,5);light.position.set(-3,5,4);scene.add(light);const rim=new THREE.DirectionalLight(0xb9d9ff,2);rim.position.set(3,-1,2);scene.add(rim);
    const materials:THREE.Material[]=[],geometries:THREE.BufferGeometry[]=[];
    function material(color:string){const value=new THREE.MeshPhysicalMaterial({color,metalness:.18,roughness:.23,clearcoat:1});materials.push(value);return value;}
    function mesh(geometry:THREE.BufferGeometry,mat:THREE.Material,parent:THREE.Group,x=0,y=0,z=0){geometries.push(geometry);const object=new THREE.Mesh(geometry,mat);object.position.set(x,y,z);parent.add(object);return object;}
    const ai=new THREE.Group(),fitness=new THREE.Group(),stock=new THREE.Group();
    mesh(new THREE.TorusKnotGeometry(.53,.18,72,12,2,3),material('#6c83ee'),ai);ai.rotation.set(.3,-.4,.2);
    const green=material('#79cba9');const bar=mesh(new THREE.CylinderGeometry(.13,.13,1.3,20),material('#d2e1ed'),fitness);bar.rotation.z=Math.PI/2;[-.65,.65].forEach(x=>{const cap=mesh(new THREE.CylinderGeometry(.37,.37,.28,32),green,fitness,x);cap.rotation.z=Math.PI/2;});fitness.rotation.set(.25,.1,-.4);
    const orange=material('#edb86d');for(let i=0;i<3;i++){const coin=mesh(new THREE.CylinderGeometry(.57,.57,.13,48),orange,stock,0,-.3+i*.21,0);coin.rotation.x=.15;}stock.rotation.set(.3,.2,-.2);
    if(hero){ai.position.x=-1.65;stock.position.x=1.65;group.add(ai,fitness,stock);}else group.add(tone==='green'?fitness:tone==='orange'?stock:ai);
    group.rotation.y=-.1;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;let visible=true;
    const render=()=>{if(visible&&!document.hidden)renderer.render(scene,camera);};
    const resize=()=>{const bounds=target.getBoundingClientRect();renderer.setSize(bounds.width,bounds.height);camera.aspect=bounds.width/Math.max(1,bounds.height);camera.updateProjectionMatrix();render();};
    const pointer=(event:PointerEvent)=>{if(reduced)return;const bounds=target.getBoundingClientRect();group.rotation.y=(event.clientX-bounds.left)/bounds.width*.6-.3;group.rotation.x=(event.clientY-bounds.top)/bounds.height*.25-.125;render();};
    const reset=()=>{group.rotation.set(0,-.1,0);render();};const observer=new ResizeObserver(resize);observer.observe(target);const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;render();});intersection.observe(target);
    target.addEventListener('pointermove',pointer);target.addEventListener('pointerleave',reset);document.addEventListener('visibilitychange',render);resize();
    return()=>{observer.disconnect();intersection.disconnect();target.removeEventListener('pointermove',pointer);target.removeEventListener('pointerleave',reset);document.removeEventListener('visibilitychange',render);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
  },[hero,tone]);
  return <div className={`spatial-mark ${hero?'hero-mark':''}`} ref={host} aria-hidden="true"/>;
}
