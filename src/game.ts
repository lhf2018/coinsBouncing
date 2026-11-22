import R from '@dimforge/rapier2d-compat';
export const slots = [[75,270],[195,270],[315,270],[135,367],[255,367],[75,464],[195,464],[315,464]];
export const obstacles = [[],[[195,177,25]],[[122,320,19],[268,416,19]]];
export const goals = [300n,1800n,7000n];
export const speeds = [100,120,145,175,210];
export const speedCost = [100n,220n,450n,900n];
export const gearCost = [180n,420n,900n];
export const slotCost = [100n,180n,300n,500n,800n];
const purchasePool = [1, 2, -110, -120] as const;
const legacyMultiplier = -1;
const maxMultiplier = 200;
const multiplierPercent = (piece:number) => piece === legacyMultiplier ? 125 : -piece;
export const label = (piece:number) => piece < 0 ? '×' + multiplierPercent(piece) / 100 : '+' + piece;
function isPiece(piece:number) {
  return [-1,0,1,2,4,8,16,32,64,128,256].includes(piece)
    || Number.isInteger(piece) && piece <= -110 && piece >= -maxMultiplier && piece % 10 === 0;
}
function mergedPiece(piece:number) {
  if (piece > 0) return piece < 256 ? piece * 2 : 0;
  const percent = multiplierPercent(piece);
  if (percent >= maxMultiplier) return 0;
  return -(Math.floor(percent / 10) * 10 + 10);
}
export function cash(n:bigint) {
 for(const [unit,suffix] of [[1000000000n,'B'],[1000000n,'M'],[1000n,'K']] as const) if(n>=unit){
  const decimals=String(n%unit*100n/unit).padStart(2,'0').replace(/0+$/,'');
  return String(n/unit)+(decimals?'.'+decimals:'')+suffix;
 }
 return String(n);
}
const initial=()=>({wallet:40n,income:0n,stage:0,speed:0,gears:0,bought:0,reward:false,guide:0,visited:false,board:[0,2,0,0,0,0,0,0],bag:[2,0,0,0,0,0],open:[true,true,true,false,false,false,false,false]});
type State=ReturnType<typeof initial>;
export type Place={area:'board'|'bag';index:number};
type Coin={body:R.RigidBody;value:bigint;born:number;hits:number;last:Map<number,number>;x:number;y:number;vx:number;vy:number;impactTick:number;spin:number;impact:number;stuckTicks:number};
const keys=['mint.0','mint.1'];
function decode(raw:string|null){
 try {
  const record=JSON.parse(raw??'null');
  if(!record || ![1,2].includes(record.version) || !Number.isSafeInteger(record.rev) || record.rev<0) return;
  const s=record.state; const state={...initial(),...s} as State;
  for(const key of ['wallet','income'] as const){ if(typeof s[key]!=='string'||!/^\d{1,256}$/.test(s[key])) return; state[key]=BigInt(s[key]); }
  for(const [key,max] of [['stage',2],['speed',4],['gears',3],['bought',3300],['guide',3]] as const){ if(!Number.isInteger(state[key])||state[key]<0||state[key]>max) return; }
  for(const [items,length] of [[state.board,8],[state.bag,6]] as const) if(!Array.isArray(items)||items.length!==length||items.some(p=>!isPiece(p))) return;
  if(!Array.isArray(state.open)||state.open.length!==8||state.open.some((v,i)=>typeof v!=='boolean'||(i<3&&!v)||(!v&&state.board[i]!==0)))return;
  if(typeof state.reward!=='boolean'||typeof state.visited!=='boolean'||[...state.board,...state.bag].filter(v=>v===-1).length>1)return;
  return {rev:record.rev as number,state};
 } catch {return;}
}
export class Game {
 static async create(notify:(s:string)=>void,refresh:()=>void){ await R.init(); return new Game(notify,refresh); }
 s=initial(); tick=0; distance=0; private emission=7200; private seed=1729;
 track:{distance:number;value:bigint}[]=[];
 coins=new Map<number,Coin>();
 effects:{x:number;y:number;value:bigint;tick:number}[]=[];
 private world=new R.World({x:0,y:7});
 private events=new R.EventQueue(true);
 private pegs=new Map<number,R.Collider>();
 private barriers:R.Collider[]=[];
 private revision=0; private blocked=false; private dirty=false;
 constructor(private notify:(s:string)=>void,private refresh:()=>void){
  try { const latest=keys.map(k=>decode(localStorage.getItem(k))).sort((a,b)=>(b?.rev??-1)-(a?.rev??-1))[0]; if(latest){this.s=latest.state;this.revision=latest.rev;} } catch {this.storageError();}
  addEventListener('storage',e=>{if(e.key && keys.includes(e.key) && (decode(e.newValue)?.rev??0)>this.revision){this.blocked=true;this.notify('另一标签页更新了存档，请刷新。');}});
  this.world.timestep=1/60;
  for(const x of [8,382])this.world.createCollider(R.ColliderDesc.cuboid(.13,9).setTranslation(x/30,10).setCollisionGroups(0x20001).setRestitution(.76));
  this.geometry();this.sync();this.emit(0);
 }
 private storageError(){this.blocked=true;this.notify('本地存储不可用，进度保留在本次会话。');}
 save(){ if(this.blocked||!this.dirty)return; try {const rev=this.revision+1; localStorage.setItem(keys[rev%2],JSON.stringify({version:2,rev,state:{...this.s,wallet:String(this.s.wallet),income:String(this.s.income)}}));this.revision=rev;this.dirty=false;}catch{this.storageError();} }
 get price(){return BigInt(Math.ceil(20*1.18**this.s.bought));}
 get unlockPrice(){return slotCost[this.s.open.filter(Boolean).length-3];}
 private change(){this.dirty=true;this.save();this.refresh();}
 private pay(price:bigint){if(this.s.wallet<price){this.notify('金币不足');return false;}this.s.wallet-=price;return true;}
 action(kind:string,index=0){
  const s=this.s;
  if(kind==='buy'){
   const open=s.bag.indexOf(0); if(open<0){this.notify('库存已满');return;}if(s.bought>=3300||!this.pay(this.price))return;
   const piece=purchasePool[Math.floor(Math.random()*purchasePool.length)];
   s.bag[open]=piece;s.bought++;if(!s.guide)s.guide=1;
   this.notify('获得 '+label(piece));
  }else if(kind==='speed'){
   if(s.speed>=4||!this.pay(speedCost[s.speed]))return;s.speed++;this.notify('传送带已提速');
  }else if(kind==='gear'){
   if(s.gears>=3||!this.pay(gearCost[s.gears]))return;s.gears++;this.notify('齿轮已安装');
  }else if(kind==='unlock'){
   if(s.open[index]||!this.pay(this.unlockPrice))return;s.open[index]=true;
  }else if(kind==='next'){
   if(s.stage===2||s.income<goals[s.stage])return;
   for(const id of this.coins.keys())this.settle(id);
   this.effects=[];s.stage++;s.income=0n;this.geometry();this.reward();
  }else if(kind==='reward'){
   if(!this.reward()){this.notify('腾出一个空格后领取');return;}
  }else if(kind==='skip'){s.guide=3;
  }else if(kind==='visit'){s.visited=true;
  }else return;
  this.change();
 }
 move(from:Place,to:Place){
  const s=this.s;
  if(from.area===to.area&&from.index===to.index||to.area==='board'&&!s.open[to.index])return;
  const p=s[from.area][from.index];const q=s[to.area][to.index];if(!p)return;
  const merge=p===q?mergedPiece(p):0;
  s[from.area][from.index]=merge?0:q;s[to.area][to.index]=merge||p;
  if(s.guide===2&&to.area==='board')s.guide=3;
  else if(s.guide===1&&merge)s.guide=to.area==='board'?3:2;
  this.sync();this.change();
 }
 private reward(){
  const s=this.s;if(!s.stage||s.reward)return false;
  const board=s.board.findIndex((p,i)=>!p&&s.open[i]);const bag=s.bag.indexOf(0);
  if(board>=0)s.board[board]=-1;else if(bag>=0)s.bag[bag]=-1;else return false;
  s.reward=true;this.sync();return true;
 }
 private circle(x:number,y:number,r:number){return this.world.createCollider(R.ColliderDesc.ball(r/30).setTranslation(x/30,y/30).setCollisionGroups(0x20001).setRestitution(.98).setFriction(.06));}
 private geometry(){for(const c of this.barriers)this.world.removeCollider(c,false);this.barriers=obstacles[this.s.stage].map(([x,y,r])=>this.circle(x,y,r));}
 private sync(){
  this.s.board.forEach((p,i)=>{
   const collider=this.pegs.get(i);
   if(p&&!collider){const [x,y]=slots[i];this.pegs.set(i,this.circle(x,y,22));for(const coin of this.coins.values()){const at=coin.body.translation();if(Math.hypot(at.x*30-x,at.y*30-y)<=30)coin.last.set(i,this.tick);}}
   else if(!p&&collider){this.world.removeCollider(collider,false);this.pegs.delete(i);}
  });
 }
 private emit(distance:number){this.track.push({distance,value:BigInt(1+this.s.gears)});}
 private spawn(value:bigint){
  this.seed=(Math.imul(1664525,this.seed)+1013904223)>>>0;
  const x=195+(this.seed/4294967296-.5)*34;
  const body=this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x/30,118/30).setLinvel((x-195)/52,.75).setCcdEnabled(true));
  const shape=this.world.createCollider(R.ColliderDesc.ball(8/30).setCollisionGroups(0x10002).setRestitution(.98).setFriction(.04).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),body);
  this.coins.set(shape.handle,{body,value,born:this.tick,hits:0,last:new Map(),x,y:118,vx:0,vy:0,impactTick:-100,spin:0,impact:0,stuckTicks:0});
 }
 private settle(id:number){const coin=this.coins.get(id);if(!coin)return;this.coins.delete(id);this.world.removeRigidBody(coin.body);this.s.wallet+=coin.value;this.s.income+=coin.value;this.dirty=true;this.effects.push({x:Math.max(35,Math.min(355,coin.x)),y:565,value:coin.value,tick:this.tick});}
 step(){
  this.tick++;const delta=speeds[this.s.speed];this.distance+=delta;
  for(const c of this.track)c.distance+=delta;
  while(this.distance>=this.emission){this.emit(this.distance-this.emission);this.emission+=7200;}
  while(this.track[0]?.distance>=14400)this.spawn(this.track.shift()!.value);
  for(const c of this.coins.values()){
   const p=c.body.translation();const v=c.body.linvel();
   c.body.setGravityScale(v.y<0?2.6:1,true);
   c.x=p.x*30;c.y=p.y*30;c.vx=v.x;c.vy=v.y;
  }
  this.world.step(this.events);
  const contacts:[number,number][]=[];
  this.events.drainCollisionEvents((a,b,start)=>{
   if(!start)return;const id=this.coins.has(a)?a:b;const other=id===a?b:a;
   const coin=this.coins.get(id);
   if(!coin)return;
   const velocity=coin.body.linvel();
   const impulse=Math.hypot(velocity.x-coin.vx,velocity.y-coin.vy);
   if(impulse>.4 && (coin.impactTick!==this.tick || impulse>coin.impact)){
    const turn=coin.vx*velocity.y-coin.vy*velocity.x;
    coin.impactTick=this.tick;
    coin.impact=impulse;
    coin.spin=Math.sign(turn)*Math.min(.45,Math.abs(turn)*.09);
   }
   for(const [i,p] of this.pegs)if(p.handle===other){
    contacts.push([id,i]);
    const center=p.translation();
    const position=coin.body.translation();
    if(coin.hits<12){
     const dx=position.x-center.x,dy=position.y-center.y;
     const length=Math.hypot(dx,dy)||1;
     let nx=dx/length,ny=dy/length;
     // Preserve the surface direction and add enough lateral motion for chains.
     if(ny<-.35){
      const direction=Math.abs(nx)>.08?Math.sign(nx):Math.sign(coin.vx)||((i%2)?1:-1);
      nx=direction*Math.max(.38,Math.abs(nx));
      ny=-Math.max(.45,Math.abs(ny));
     }
     const normalLength=Math.hypot(nx,ny);
     const speed=Math.min(10,Math.max(8,Math.hypot(coin.vx,coin.vy)*1.15));
     const vx=nx/normalLength*speed,vy=ny/normalLength*speed;
     coin.body.setLinvel({x:vx,y:vy},true);
     coin.body.setGravityScale(vy<0?2.6:1,true);
     coin.impactTick=this.tick;
     coin.impact=Math.hypot(vx-coin.vx,vy-coin.vy);
     coin.spin=Math.sign(vx)||1;
     coin.spin*=.55;
    }
   }
  });
  contacts.sort((a,b)=>a[1]-b[1]);
  for(const [id,i] of contacts){
   const c=this.coins.get(id)!;if(c.hits>=12||this.tick-(c.last.get(i)??-100)<21)continue;
   const p=this.s.board[i];c.hits++;c.last.set(i,this.tick);c.value=p<0?(c.value*BigInt(multiplierPercent(p))+99n)/100n:c.value+BigInt(p);

  }
  let settled=false;
  for(const [id,c] of this.coins){
   const p=c.body.translation();const v=c.body.linvel();
   // A brief fast rebound gives way to a slower readable descent.
   const fallLimit=this.tick-c.impactTick<10?6:2.8;
   if(v.y>fallLimit)c.body.setLinvel({x:v.x,y:fallLimit},true);
   if(p.y*30>=576){this.settle(id);settled=true;continue;}
   // Keep escaped coins visible and let them return to the collection line.
   if(p.x*30<20||p.x*30>370||p.y*30<20){
    const x=Math.max(20,Math.min(370,p.x*30));
    const y=Math.max(20,p.y*30);
    c.body.setTranslation({x:x/30,y:y/30},true);c.x=x;c.y=y;
    c.body.setLinvel({x:p.x*30<20?Math.abs(v.x):p.x*30>370?-Math.abs(v.x):v.x,y:p.y*30<20?Math.max(.6,v.y):v.y},true);
   }
   c.stuckTicks=Math.hypot(v.x,v.y)<.3?c.stuckTicks+1:0;
   if(c.stuckTicks>=120){
    c.body.setLinvel({x:p.x*30<=195?1.3:-1.3,y:-1.2},true);
    c.stuckTicks=0;
   }
  }
  if(settled)this.refresh();
  this.effects=this.effects.filter(e=>this.tick-e.tick<36);
  if(this.tick%120===0)this.save();
 }
}
