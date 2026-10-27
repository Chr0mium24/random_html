'use strict';
const board=document.querySelector('#board'),ctx=board.getContext('2d'),overlay=document.querySelector('#effects'),fx=overlay.getContext('2d');
const TAU=Math.PI*2,dirs=[[1,0],[0,1],[1,1],[1,-1]],rand=(a,b)=>a+Math.random()*(b-a),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
let cells,player=1,finished=false,last=null,winning=[],size=0,pad=0,gap=0,w=innerWidth,h=innerHeight,animations=[],ending=null,audio,lastType=-1,frameId=0,effectWeight=1;
function wake(){if(!frameId&&!document.hidden)frameId=requestAnimationFrame(frame)}
function reset(){cells=Array.from({length:15},()=>Array(15).fill(0));player=1;finished=false;last=null;winning=[];animations=[];ending=null;board.style.transform='';fx.clearRect(0,0,w,h);draw()}
function resize(){const d=Math.min(devicePixelRatio||1,2);size=board.getBoundingClientRect().width;pad=size*.065;gap=(size-2*pad)/14;board.width=board.height=Math.round(size*d);ctx.setTransform(d,0,0,d,0,0);w=innerWidth;h=innerHeight;const effectScale=Math.min(devicePixelRatio||1,1.25,Math.sqrt(1600000/(w*h)));overlay.width=Math.round(w*effectScale);overlay.height=Math.round(h*effectScale);fx.setTransform(effectScale,0,0,effectScale,0,0);draw();wake()}
function draw(){if(!size||!cells)return;ctx.clearRect(0,0,size,size);const g=ctx.createLinearGradient(0,0,size,size);g.addColorStop(0,'#dbba88');g.addColorStop(1,'#ac8151');ctx.fillStyle=g;ctx.fillRect(0,0,size,size);ctx.strokeStyle='#563d2866';ctx.lineWidth=1;for(let i=0;i<15;i++){const a=pad+i*gap;ctx.beginPath();ctx.moveTo(a,pad);ctx.lineTo(a,size-pad);ctx.moveTo(pad,a);ctx.lineTo(size-pad,a);ctx.stroke()}for(const [x,y] of [[3,3],[11,3],[7,7],[3,11],[11,11]]){ctx.fillStyle='#64462b';ctx.beginPath();ctx.arc(pad+x*gap,pad+y*gap,2.8,0,TAU);ctx.fill()}for(let y=0;y<15;y++)for(let x=0;x<15;x++){if(!cells[y][x])continue;const px=pad+x*gap,py=pad+y*gap,r=gap*.435;const g=ctx.createRadialGradient(px-r*.35,py-r*.4,0,px,py,r);g.addColorStop(0,cells[y][x]===1?'#505b70':'#fff');g.addColorStop(1,cells[y][x]===1?'#060912':'#bcc7d8');ctx.shadowColor='#0008';ctx.shadowBlur=5;ctx.shadowOffsetY=3;ctx.fillStyle=g;ctx.beginPath();ctx.arc(px,py,r,0,TAU);ctx.fill();ctx.shadowBlur=ctx.shadowOffsetY=0}if(last){ctx.strokeStyle=finished?'#fff0a0':cells[last[1]][last[0]]===1?'#9dbbff':'#8a6341';ctx.lineWidth=2;ctx.beginPath();ctx.arc(pad+last[0]*gap,pad+last[1]*gap,gap*.14,0,TAU);ctx.stroke()}if(winning.length){ctx.strokeStyle='#ffefb4';ctx.lineWidth=4;ctx.shadowColor='#ffb32c';ctx.shadowBlur=18;ctx.beginPath();ctx.moveTo(pad+winning[0][0]*gap,pad+winning[0][1]*gap);ctx.lineTo(pad+winning[1][0]*gap,pad+winning[1][1]*gap);ctx.stroke();ctx.shadowBlur=0}}
const inside=(x,y)=>x>=0&&x<15&&y>=0&&y<15;
// Evaluate both contiguous lines and broken threats in every five-cell window.
function influence(x,y,side){let score=0,threes=0,fours=0,win=null;for(const [dx,dy] of dirs){let a=[x,y],b=[x,y],count=1,open=0;for(const sign of [-1,1]){let xx=x+dx*sign,yy=y+dy*sign;while(inside(xx,yy)&&cells[yy][xx]===side){count++;if(sign<0)a=[xx,yy];else b=[xx,yy];xx+=dx*sign;yy+=dy*sign}if(inside(xx,yy)&&!cells[yy][xx])open++}if(count>=5)win=[a,b];let best=0;for(let offset=-4;offset<=0;offset++){let stones=0,blocked=false;for(let k=0;k<5;k++){const xx=x+(offset+k)*dx,yy=y+(offset+k)*dy;if(!inside(xx,yy)||(cells[yy][xx]&&cells[yy][xx]!==side)){blocked=true;break}if((xx===x&&yy===y)||cells[yy][xx]===side)stones++}if(!blocked)best=Math.max(best,stones)}if(best>=4){fours++;score+=open===2&&count===4?90:55}else if(best===3){threes++;score+=open===2?25:13}else if(best===2)score+=5;if(count>=5)score+=200}if(threes>=2)score+=45;if(fours&&threes)score+=65;if(fours>=2)score+=100;return {score,win}}
let soundBus,noiseBuffer,scoreOrigin=0,scoreScale=1;
function initAudio(){
audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();if(soundBus)return;
const compressor=audio.createDynamicsCompressor();compressor.threshold.value=-14;compressor.knee.value=18;compressor.ratio.value=7;compressor.attack.value=.004;compressor.release.value=.18;
soundBus=audio.createGain();soundBus.gain.value=1.05;soundBus.connect(compressor);compressor.connect(audio.destination);
// Shared short room response and stereo echoes; built once for all techniques.
const reverb=audio.createConvolver(),impulse=audio.createBuffer(2,Math.floor(audio.sampleRate*1.45),audio.sampleRate);
for(let channel=0;channel<2;channel++){const samples=impulse.getChannelData(channel);for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*Math.pow(1-i/samples.length,3)*.32}
reverb.buffer=impulse;const wet=audio.createGain();wet.gain.value=.24;soundBus.connect(reverb);reverb.connect(wet);wet.connect(compressor);
for(const [delayTime,pan] of [[.095,-.7],[.165,.7]]){const delay=audio.createDelay(.5),gain=audio.createGain(),panner=audio.createStereoPanner();delay.delayTime.value=delayTime;gain.gain.value=.13;panner.pan.value=pan;soundBus.connect(delay);delay.connect(gain);gain.connect(panner);panner.connect(compressor)}
noiseBuffer=audio.createBuffer(1,audio.sampleRate*2,audio.sampleRate);const data=noiseBuffer.getChannelData(0);let low=0;for(let i=0;i<data.length;i++){const white=Math.random()*2-1;low=(low+white*.08)/1.08;data[i]=white*.55+low*2}
}
function voice(at,duration,from,to,volume,wave='sine'){
at=scoreOrigin+(at-scoreOrigin)*scoreScale;duration*=scoreScale;
const o=audio.createOscillator(),g=audio.createGain();o.type=wave;o.frequency.setValueAtTime(Math.max(20,from),at);o.frequency.exponentialRampToValueAtTime(Math.max(20,to),at+duration);g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),at+.012);g.gain.exponentialRampToValueAtTime(.0001,at+duration);o.connect(g);g.connect(soundBus);o.start(at);o.stop(at+duration+.02);o.onended=()=>{o.disconnect();g.disconnect()};
}
function rush(at,duration,frequency,end,volume,kind='lowpass'){
at=scoreOrigin+(at-scoreOrigin)*scoreScale;duration*=scoreScale;
const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),g=audio.createGain();source.buffer=noiseBuffer;filter.type=kind;filter.Q.value=kind==='bandpass'?2:.7;filter.frequency.setValueAtTime(frequency,at);filter.frequency.exponentialRampToValueAtTime(Math.max(30,end),at+duration);g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(volume,at+.018);g.gain.exponentialRampToValueAtTime(.0001,at+duration);source.connect(filter);filter.connect(g);g.connect(soundBus);source.start(at,Math.random()*.5);source.stop(at+duration+.03);source.onended=()=>{source.disconnect();filter.disconnect();g.disconnect()};
}
function impactLayers(t,level,type,victory){
const force=victory?1.55:.75+level*.18;
// The sub impact is accompanied by a short mid-frequency knock and a wide crack.
voice(t,.48,155,32,.26*force);voice(t+.008,.14,390,75,.16*force,'triangle');rush(t,.08,11000,1300,.2*force,'highpass');
if(level<2&&!victory)return;
const family=type%6;
// Staggered resonances give each material a complex, slightly detuned body.
for(let i=0;i<4;i++){const base=[220,740,1280,170,330,95][family]*(1+i*.47);voice(t+i*.018,.28+i*.055,base,base*(family===1?.55: .82),.065*force,i%2?'sine':'triangle')}
rush(t+.045,.32,4200,240,.18*force,'bandpass');
if(type===0||type===16||victory){for(let i=0;i<4;i++){const at=t+.06+i*.075;rush(at,.18+i*.055,3400/(i+1),75,.17*force);voice(at,.3,95+i*12,30,.095*force)}}
else if([1,2,8,9,14].includes(type)){for(let i=0;i<4;i++){const at=t+i*.043;rush(at,.13,1200,8000,.11*force,'bandpass');voice(at,.23,1900+i*480,850+i*130,.05*force)}}
else if([3,5,7,11].includes(type)){for(let i=0;i<3;i++)rush(t+i*.07,.23,1700+i*900,180,.15*force,'bandpass')}
else{for(let i=0;i<3;i++)voice(t+i*.055,.42,240*(i+1),225*(i+1),.065*force)}
if(victory){
for(let i=0;i<6;i++){voice(t+i*.12,.85,55+i*7,110+i*12,.09,'triangle');rush(t+i*.12,.3,180+i*160,900+i*260,.09,'bandpass')}
for(const at of [t+1.04,t+1.24,t+1.52]){voice(at,1.2,190,27,.38);rush(at,.85,9000,65,.48);rush(at+.025,.12,12000,1700,.26,'highpass')}
for(let i=0;i<5;i++){const at=t+1.7+i*.21;voice(at,1.4,196*(1+i*.25),195*(1+i*.25),.065);voice(at+.025,1.25,197*(1+i*.25),196*(1+i*.25),.045)}
}
}
function victoryScore(t){
const beat=.375,impact=t+4.095;
// I. Gravitational overture: a rising drone and accelerating heartbeats.
voice(t,4.05,38,82,.24);voice(t+.2,3.7,110,220,.1,'triangle');rush(t,4,180,3200,.18,'bandpass');
for(let i=0;i<10;i++){const at=t+i*.34;voice(at,.24,88,35,.19);rush(at,.09,1100,100,.08)}
// II. The sword strikes exactly as the dark core releases.
for(let i=0;i<3;i++){const at=impact+i*.22;voice(at,1.5,180,27,.45);rush(at,1.1,8500,80,.5);rush(at,.1,12000,1800,.25,'highpass')}
// III–IV. Heroic minor-key progression, galloping bass and a rising fanfare.
const roots=[110,87.307,130.813,97.999],melody=[0,7,12,10,7,12,15,14,12,7,10,12,15,19,17,19];
for(let step=0;step<44;step++){
const at=impact+step*beat,bar=Math.floor(step/8),root=roots[bar%4],phase=step<8?0:step<24?1:2;
voice(at,.23,root*.5,root*.49,.13+phase*.025,'triangle');
// Heavy downbeats, crisp marching snares and light rhythmic cymbals.
if(step%2===0)voice(at,.26,125,34,.25);else{rush(at,.16,4300,650,.16,'bandpass');voice(at,.08,190,145,.05,'triangle')}
rush(at,.055,8500,6500,.055,'highpass');if(phase>0)rush(at+beat*.5,.045,10000,7500,.035,'highpass');
if(step%4===0){const chord=bar%4===2?[0,4,7]:[0,3,7];for(const semi of chord){const hz=root*2**(semi/12);voice(at,1.35,hz,hz*.998,.065,'triangle');voice(at+.012,1.3,hz*2.006,hz*2,.035)}}
const semi=melody[step%melody.length],hz=220*2**(semi/12);voice(at,phase===2?.48:.32,hz,hz*.998,.075+phase*.018,'triangle');voice(at+.008,.38,hz*1.004,hz,.035);
if(phase===2&&step%2===0)voice(at,.45,hz*1.5,hz*1.499,.04,'triangle');
if(step===6||step===22||step===38){rush(at,.9,9500,2200,.16,'highpass');voice(at,.7,85,32,.19)}
}
// V. A sustained triumphant cadence, with starlight remaining after the drums.
const end=t+20.6;voice(end,.65,140,30,.3);rush(end,1.2,6500,800,.2);
for(const hz of [110,165,220,277.183,329.628,440,659.255])voice(end,2.5,hz,hz*.999,.065,hz<300?'triangle':'sine');
for(let i=0;i<6;i++)voice(end+i*.16,1.2,880*2**([0,4,7,12,7,4][i]/12),880*2**([0,4,7,12,7,4][i]/12),.028);
}
function tone(level,victory=false,type=0){try{
initAudio();const t=audio.currentTime+.008,p=.85+level*.2;if(victory){scoreOrigin=t;scoreScale=.24;try{victoryScore(t)}finally{scoreScale=1;scoreOrigin=0}return}impactLayers(t,level,type,false);
if(victory){
// Deep gravitational pull, descending impact, then a luminous stellar chord.
voice(t,.95,85,28,.24);rush(t,1.05,1600,90,.3);voice(t+.15,.85,110,330,.09,'triangle');
voice(t+1.04,1.45,145,30,.48);rush(t+1.04,1.7,7000,100,.55);voice(t+1.06,.65,660,42,.17,'triangle');
for(let i=0;i<3;i++){rush(t+1.2+i*.18,.55,3000,150,.18);voice(t+1.2+i*.18,.65,75,32,.15)}
for(const [i,n] of [130.81,196,261.63,329.63,392,523.25].entries())voice(t+1.8+i*.07,3.3,n,n*1.003,.055);
for(let i=0;i<9;i++)voice(t+2.2+i*.3,.75,784*(1+i%3*.25),780*(1+i%3*.25),.035);
return;
}
voice(t,.28,100+level*15,35,.16*p);
if(level<2){rush(t,.19,2800,500,.11*p);voice(t,.15,520,170,.045);return}
// Each technique has a recognizable material and attack envelope.
switch(type){
case 0: rush(t,.6,6500,90,.42*p);for(let i=0;i<3;i++)rush(t+i*.065,.12,8500,500,.2*p);break;
case 1:case 2:case 8:case 9:
rush(t,.28,800,9000,.22*p,'bandpass');voice(t+.03,.4,type===2?1800:950,220,.12*p,'triangle');if(type===2)for(let i=1;i<4;i++)voice(t+i*.045,.25,2200-i*180,600,.055*p);break;
case 3:case 11:rush(t,.58,4500,140,.35*p);voice(t,.45,160,45,.2*p,'triangle');break;
case 4:case 6:case 13:case 17:
voice(t,.55,180,48,.25*p,'triangle');voice(t,.58,370,140,.09*p);rush(t+.04,.34,1700,100,.2*p);break;
case 5:case 7:case 10:
rush(t,.5,400,3000,.2*p,'bandpass');voice(t,.6,140,440,.13*p);voice(t,.55,210,660,.07*p);break;
case 12:case 14:
for(let i=0;i<5;i++){voice(t+i*.035,.32,1400+i*270,900+i*170,.065*p,'triangle');rush(t+i*.035,.09,7000,3000,.05*p,'highpass')}break;
case 15:voice(t,.65,320,310,.15*p);voice(t,.55,480,465,.1*p);rush(t,.3,2200,600,.16*p);break;
case 16:rush(t,.6,1100,60,.38*p);voice(t,.6,95,28,.3*p);break;
}
}catch{}}
function strands(seed){return Array.from({length:32},(_,i)=>seed.slice(i,i+14))}
function makeEffect(x,y,level){let type=Math.floor(Math.random()*18);if(type===lastType)type=(type+1+Math.floor(Math.random()*17))%18;lastType=type;if(animations.length>=3)animations.shift();animations.push({x,y,level,type,start:performance.now(),duration:level===0?520:740,hue:[195,275,40,12,155,320][Math.floor(Math.random()*6)],seed:Array.from({length:100},()=>[Math.random(),Math.random(),Math.random()])});const effect=animations[animations.length-1];effect.strands=strands(effect.seed);tone(level,false,type);wake()}
board.addEventListener('pointerdown',e=>{if(finished){reset();return}const r=board.getBoundingClientRect(),x=Math.round((e.clientX-r.left-pad)/gap),y=Math.round((e.clientY-r.top-pad)/gap);if(!inside(x,y)||cells[y][x])return;const defense=influence(x,y,3-player);cells[y][x]=player;const attack=influence(x,y,player),impact=Math.max(attack.score,defense.score*.9)+Math.min(attack.score,defense.score)*.2;const level=impact>=100?4:impact>=55?3:impact>=24?2:impact>=10?1:0;last=[x,y];makeEffect(r.left+pad+x*gap,r.top+pad+y*gap,level);if(attack.win){finished=true;winning=attack.win;ending={start:performance.now(),x:r.left+pad+x*gap,y:r.top+pad+y*gap,seed:Array.from({length:180},()=>[Math.random(),Math.random(),Math.random()])};ending.strands=strands(ending.seed);tone(4,true)}else if(cells.every(row=>row.every(Boolean)))finished=true;player=3-player;draw()});
function stroke(points,color,width=1){fx.strokeStyle=color;fx.lineWidth=width*2.2*effectWeight;fx.lineCap='round';fx.lineJoin='round';fx.beginPath();points.forEach(([x,y],i)=>i?fx.lineTo(x,y):fx.moveTo(x,y));fx.stroke()}
function circle(x,y,r,color,width=1){if(r<=0)return;fx.strokeStyle=color;fx.lineWidth=width*2.25*effectWeight;fx.lineCap='round';fx.beginPath();fx.arc(x,y,r,0,TAU);fx.stroke()}
function bolt(x1,y1,x2,y2,seed,color,width=2){const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy)||1,path=new Path2D();seed.offsets??=Array.from({length:13},(_,i)=>i===0||i===12?0:Math.sin(i*Math.PI/12)*(seed[i%seed.length][0]-.5));for(let i=0;i<=12;i++){const j=seed.offsets[i]*Math.min(len*.12,48),x=x1+dx*i/12-dy/len*j,y=y1+dy*i/12+dx/len*j;i?path.lineTo(x,y):path.moveTo(x,y)}fx.save();fx.lineCap='round';fx.lineJoin='round';fx.globalAlpha*=.22;fx.strokeStyle=color;fx.lineWidth=width*12*effectWeight;fx.stroke(path);fx.restore();fx.strokeStyle=color;fx.lineWidth=width*5*effectWeight;fx.stroke(path);fx.strokeStyle='#fff';fx.lineWidth=width*1.9*effectWeight;fx.stroke(path)}
function sword(x,y,a,length,color,alpha=1){fx.save();fx.translate(x,y);fx.rotate(a);fx.globalAlpha*=alpha;fx.fillStyle=color;fx.beginPath();fx.moveTo(0,-length);fx.lineTo(length*.115*effectWeight,-length*.18);fx.lineTo(0,0);fx.lineTo(-length*.115*effectWeight,-length*.18);fx.closePath();fx.fill();stroke([[-length*.12,-length*.12],[length*.12,-length*.12]],color,2);stroke([[0,0],[0,length*.14]],color,3);fx.restore()}
function effect(e,now){effectWeight=e.level>=2?[1,1,2.2,2.6,3][e.level]:1;const t=clamp((now-e.start)/e.duration,0,1),fade=Math.pow(1-t,1.2),power=e.level,R=gap*(1.4+power*.95),radius=R*(.2+Math.sin(t*Math.PI/2)),color=`hsla(${e.hue},100%,72%,${fade})`,bright=`hsla(${e.hue},100%,86%,${fade})`;fx.save();fx.translate(e.x,e.y);fx.globalCompositeOperation='lighter';fx.shadowColor=`hsl(${e.hue},100%,65%)`;fx.shadowBlur=0;
// Every landing retains sparks and a tactile expanding shockwave.
// Batch sparks and motes: one stroke and one fill, without per-particle blur.
const travel=Math.sin(t*Math.PI/2),sparkCount=32+power*14,moteCount=28+power*16;
fx.strokeStyle=color;fx.lineWidth=4;fx.lineCap='round';fx.beginPath();
for(let i=0;i<sparkCount;i++){const [a,b,c]=e.seed[Math.floor(i/2)],angle=a*TAU+(i%2)*Math.PI,d=(12+b*R*1.5)*travel,cs=Math.cos(angle),sn=Math.sin(angle);fx.moveTo(cs*d,sn*d);fx.lineTo(cs*(d+4+c*12),sn*(d+4+c*12))}fx.stroke();
fx.fillStyle=bright;fx.beginPath();
for(let i=0;i<moteCount;i++){const [a,b,c]=e.seed[Math.floor(i/2)],angle=Math.floor(i/2)/Math.ceil(moteCount/2)*TAU+a*.16+(i%2)*Math.PI,d=R*(.15+b*1.8)*travel,x=Math.cos(angle)*d,y=Math.sin(angle)*d,r=1+c*2.3;fx.moveTo(x+r,y);fx.arc(x,y,r,0,TAU)}fx.fill();if(power>=2)stroke([[-radius,0],[radius,0]],color,3*fade);else circle(0,0,radius,color,2*fade)

if(power<2){if(power===1){circle(0,0,radius*.65,color,2*fade);stroke([[0,-radius*.45],[0,radius*.45]],color,1.5*fade)}fx.restore();effectWeight=1;return}
// Shared visual grammar: a stable central seal, mirrored energy rails,
// then the individual technique. Hue, spacing and weight stay consistent.
fx.save();const seal=gap*(.45+.15*Math.sin(t*Math.PI));fx.strokeStyle=bright;fx.lineWidth=2.5*fade*effectWeight;fx.strokeRect(-seal,-seal,seal*2,seal*2);for(const sign of [-1,1]){const x=sign*R*.65;stroke([[x,-R*.35],[x,-R*.55],[x-sign*R*.2,-R*.55]],color,2*fade);stroke([[x,R*.35],[x,R*.55],[x-sign*R*.2,R*.55]],color,2*fade)}fx.restore();
const count=4+power*2;
fx.save();fx.globalAlpha*=.65;for(let mirror=0;mirror<2;mirror++){fx.save();fx.rotate(mirror*Math.PI);switch(e.type){
case 0: // Vertical heavenly judgment, with staggered side branches.
for(let j=0;j<3+power;j++){const x=(j-(2+power)/2)*R*.4,delay=Math.abs(j-(2+power)/2)*.025,fall=clamp((t-delay)*5,0,1);bolt(x,-R*2.5,x*.3,-R*2.5+(R*2.7)*fall,e.strands[j],color,j%2?1.5:3);if(fall>.8)stroke([[x*.3,0],[x*.3-R*.25,R*.2],[x*.3+R*.15,R*.35]],bright,2)}break;
case 1: // Broad parallel saber strokes cut across the landing point.
fx.save();fx.rotate(-.55);for(let j=0;j<3;j++){const shift=(j-1)*R*.38,head=-R*2+clamp(t*2.5-j*.12,0,1)*R*4;stroke([[head-R*1.5,shift+R*.12],[head-R*.4,shift],[head,shift-R*.1]],color,(8+power*2)*fade);stroke([[head-R,shift],[head,shift-R*.1]],bright,3*fade)}fx.restore();break;
case 2: // A rectangular sword phalanx charges diagonally.
fx.save();fx.rotate(-.65);for(let j=0;j<count*2;j++){const cols=4,rows=Math.ceil(count*2/cols),row=Math.floor(j/cols),col=j%cols,advance=clamp(t*2-row*.13,0,1);sword((col-(cols-1)/2)*R*.32,-R*2+advance*R*3.2-row*R*.28,Math.PI,R*.65,bright)}fx.restore();break;
case 3: // Flame pillars erupt upward in a layered mountain silhouette.
for(let j=0;j<5+power;j++){const x=(j-(4+power)/2)*R*.3,peak=R*(1.65-Math.abs(j-(4+power)/2)/(5+power))*Math.sin(Math.min(1,t*1.8)*Math.PI*.8);fx.fillStyle=j%2?bright:color;fx.beginPath();fx.moveTo(x-R*.3,R*.45);fx.bezierCurveTo(x-R*.45,-peak*.15,x+R*.2,-peak*.5,x,-peak);fx.bezierCurveTo(x+R*.55,-peak*.3,x+R*.35,R*.1,x+R*.3,R*.45);fx.closePath();fx.fill()}break;
case 4: // Talisman walls stamp down one after another.
for(let j=0;j<3+power;j++){const arrival=clamp(t*4-Math.abs(j-(2+power)/2)*.14,0,1);fx.save();fx.translate((j-(2+power)/2)*R*.38,-R*1.7*(1-arrival));fx.scale(1,arrival*.4+.6);fx.strokeStyle=bright;fx.lineWidth=3*effectWeight;fx.strokeRect(-R*.13,-R*.45,R*.26,R*.9);stroke([[-R*.08,-R*.3],[R*.07,-R*.16],[-R*.06,0],[R*.07,R*.13],[-R*.05,R*.3]],bright,2);fx.restore()}break;
case 5: // Serpentine spirit rivers stream horizontally, without orbiting.
for(let j=0;j<3+power;j++){const points=[];for(let n=0;n<32;n++){const x=-R*2+n*R*4/31,y=Math.sin(n*.2-t*8)*R*.16+(j-(2+power)/2)*R*.22;points.push([x,y])}stroke(points,color,(3+power)*fade);const head=points[Math.min(31,Math.floor(t*45))];sword(head[0],head[1],Math.PI/2,R*.35,bright)}break;
case 6: // A massive mountain seal descends and crushes the ground.
{const fall=clamp(t*3,0,1),y=-R*2*(1-fall);fx.save();fx.translate(0,y);stroke([[-R,R*.25],[-R*.65,-R*.35],[-R*.4,-R*.1],[0,-R],[R*.4,-R*.2],[R*.65,-R*.4],[R,R*.25],[-R,R*.25]],bright,5);stroke([[-R*.6,R*.45],[R*.6,R*.45]],color,9);fx.restore();if(fall===1)for(let j=0;j<5;j++){const x=(j-2)*R*.4;stroke([[0,R*.5],[x,R*.65],[x*1.5,R*.9]],color,2)}}break;
case 7: // Yin-yang vortex.
for(let j=0;j<2;j++){fx.save();fx.rotate(t*9+j*Math.PI);fx.strokeStyle=j?bright:color;fx.lineWidth=gap*.42*fade*effectWeight;fx.beginPath();fx.arc(0,0,radius*.8,0,Math.PI);fx.stroke();circle(radius*.4,0,gap*.12,bright,3);fx.restore()}break;
case 8: // Void-breaking claw marks.
for(let j=0;j<3+power;j++){const shift=(j-(2+power)/2)*gap*.35;stroke([[-radius+shift,radius],[-radius*.2+shift,-radius*.1],[radius+shift,-radius]],bright,(3+power)*fade)}break;
case 9: // A celestial bow draws and releases a single piercing arrow.
fx.save();fx.rotate(-.35);fx.strokeStyle=color;fx.lineWidth=5;fx.beginPath();fx.moveTo(-R*.6,-R);fx.quadraticCurveTo(-R*1.5,0,-R*.6,R);fx.stroke();const draw=-R*.6-Math.sin(t*Math.PI)*R*.5;stroke([[-R*.6,-R],[draw,0],[-R*.6,R]],bright,2);const tip=-R+clamp(t*2.2,0,1)*R*3;stroke([[tip-R*1.5,0],[tip,0]],bright,5);stroke([[tip-R*.3,-R*.2],[tip,0],[tip-R*.3,R*.2]],bright,4);fx.restore();break;
case 10: // Layered rectangular space fractures peel apart.
for(let j=0;j<4;j++){const r=R*(.3+j*.23),split=t*R*.45*(j<2?-1:1);fx.save();fx.translate(split,(j-1.5)*R*.12);stroke([[-r,-r],[r,-r],[r,0]],bright,3);stroke([[r,r],[-r,r],[-r,0]],color,4);fx.restore()}break;
case 11: // Phoenix feather storm sweeps upward in a fan.
for(let j=0;j<count*2;j++){const a=j/(count*2-1),b=1-Math.abs(a-.5)*2,x=(a-.5)*R*2.8,y=R-t*R*(2+b*.5);fx.save();fx.translate(x,y);fx.rotate((a-.5)*.8);fx.strokeStyle=bright;fx.lineWidth=3*effectWeight;fx.beginPath();fx.moveTo(0,R*.2);fx.quadraticCurveTo(-R*.25,-R*.1,0,-R*.65);fx.quadraticCurveTo(R*.2,-R*.15,0,R*.2);fx.stroke();fx.restore()}break;
case 12: // Ice lances: symmetric crystalline spears rise from the ground.
for(let j=-2;j<=2;j++){const height=R*(1.5-Math.abs(j)*.2)*Math.sin(Math.min(1,t*2)*Math.PI*.75),x=j*R*.35;fx.fillStyle=color;fx.beginPath();fx.moveTo(x-R*.12,R*.5);fx.lineTo(x,-height);fx.lineTo(x+R*.12,R*.5);fx.closePath();fx.fill();stroke([[x,R*.5],[x,-height]],bright,2)}break;
case 13: // Heaven-shaking palm, framed by a rectangular shock front.
{const k=clamp(t*3,0,1),r=R*(.5+k*.3);fx.save();fx.translate(0,-R*(1-k));fx.fillStyle=color;fx.fillRect(-r*.45,-r*.1,r*.9,r*.8);for(let j=0;j<5;j++){const x=(j-2)*r*.22;stroke([[x,r*.05],[x,-r*(.65-Math.abs(j-2)*.1)]],bright,r*.08)}fx.strokeStyle=bright;fx.lineWidth=3*effectWeight;fx.strokeRect(-r*.6,-r*.9,r*1.2,r*1.8);fx.restore()}break;
case 14: // Spirit chains converge in mirrored diagonal lanes.
for(let j=0;j<4;j++){const a=Math.PI/4+j*Math.PI/2;fx.save();fx.rotate(a);for(let n=0;n<7;n++){const x=R*(.3+n*.23)*(1-t*.65);fx.strokeStyle=n%2?bright:color;fx.lineWidth=3;fx.beginPath();fx.ellipse(x,0,R*.11,R*.055,n%2?Math.PI/3:0,0,TAU);fx.stroke()}fx.restore()}break;
case 15: // Layered shield opens as a stable hexagonal wall.
for(let layer=0;layer<3;layer++){const r=R*(.5+layer*.23)*Math.sin(Math.min(1,t*3)*Math.PI/2),pts=[];for(let j=0;j<=6;j++)pts.push([Math.cos(j*TAU/6)*r,Math.sin(j*TAU/6)*r]);stroke(pts,layer===1?bright:color,layer===1?5:2)}break;
case 16: // Earth spikes form a measured, mirrored ridge.
for(let j=-3;j<=3;j++){const x=j*R*.3,height=R*(1.3-Math.abs(j)*.2)*clamp(t*4-Math.abs(j)*.15,0,1);fx.fillStyle=color;fx.beginPath();fx.moveTo(x-R*.16,R*.5);fx.lineTo(x-R*.05,-height);fx.lineTo(x+R*.08,-height*.75);fx.lineTo(x+R*.16,R*.5);fx.closePath();fx.fill();stroke([[x-R*.05,-height],[x,R*.3]],bright,2)}break;
case 17: // Cross-shaped sealing technique with four closing gates.
for(let j=0;j<4;j++){fx.save();fx.rotate(j*Math.PI/2);const distance=R*(1.5-clamp(t*3,0,1));stroke([[-R*.3,-distance-R*.25],[-R*.3,-distance],[R*.3,-distance],[R*.3,-distance-R*.25]],bright,5);stroke([[0,-distance],[0,0]],color,3);fx.restore()}break;

}fx.restore()}fx.restore();
fx.save();fx.globalAlpha*=.65;for(let screenMirror=0;screenMirror<2;screenMirror++){fx.save();fx.rotate(screenMirror*Math.PI);
if(power===4){
// Evenly spaced columns descend through the entire viewport in a brief storm.
fx.save();fx.translate(-e.x,-e.y);fx.shadowBlur=0;const columns=Math.min(16,Math.ceil(w/110)+1),storm=Math.sin(t*Math.PI)*fade;
for(let j=0;j<columns;j++){const sx=(j+.5)*w/columns+(e.seed[j][0]-.5)*w/columns*.1,end=h*clamp(t*5-e.seed[j][1]*.3,0,1);fx.globalAlpha=storm;bolt(sx,-15,sx+(e.seed[j][2]-.5)*40,end,e.strands[j],`hsla(${e.hue},100%,68%,.6)`,j%3===0?2.8:1.6);if(j%2===0&&end>h*.35){const yy=h*(.25+e.seed[j][1]*.45);bolt(sx,yy,sx+(j%4?1:-1)*65,yy+100,e.strands[j+5],`hsla(${e.hue},100%,78%,.5)`,.7)}}
// A thin celestial horizon sweeps down with the lightning front.
const front=h*clamp(t*3,0,1);fx.globalAlpha=storm*.55;const wash=fx.createLinearGradient(0,Math.max(0,front-100),0,front+1);wash.addColorStop(0,'transparent');wash.addColorStop(1,`hsla(${e.hue},100%,75%,.28)`);fx.fillStyle=wash;fx.fillRect(0,Math.max(0,front-100),w,Math.min(100,front));stroke([[0,front],[w,front]],bright,1.5);fx.restore();
}
if(power>=3){const reach=Math.hypot(w,h);fx.shadowBlur=0;fx.globalAlpha=fade*(power===4?.8:.45);if(e.type%3===0){for(let j=0;j<(power===4?5:2);j++){const a=-Math.PI/2+(j-((power===4?5:2)-1)/2)*Math.PI/(power===4?5:3);bolt(Math.cos(a)*reach,Math.sin(a)*reach,0,0,e.strands[j],color,2)}}else if(e.type%3===1){for(let j=0;j<3;j++){fx.save();fx.rotate((j-1)*Math.PI/3);const g=fx.createLinearGradient(-reach,0,reach,0);g.addColorStop(0,'transparent');g.addColorStop(.5,bright);g.addColorStop(1,'transparent');fx.fillStyle=g;fx.fillRect(-reach,-4*fade*effectWeight,reach*2,8*fade*effectWeight);fx.restore()}}else{circle(0,0,reach*t,color,4);for(let j=0;j<8;j++){const a=j*TAU/8; sword(Math.cos(a)*reach*(1-t),Math.sin(a)*reach*(1-t),a+Math.PI/2,gap*3,bright)}}}
fx.restore()}fx.restore();
fx.restore();effectWeight=1}
// The finale has four distinct beats: heaven closes, earth splits, the sky turns,
// and a new celestial order forms. It ends without blocking the restart button.
function victoryGate(t,c,reach){
const fade=clamp((5.6-t)*1.3,0,1),gold=`rgba(255,218,140,${fade})`,violet=`rgba(163,112,255,${fade*.7})`;
fx.save();fx.translate(c.x,c.y);fx.globalCompositeOperation='lighter';
// A monumental celestial gate opens behind the battlefield.
const open=Math.sin(clamp(t/.95,0,1)*Math.PI/2),gate=gap*5*open;
fx.save();fx.rotate(t*.18);for(let k=0;k<3;k++){const r=gate*(1+k*.2);circle(0,0,r,k===1?violet:gold,k===1?8:3);fx.beginPath();for(let j=0;j<=8;j++){const a=j*TAU/8+k*.16;const x=Math.cos(a)*r,y=Math.sin(a)*r;j?fx.lineTo(x,y):fx.moveTo(x,y)}fx.strokeStyle=gold;fx.lineWidth=k===0?5:2;fx.stroke()}fx.restore();
// One oversized sword falls from the heavens, then splits the horizon.
if(t>.4&&t<2.1){const fall=clamp((t-.4)/.8,0,1),y=-h*(1-fall);sword(0,y+gap*2,Math.PI,gap*7,gold,clamp((2.1-t)*2,0,1));if(fall<1){stroke([[0,y-gap*8],[0,y]],violet,20);stroke([[0,y-gap*8],[0,y]],gold,5)}}
if(t>1.15){const q=t-1.15,burst=Math.max(0,1-q/2.4);fx.save();fx.rotate(-.24);for(let side of [-1,1]){const len=reach*Math.min(1,q*4),g=fx.createLinearGradient(0,0,side*reach,0);g.addColorStop(0,`rgba(255,248,215,${burst})`);g.addColorStop(.4,`rgba(182,111,255,${burst*.7})`);g.addColorStop(1,'transparent');fx.fillStyle=g;fx.beginPath();fx.moveTo(0,-18*burst);fx.lineTo(side*len,-3);fx.lineTo(side*len,3);fx.lineTo(0,18*burst);fx.closePath();fx.fill()}fx.restore();
// Broad curved shock fronts create scale without expensive canvas blur.
for(let j=0;j<3;j++){const r=reach*clamp((q-j*.15)/1.7,0,1);if(r>0&&r<reach){circle(0,0,r,`rgba(166,116,255,${burst*.18})`,18);circle(0,0,r,gold,3)}}
const rays=16;fx.save();fx.rotate(q*.13);fx.globalAlpha=burst*.55;fx.fillStyle=gold;fx.beginPath();for(let j=0;j<rays;j++){const a=j*TAU/rays,l=reach*(j%2?.65:1);fx.moveTo(Math.cos(a-.008)*gate,Math.sin(a-.008)*gate);fx.lineTo(Math.cos(a)*l,Math.sin(a)*l);fx.lineTo(Math.cos(a+.008)*gate,Math.sin(a+.008)*gate)}fx.fill();fx.restore();}
fx.restore();}
// A galaxy and orbiting debris emerge after the impact and gently fade out.
function galaxyAftermath(t,c){
if(t<1.65)return;const q=t-1.65,fade=clamp(q*1.5,0,1)*clamp((5.6-t)*1.2,0,1),radius=Math.min(w,h)*.42;
fx.save();fx.translate(c.x,c.y);fx.globalCompositeOperation='lighter';
// Four spiral arms, each built as one batched star-dust path.
for(let arm=0;arm<4;arm++){fx.beginPath();for(let i=0;i<110;i++){const [a,b,z]=c.seed[i],u=(i+.5)/110,r=radius*Math.sqrt(u),angle=arm*Math.PI/2+u*5.8+q*.16+(a-.5)*.18,x=Math.cos(angle)*r,y=Math.sin(angle)*r*.48,sz=.7+z*1.7;fx.moveTo(x+sz,y);fx.arc(x,y,sz,0,TAU)}fx.fillStyle=arm%2?`rgba(255,209,165,${fade*.7})`:`rgba(145,174,255,${fade*.8})`;fx.fill()}
// Broken asteroids orbit in opposing pairs along two tilted orbital planes.
for(let plane=0;plane<2;plane++){fx.save();fx.rotate(plane===0?-.28:.55);fx.fillStyle=plane?`rgba(180,159,255,${fade*.85})`:`rgba(255,218,155,${fade*.85})`;fx.beginPath();for(let i=0;i<36;i++){const [a,b,z]=c.seed[i+30],angle=i*Math.PI/36+q*(plane?-.42:.32),r=radius*(.75+plane*.3+b*.12),sz=2+z*6;for(const sign of [-1,1]){const x=Math.cos(angle)*r*sign,y=Math.sin(angle)*r*.38*sign;fx.moveTo(x-sz,y);fx.lineTo(x-sz*.2,y-sz*.55);fx.lineTo(x+sz,y-sz*.15);fx.lineTo(x+sz*.45,y+sz*.5);fx.closePath()}}fx.fill();fx.restore()}
// Distant paired miniature galaxies and their glowing stellar nuclei.
for(let j=0;j<3;j++){const angle=j*Math.PI/3+.4,dist=radius*(1.15+j*.12);for(const sign of [-1,1]){fx.save();fx.translate(Math.cos(angle)*dist*sign,Math.sin(angle)*dist*.7*sign);fx.rotate(j*.8-q*.08);fx.strokeStyle=`rgba(155,167,255,${fade*.35})`;fx.lineWidth=2;fx.beginPath();for(let n=0;n<35;n++){const a=n*.32,r=n*.75,x=Math.cos(a)*r,y=Math.sin(a)*r*.35;n?fx.lineTo(x,y):fx.moveTo(x,y)}fx.stroke();fx.fillStyle=`rgba(255,238,207,${fade})`;fx.fillRect(-2,-2,4,4);fx.restore()}}
fx.restore();}
// Paired stars spiral into a dark core, followed by a gravitational release.
function blackHole(t,c){
const pull=clamp(t/1.05,0,1),release=Math.max(0,t-1.05),fade=clamp((4.3-t)*.8,0,1),core=gap*(.35+pull*.85)*Math.max(0,1-release*1.8);
fx.save();fx.translate(c.x,c.y);fx.globalCompositeOperation='lighter';
// Opposite star pairs preserve the central symmetry of the battlefield.
fx.beginPath();for(let i=0;i<80;i++){const [a,b,z]=c.seed[i],angle=a*TAU+pull*pull*5+release*.25,r=t<1.05?gap*1.3+(1-pull)*(Math.hypot(w,h)*b*.7+gap):gap*1.3+release*(90+b*500);for(const sign of [-1,1]){const x=Math.cos(angle)*r*sign,y=Math.sin(angle)*r*.62*sign;fx.moveTo(x,y);fx.lineTo(x-Math.cos(angle+.3)*sign*(5+pull*18),y-Math.sin(angle+.3)*sign*(5+pull*18))}}fx.strokeStyle=`rgba(162,178,255,${fade*.8})`;fx.lineWidth=2.5;fx.stroke();
// Two tilted accretion bands frame the black core without canvas blur.
if(t<1.8){for(let k=0;k<3;k++){const r=Math.max(core,4)*(1.4+k*.35);fx.strokeStyle=`rgba(${k===1?'255,198,116':'160,125,255'},${fade*(.7-k*.12)})`;fx.lineWidth=k===1?8:4;fx.beginPath();fx.ellipse(0,0,r*1.7,r*.48,-.35,0,TAU);fx.stroke()}if(core>0){fx.globalCompositeOperation='source-over';fx.fillStyle='#010008';fx.beginPath();fx.arc(0,0,core,0,TAU);fx.fill();fx.globalCompositeOperation='lighter';circle(0,0,core+2,`rgba(255,226,184,${fade})`,3)}}
if(release>0){for(let k=0;k<3;k++){const r=(release-k*.1)*Math.hypot(w,h)*.8;if(r>0){fx.strokeStyle=`rgba(145,137,255,${Math.max(0,.6-release*.25)})`;fx.lineWidth=k===0?7:3;fx.beginPath();fx.ellipse(0,0,r,r*(.5+k*.15),k*.5,0,TAU);fx.stroke()}}}
fx.restore();}
function finale(now){if(!ending)return 0;const t=(now-ending.start)/1000;if(t>5.6){ending=null;return 0}const c=ending,reach=Math.hypot(w,h);fx.save();fx.fillStyle=`rgba(3,0,14,${Math.min(.8,t*.9)*Math.min(1,(5.6-t)*2)})`;fx.fillRect(0,0,w,h);victoryGate(t,c,reach);blackHole(t,c);galaxyAftermath(t,c);fx.translate(c.x,c.y);fx.globalCompositeOperation='lighter';const gold=`rgba(255,213,130,${Math.min(1,(5.6-t)*1.5)})`;fx.shadowColor='#b079ff';fx.shadowBlur=0;
if(t<1.05){const k=t/1.05;for(let j=0;j<16;j++){const a=j*TAU/16+k*2,rr=reach*(1-k)+gap;sword(Math.cos(a)*rr,Math.sin(a)*rr,a+Math.PI/2,gap*(2+k*3),gold)}for(let j=0;j<3;j++)circle(0,0,(1-k)*reach*(.4+j*.2)+20,'#b794ff',3);}
else{const q=t-1.05,fade=clamp((5.6-t)*1.5,0,1);fx.globalAlpha=fade;for(let j=0;j<12;j++){const a=j*TAU/12;const len=reach*Math.min(1,q*2);bolt(0,0,Math.cos(a)*len,Math.sin(a)*len,c.strands[j],`rgba(180,140,255,${Math.max(.05,1-q*.3)})`,q<.6?4:1)}
for(let j=0;j<4;j++){const r=(q*(500+j*100))% (reach*1.2);fx.save();fx.rotate(q*(j%2?-.4:.4)+j*.5);fx.strokeStyle=gold;fx.lineWidth=3;fx.beginPath();fx.ellipse(0,0,r,r*.35,0,0,TAU);fx.stroke();fx.restore()}
// The heavens and earth separate into rotating curtains of stars.
for(let j=0;j<150;j++){const [a,b,z]=c.seed[j],angle=a*TAU+q*(z-.5),dist=gap+Math.pow(q,.65)*reach*b;const x=Math.cos(angle)*dist,y=Math.sin(angle)*dist;stroke([[x,y],[x+Math.cos(angle)*20*q,y+Math.sin(angle)*20*q]],`hsla(${35+z*230},100%,80%,${fade*(1-b*.6)})`,1+z*3)}
fx.save();fx.rotate(q*.55);for(let j=0;j<12;j++){const a=j*TAU/12,r=gap*(3+Math.min(q,2)*1.5);sword(Math.cos(a)*r,Math.sin(a)*r,a+Math.PI/2,gap*3,gold);stroke([[Math.cos(a)*r,Math.sin(a)*r],[Math.cos(a+Math.PI*5/6)*r,Math.sin(a+Math.PI*5/6)*r]],gold,1)}circle(0,0,gap*(3+Math.min(q,2)*1.5),gold,3);fx.restore();
const flash=Math.max(0,1-q*4)*.8;if(flash){fx.fillStyle=`rgba(240,225,255,${flash})`;fx.fillRect(-c.x,-c.y,w,h)}}fx.restore();return t<1?8*t:t<1.7?35*(1-(t-1)/.7):4*Math.max(0,1-(t-1.7)/3.9)}
function frame(now){frameId=0;fx.clearRect(0,0,w,h);let shake=0;animations=animations.filter(e=>now-e.start<e.duration);for(const e of animations){effect(e,now);const t=(now-e.start)/e.duration;shake=Math.max(shake,(4+e.level*5)*Math.pow(1-t,2))}shake=Math.max(shake,finale(now));board.style.transform=shake>.1?`translate(${rand(-shake,shake)}px,${rand(-shake,shake)}px) rotate(${rand(-shake,shake)*.025}deg)`:'';if(animations.length||ending)wake()}
document.querySelector('#restart').addEventListener('click',reset);addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frameId);frameId=0}else wake()});reset();resize();
