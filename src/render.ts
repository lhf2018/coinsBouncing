import {Container,Sprite,Texture,WebGLRenderer} from 'pixi.js';
import {cash,obstacles,speeds,type Game} from './game';
const W=390,H=844;
function point(x:number,y:number){return {x,y};}
const points=[point(128,388)];
function curve(a:ReturnType<typeof point>,b:ReturnType<typeof point>,end:ReturnType<typeof point>){
 const start=points.at(-1)!;
 for(let i=1;i<=48;i++){const t=i/48,u=1-t;points.push(point(u**3*start.x+3*u*u*t*a.x+3*u*t*t*b.x+t**3*end.x,u**3*start.y+3*u*u*t*a.y+3*u*t*t*b.y+t**3*end.y));}
}
curve(point(188,388),point(272,381),point(307,411));
curve(point(349,439),point(359,520),point(316,541));
curve(point(263,568),point(195,536),point(192,603));
curve(point(190,627),point(192,649),point(192,669));
const lengths=[0];
for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
const total=lengths.at(-1)!;
function sample(d:number){
 const i=Math.max(1,lengths.findIndex(v=>v>=Math.min(d,total)));const a=points[i-1],b=points[i];
 const t=(d-lengths[i-1])/(lengths[i]-lengths[i-1]);
 return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,r:Math.atan2(b.y-a.y,b.x-a.x)};
}
function path(g:CanvasRenderingContext2D,dx=0,dy=0){g.beginPath();points.forEach((p,i)=>i?g.lineTo(p.x+dx,p.y+dy):g.moveTo(p.x+dx,p.y+dy));}
function belt(g:CanvasRenderingContext2D,distance:number){
 g.lineJoin='round';g.lineCap='butt';
 path(g,-4,7);g.lineWidth=58;g.strokeStyle='#2846526b';g.stroke();
 const steel=g.createLinearGradient(162,356,203,687);
 steel.addColorStop(0,'#c5d4e5');steel.addColorStop(.45,'#687f99');steel.addColorStop(1,'#a9bcd1');
 path(g);g.lineWidth=56;g.strokeStyle='#27393e';g.stroke();
 path(g);g.lineWidth=53;g.strokeStyle=steel;g.stroke();
 path(g);g.lineWidth=43;g.strokeStyle='#273539';g.stroke();
 const phase=((distance/14400*total)%8+8)%8;
 for(let d=phase;d<=total;d+=8){const p=sample(d);const x=-Math.sin(p.r)*22,y=Math.cos(p.r)*22;
  g.beginPath();g.moveTo(p.x+x,p.y+y);g.lineTo(p.x-x,p.y-y);g.strokeStyle='#526269';g.lineWidth=2.5;g.stroke();}
 path(g);g.lineWidth=9;g.strokeStyle='#69848b12';g.stroke();
}
function amount(g:CanvasRenderingContext2D,text:string,x:number,y:number,size:number,rotation=0){g.save();g.translate(x,y);g.rotate(rotation);g.textAlign='center';g.textBaseline='middle';g.font='900 '+size+'px Arial';g.lineJoin='round';g.lineWidth=3;g.strokeStyle='#172132';g.strokeText(text,0,0);g.fillStyle='#c7f39e';g.fillText(text,0,0);g.restore();}
function token(g:CanvasRenderingContext2D,value:bigint,x:number,y:number,rotation=0,scale=1){
 g.save();g.translate(x,y);g.rotate(rotation);g.scale(scale,scale);
 g.font='800 22px system-ui';g.textAlign='left';g.textBaseline='alphabetic';
 const text='$'+cash(value);
 const bounds=g.measureText(text);
 // Center the visible glyphs on the pivot, including the currency symbol.
 const offsetX=(bounds.actualBoundingBoxLeft-bounds.actualBoundingBoxRight)/2;
 const offsetY=(bounds.actualBoundingBoxAscent-bounds.actualBoundingBoxDescent)/2;
 g.fillStyle='#c7f39e';g.fillText(text,offsetX,offsetY);
 g.restore();
}
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
function paint(g:CanvasRenderingContext2D,game:Game,work:boolean,alpha:number){
 g.clearRect(0,0,W,H);
 const offset=(alpha-1)*speeds[game.s.speed];
 if(work){
  belt(g,game.distance+offset);
  for(const c of game.track){const p=sample(Math.max(0,Math.min(total,(c.distance+offset)*total/14400)));token(g,c.value,p.x,p.y,Math.atan(Math.tan(p.r)));}
  const angle=(game.distance+offset)/75;
  document.querySelector<HTMLElement>('.stage')?.style.setProperty('--gear-turn',angle+'deg');return;
 }
 for(const [x,y,r] of obstacles[game.s.stage]){
  g.beginPath();g.arc(x+3,y+5,r,0,Math.PI*2);g.fillStyle='#263653';g.fill();g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fillStyle='#859ab6';g.fill();g.strokeStyle='#253553';g.lineWidth=3;g.stroke();
 }
 for(const c of game.coins.values()){
  const p=c.body.translation();
  const age=Math.max(0,game.tick-c.impactTick-1+alpha)/60;
  const rebound=Math.min(age/.085,Math.max(0,(.38-age)/.295));
  const rotation=reduce.matches?0:c.spin*Math.sin(age*9)*Math.exp(-age*2.4);
  const scale=reduce.matches?1:1+Math.min(.17,c.impact*.055)*rebound;
  token(g,c.value,c.x+(p.x*30-c.x)*alpha,c.y+(p.y*30-c.y)*alpha,rotation,scale);
 }
 for(const e of game.effects){const age=game.tick-e.tick;g.globalAlpha=1-age/36;amount(g,'+$'+cash(e.value),e.x,e.y-(reduce.matches?0:age*.55),19);}
 g.globalAlpha=1;
}
export async function createScene(mount:Element){
 const dpr=Math.min(2,devicePixelRatio||1);const scene=document.createElement('canvas');scene.width=W*dpr;scene.height=H*dpr;
 const g=scene.getContext('2d',{alpha:true})!;g.scale(dpr,dpr);
 let present=()=>{};
 const fallback=()=>{mount.replaceChildren(scene);present=()=>{};};
 try {
  const gpu=document.createElement('canvas');const gl=gpu.getContext('webgl2',{alpha:true,antialias:true});
  if(!gl)fallback();
  else {
   const renderer=new WebGLRenderer();await renderer.init({canvas:gpu,context:gl,width:W,height:H,resolution:dpr,backgroundAlpha:0});
   const texture=Texture.from(scene);const sprite=new Sprite(texture);sprite.width=W;sprite.height=H;
   const layer=new Container();layer.addChild(sprite);mount.replaceChildren(gpu);
   present=()=>{texture.source.update();renderer.render(layer);};
   gpu.addEventListener('webglcontextlost',e=>{e.preventDefault();fallback();},{once:true});
  }
 }catch{fallback();}
 return {draw(game:Game,work:boolean,alpha:number){paint(g,game,work,alpha);present();}};
}
