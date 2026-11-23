import './style.css';
import {Game,slots,goals,speeds,cash,label,type Place} from './game';
import {createScene} from './render';
const root=document.querySelector<HTMLElement>('#game')!;
const bill='<i class="bill" aria-hidden="true">$</i>';
const at=(x:number,y:number)=>' style="left:'+x+'px;top:'+y+'px"';
root.innerHTML='<div class="stage"><div class="hud">'+bill+'<b data-wallet>40</b></div><div class="panels"><section id="board" aria-label="弹跳盘面"><div class="art" aria-hidden="true"></div><div class="rim"></div><div class="sack" aria-hidden="true"></div><div id="pegs">'+slots.map(([x,y],i)=>'<button class="peg" data-place="board:'+i+'"'+at(x,y)+'></button>').join('')+'</div><div class="floor"></div><button id="next" class="card lime" data-action="next"></button><div class="dock"><button class="card yellow" id="upgrade" data-action="workshop">升级<i class="upgrade-arrow" aria-hidden="true"></i></button><button class="card violet" id="reward" data-action="reward" hidden>领取倍率弹块</button><div class="bag">'+Array.from({length:6},(_,i)=>'<button class="cell" data-place="bag:'+i+'"></button>').join('')+'</div><button class="card violet" id="boardSpeed" data-action="workshop" aria-label="传送带速度，打开工坊"></button><button class="card cyan" id="buy" data-action="buy"></button></div><div class="guide" id="guide"><span></span><button data-action="skip">跳过</button></div></section><section id="workshop" aria-label="传送带工坊" inert><div class="art" aria-hidden="true"></div><header class="workshop-header"><button data-action="board" class="workshop-back" aria-label="返回盘面"><i aria-hidden="true"></i></button><h1>传送带工坊</h1></header><div class="modules"><div class="module" id="speedModule"></div><div class="module" id="valueModule"></div><div class="module" id="gearModule"></div><div class="module" id="timeModule"></div></div><div class="machine-deck" aria-hidden="true"></div><div class="motor" aria-hidden="true"><div class="motor-roller"></div><div class="motor-vents"></div><div class="motor-light"></div></div><div class="hopper" aria-hidden="true"><span class="hopper-mouth"></span></div><div class="gear-row">'+Array.from({length:3},()=>'<div class="gear-cell"><i class="cog" aria-hidden="true"></i></div>').join('')+'</div><div class="controls"><button class="card lime" id="speed" data-action="speed"></button><button class="card cyan" id="gear" data-action="gear"></button></div><div id="workshopGuide" class="guide">点击绿色速度卡加速<button data-action="visit">跳过</button></div></section></div><div id="ghost" class="piece" hidden></div><div id="toast" role="status" hidden></div></div>';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.querySelector<T>('#'+id)!;
const stage=root.querySelector<HTMLElement>('.stage')!;
const board=$('board'); const workshop=$('workshop');
const pegButtons=[...root.querySelectorAll<HTMLButtonElement>('[data-place]')];
const gearCells=[...root.querySelectorAll<HTMLElement>('.gear-cell')];
const ghost=$('ghost');
let game:Game;let timer=0;let selection:Place|null=null;
let drag:{id:number;place:Place;x:number;y:number;active:boolean}|null=null;
let suppressClick=false;
const commands: (()=>void)[]=[];
const isWorkshop=()=>location.hash==='#workshop';
const wallets=root.querySelectorAll<HTMLElement>('[data-wallet]');
const panels=root.querySelector<HTMLElement>('.panels')!;
let sliding=false;
panels.addEventListener('transitionend',e=>{if(e.target===panels&&e.propertyName==='transform')sliding=false;});
const same=(a:Place|null,b:Place)=>a?.area===b.area&&a.index===b.index;
function place(el:HTMLElement):Place {const [area,index]=el.dataset.place!.split(':');return {area:area as Place['area'],index:Number(index)};}
function toast(text:string){const el=$('toast');el.textContent=text;el.hidden=false;clearTimeout(timer);timer=window.setTimeout(()=>el.hidden=true,1800);}
function content(el:HTMLElement,html:string){if(el.dataset.content!==html){el.innerHTML=html;el.dataset.content=html;}}
function availability(el:HTMLElement,reason:string){el.classList.toggle('blocked',!!reason);el.setAttribute('aria-disabled',String(!!reason));el.title=reason;}
function refresh(){
 if(!game)return;
 const s=game.s;
 for(const wallet of wallets){wallet.textContent=cash(s.wallet);wallet.title=s.wallet.toString();}
 for(const button of pegButtons){
  const p=place(button);const v=s[p.area][p.index];const locked=p.area==='board'&&!s.open[p.index];
  button.classList.toggle('locked',locked);button.classList.toggle('selected',same(selection,p));
  button.classList.toggle('filled',!!v);button.classList.toggle('multiplier',v<0);
  content(button,locked?cash(game.unlockPrice)+bill:v?'<span class="piece">'+label(v)+'</span>':'');
  button.setAttribute('aria-label',(p.area==='board'?'盘面':'库存')+(p.index+1)+' '+(locked?'解锁 '+game.unlockPrice:v?label(v):'空格'));
 }
 const full=!s.bag.includes(0);const buyReason=full?'库存已满':s.wallet<game.price?'金币不足':'';
 content($('buy'),'购买数字<small>'+cash(game.price)+bill+'</small>');availability($('buy'),buyReason);
 const ready=s.income>=goals[s.stage];
 content($('next'),(ready&&s.stage===2?'全部通关':'下一关')+'<small>'+cash(s.income)+' / '+cash(goals[s.stage])+'</small>');
 availability($('next'),!ready?'累计入账达标后解锁':s.stage===2?'已通关':'');
 $('reward').hidden=s.stage===0||s.reward;
 const speed=speeds[s.speed];const delay=Number((120/speed).toFixed(1));
 content($('boardSpeed'),'<span>速度</span><b>×'+(speed/100)+'</b>');
 const {speedPrice,gearPrice}=game;
 content($('speed'),'<span>升级速度</span><small>'+(speedPrice?cash(speedPrice)+bill:'已满级')+'</small>');
 content($('gear'),'<span>增加齿轮</span><small>'+(gearPrice?cash(gearPrice)+bill:'已满装')+'</small>');
 availability($('speed'),!speedPrice?'已满级':s.wallet<speedPrice?'金币不足':'');
 availability($('gear'),!gearPrice?'已满':s.wallet<gearPrice?'金币不足':'');
 content($('speedModule'),'<span>速度等级</span><b>'+(s.speed+1)+' <em>级</em></b>');
 content($('valueModule'),'<span>初始金额</span><b>$'+(1+s.gears)+'</b>');
 content($('gearModule'),'<span>已装齿轮</span><b>'+s.gears+' <em>/ 3</em></b>');
 content($('timeModule'),'<span>供币间隔</span><b>'+delay+' <em>秒</em></b>');
 gearCells.forEach((el,i)=>el.classList.toggle('installed',i<s.gears));
 $('guide').hidden=s.guide>=3;$('guide').querySelector('span')!.textContent=['先购买一个数字','把两个相同数字拖到一起','将合成后的数字放进盘面空槽'][s.guide]??'';
 $('workshopGuide').hidden=s.visited;
}
function workshopEffect(kind:'speed'|'gear',gearIndex=0){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const panel=$(kind==='speed'?'speedModule':'gearModule');
 panel.animate([{boxShadow:'inset 0 0 0 2px #99e4ba, 0 0 18px #65d59c70'},{boxShadow:'inset 0 0 0 2px transparent, 0 0 18px transparent'}],650);
 if(kind==='speed')workshop.querySelector('.motor-light')?.animate([{filter:'brightness(2.3)'},{filter:'brightness(1)'}],650);
 else gearCells[gearIndex].animate([{transform:'translateY(-12px)',opacity:.65},{transform:'translateY(0)',opacity:1}],{duration:320,easing:'ease-out'});
}
function route(){
 drag=null;ghost.hidden=true;selection=null;
 const work=isWorkshop();
 const changing=stage.classList.contains('work')!==work;
 const focusFollows=changing&&(board.contains(document.activeElement)||workshop.contains(document.activeElement));
 if(changing)sliding=stage.classList.contains('ready')&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
 stage.classList.toggle('work',work);
 board.inert=work;workshop.inert=!work;
 if(focusFollows)(work?workshop.querySelector<HTMLButtonElement>('.workshop-back'):$<HTMLButtonElement>('upgrade'))?.focus({preventScroll:true});
 refresh();
}
function activate(p:Place){
 if(p.area==='board'&&!game.s.open[p.index]){game.action('unlock',p.index);return;}
 if(selection&&!same(selection,p)){game.move(selection,p);selection=null;}else selection=selection||!game.s[p.area][p.index]?null:p;
 refresh();
}
root.addEventListener('click',e=>{
 if(!game)return;
 const target=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!target)return;
 if(target.dataset.place){if(!suppressClick){const p=place(target);commands.push(()=>activate(p));}return;}
 const action=target.dataset.action;
 if(action==='workshop'||action==='board'){location.hash=action;return;}
 if(action==='next'&&target.getAttribute('aria-disabled')==='true'){if(game.s.stage<2)toast(target.title);return;}
 if(action)commands.push(()=>{const {speed,gears}=game.s;game.action(action);if(game.s.speed!==speed){workshopEffect('speed');if(!game.s.visited)game.action('visit');}if(game.s.gears!==gears)workshopEffect('gear',gears);});
});
root.addEventListener('pointerdown',e=>{
 if(!game||drag||e.button!==0)return;
 const el=(e.target as HTMLElement).closest<HTMLElement>('[data-place]');if(!el)return;
 const p=place(el);if(!game.s[p.area][p.index])return;
 drag={id:e.pointerId,place:p,x:e.clientX,y:e.clientY,active:false};el.setPointerCapture(e.pointerId);
});
root.addEventListener('pointermove',e=>{
 if(!drag||drag.id!==e.pointerId)return;
 if(!drag.active&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<5)return;
 drag.active=true;ghost.hidden=false;ghost.textContent=label(game.s[drag.place.area][drag.place.index]);
 const r=stage.getBoundingClientRect();ghost.style.left=(e.clientX-r.left)*390/r.width+'px';ghost.style.top=(e.clientY-r.top)*844/r.height+'px';
});
root.addEventListener('pointerup',e=>{
 if(!drag||drag.id!==e.pointerId)return;
 if(drag.active){
  suppressClick=true;window.setTimeout(()=>suppressClick=false,0);
  const el=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-place]');
  if(el){const from=drag.place,to=place(el);commands.push(()=>game.move(from,to));}selection=null;refresh();
 }
 drag=null;ghost.hidden=true;
});
root.addEventListener('pointercancel',()=>{drag=null;ghost.hidden=true;});
addEventListener('hashchange',route);
function resize(){const scale=Math.min(root.clientWidth/390,root.clientHeight/844);stage.style.transform='scale('+scale+')';}
new ResizeObserver(resize).observe(root);resize();
async function start(){
 game=await Game.create(toast,refresh);
 const [boardScene,workshopScene]=await Promise.all([createScene(board.querySelector('.art')!),createScene(workshop.querySelector('.art')!)]);
 route();
 stage.getBoundingClientRect();
 stage.classList.add('ready');
 let last=0;let accum=0;const step=1000/60;

 document.addEventListener('visibilitychange',()=>{last=0;accum=0;if(document.hidden)game.save();});
 addEventListener('pagehide',()=>game.save());
 function frame(time:number){
  if(!document.hidden){accum+=last?Math.min(time-last,step*5):0;while(accum>=step){for(const command of commands.splice(0))command();game.step();accum-=step;}last=time;const work=isWorkshop();if(sliding||!work)boardScene.draw(game,false,accum/step);if(sliding||work)workshopScene.draw(game,true,accum/step);}
  requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
}
start().catch(error=>{console.error(error);toast('游戏启动失败，请刷新重试。');});
