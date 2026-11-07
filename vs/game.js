/* Neural Clash — dependency-free canvas fighter. Fixed 60 Hz combat simulation. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d', { alpha: false });
  const W = 1440, H = 760, FLOOR = 616, MAX_HP = 420;
  const TAU = Math.PI * 2, clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  const lerp = (a,b,t) => a+(b-a)*t;
  const rand = (a,b) => a+Math.random()*(b-a);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colors = ['#79e9f5','#ffb078'];
  const keys = new Set(), pressed = new Set();
  const maps = [
    {left:'KeyA',right:'KeyD',up:'KeyW',down:'KeyS',dash:'Space',light:'KeyJ',kick:'KeyK',slash:'KeyL',heavy:'KeyU',wave:'KeyO',rise:'KeyI',super:'KeyH',rc:'KeyQ',burst:'KeyE',guard:'ShiftLeft'},
    {left:'ArrowLeft',right:'ArrowRight',up:'ArrowUp',down:'ArrowDown',dash:'NumpadDecimal',light:'Numpad1',kick:'Numpad2',slash:'Numpad3',heavy:'Numpad4',wave:'Numpad5',rise:'Numpad6',super:'Numpad0',rc:'Numpad7',burst:'Numpad8',guard:'Numpad9'}
  ];
  const moves = {
    light:{startup:5,active:4,total:17,damage:15,range:102,stun:19,push:5,rank:1,pose:'punch',height:115},
    kick:{startup:7,active:5,total:23,damage:22,range:145,stun:23,push:5.7,rank:2,pose:'kick',height:92},
    slash:{startup:10,active:6,total:30,damage:31,range:202,stun:27,push:7,rank:3,pose:'slash',height:145},
    heavy:{startup:15,active:7,total:39,damage:44,range:222,stun:34,push:9,rank:4,pose:'heavy',height:135,launch:7},
    wave:{startup:16,active:1,total:44,damage:26,range:0,rank:5,pose:'cast'},
    rise:{startup:6,active:16,total:49,damage:42,range:135,stun:36,push:5,rank:5,pose:'rise',height:175,launch:12},
    super:{startup:22,active:1,total:68,damage:92,range:0,rank:6,pose:'super',cost:50}
  };
  let mode='cpu', difficulty='normal', phase='menu', fighters=[], particles=[], rings=[], slashes=[], projectiles=[], ghosts=[], textFx=[];
  let time=99, round=1, roundDelay=0, intro=0, globalTime=0, shake=0, flash=0, hitstop=0, slow=0, superScene=0;
  let frameCount=0, fpsClock=0, matchWinner=-1, muted=true, audio=null, audioBus=null, wasHelpPlaying=false;
  let inputBuffer=[[],[]], bufferedTaps=[new Set(),new Set()], gamepadDown=[new Set(),new Set()];
  let cameraX=W/2, cameraZoom=1;
  const held = (p,k) => keys.has(maps[p][k]) || gamepadDown[p].has(k);
  let gamepadEdges=[new Set(),new Set()];
  const tap = (p,k) => pressed.has(maps[p][k]) || gamepadEdges[p].has(k);

  function initAudio() {
    try {
      if(!audio){ audio=new (window.AudioContext||window.webkitAudioContext)();audioBus=audio.createGain();audioBus.gain.value=.18;audioBus.connect(audio.destination); }
      if(audio.state==='suspended') audio.resume().catch(()=>{});
    } catch (_) {}
  }
  function tone(freq,duration=.1,type='sine',gain=.3,end=40) {
    if(muted||!audio||audio.state!=='running') return;
    const osc=audio.createOscillator(), env=audio.createGain(), t=audio.currentTime;
    osc.type=type;osc.frequency.setValueAtTime(freq,t);osc.frequency.exponentialRampToValueAtTime(Math.max(10,end),t+duration);
    env.gain.setValueAtTime(.001,t);env.gain.exponentialRampToValueAtTime(gain,t+.008);env.gain.exponentialRampToValueAtTime(.001,t+duration);
    osc.connect(env);env.connect(audioBus);osc.start(t);osc.stop(t+duration+.02);
  }
  function sfx(type) {
    if(type==='hit'){tone(165,.13,'triangle',.9,35);tone(850,.045,'sawtooth',.12,130);}
    if(type==='heavy'){tone(100,.22,'sawtooth',.5,24);tone(500,.1,'triangle',.4,60);}
    if(type==='guard')tone(1100,.07,'triangle',.3,400);
    if(type==='dash')tone(380,.12,'sawtooth',.08,50);
    if(type==='wave'){tone(500,.3,'sine',.4,130);tone(740,.25,'triangle',.12,170);}
    if(type==='super'){tone(100,.7,'sawtooth',.25,800);tone(600,.6,'sine',.25,90);}
    if(type==='ui')tone(620,.1,'sine',.4,420);
  }

  function fighter(id,wins=0) {
    return {id,x:id?1000:440,y:0,vx:0,vy:0,face:id?-1:1,hp:MAX_HP,meter:0,burst:100,wins,
      action:null,age:0,hit:false,connected:false,stun:0,blockstun:0,invul:0,dash:0,dashDir:1,dashCd:0,
      jumps:0,airdash:false,crouch:false,guard:false,combo:0,comboDamage:0,comboTime:0,
      aiClock:0,aiMove:0,aiGuard:0,waveCd:0,blink:0,hurt:0,lastHit:0,buffer:[],pose:null,walk:0,land:0};
  }
  function announce(big,small='',duration=75) {
    $('announcer').innerHTML=big+(small?'<small>'+small+'</small>':'');
    $('announcer').classList.remove('pop');void $('announcer').offsetWidth;$('announcer').classList.add('pop');
    announce.timer=duration;
  }
  announce.timer=0;
  function resetRound(first=false) {
    const wins=first?[0,0]:fighters.map(f=>f.wins);
    fighters=[fighter(0,wins[0]),fighter(1,wins[1])];
    particles=[];rings=[];slashes=[];projectiles=[];ghosts=[];textFx=[];
    inputBuffer=[[],[]];clearInput();time=99;roundDelay=0;intro=130;hitstop=0;slow=0;superScene=0;shake=0;flash=0;
    if(mode==='training'){intro=50;fighters.forEach(f=>f.meter=100);}
    announce(mode==='training'?'FREE LAB':'DUEL '+round,mode==='training'?'自由练习 · R 重置 · 无限能量':'深海与余烬',mode==='training'?80:74);
    updateHUD();
  }
  function startMatch() {
    initAudio();sfx('ui');mode=$('mode').value;difficulty=$('difficulty').value;
    phase='playing';round=1;matchWinner=-1;
    $('startScreen').classList.add('hidden');$('pauseScreen').classList.add('hidden');$('pauseButton').classList.remove('hidden');
    $('p2Tag').textContent=mode==='cpu'?'CPU':mode==='training'?'DUMMY':'P2';resetRound(true);
  }
  function pauseGame() {
    if(phase!=='playing')return;
    phase='paused';clearInput();$('pauseTitle').textContent='对决暂停';$('pauseMessage').textContent='下一次交锋，由你决定。';
    $('resumeButton').innerHTML='继续对决 <span>↗</span>';$('pauseScreen').classList.remove('hidden');
  }
  function resumeGame() {
    if(phase==='result'){startMatch();return;}
    phase='playing';$('pauseScreen').classList.add('hidden');initAudio();
  }
  function menu() {
    phase='menu';clearInput();$('pauseScreen').classList.add('hidden');$('startScreen').classList.remove('hidden');$('pauseButton').classList.add('hidden');
    $('announcer').innerHTML='';announce.timer=0;fighters=[fighter(0),fighter(1)];projectiles=[];particles=[];slashes=[];rings=[];ghosts=[];textFx=[];updateHUD();
  }
  function endRound() {
    if(roundDelay||phase!=='playing'||mode==='training')return;
    const a=fighters[0],b=fighters[1];
    let winner=a.hp===b.hp?-1:a.hp>b.hp?0:1;
    if(a.hp<=0&&b.hp<=0)winner=-1;
    if(winner>=0)fighters[winner].wins++;
    matchWinner=winner>=0&&fighters[winner].wins>=2?winner:-1;
    roundDelay=180;projectiles=[];
    announce(winner<0?'DRAW':time<=0?'TIME UP':'SLASH!',winner<0?'势均力敌 · 再战一局':(winner===0?'DEEPSEEK':'CLAUDE')+' TAKES THE ROUND',160);
    shake=12;sfx('heavy');
  }

  function addRing(x,y,color,size=130,life=25,width=4) {rings.push({x,y,color,size,life,max:life,width});}
  function sparks(x,y,color,count=20,power=9) {
    for(let i=0;i<count;i++){const a=rand(0,TAU),v=rand(1,power);particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:rand(15,32),max:32,size:rand(1,4),color,gravity:.12});}
  }
  function dust(f,count=8) {
    for(let i=0;i<count;i++)particles.push({x:f.x+rand(-25,25),y:FLOOR-3,vx:rand(-2,2)-f.vx*.16,vy:rand(-2.5,-.4),life:rand(15,30),max:30,size:rand(3,10),color:'#a5c5c055',gravity:-.015});
  }
  function floating(x,y,text,color) {textFx.push({x,y,text,color,life:55,max:55});}
  function beginMove(f,name) {
    const m=moves[name];
    if(!m||f.stun||f.blockstun||f.dash>7||intro>0||roundDelay)return false;
    if(f.action&&!(f.connected&&m.rank>moves[f.action].rank))return false;
    if(name==='wave'&&f.waveCd>0)return false;
    if(name==='super'&&f.meter<50){floating(f.x,FLOOR-f.y-260,'NEED 50% TENSION','#dfc5a8');return false;}
    f.action=name;f.age=0;f.hit=false;f.connected=false;f.dash=0;f.guard=false;
    if(name==='super'){
      f.meter-=50;f.invul=42;superScene=42;hitstop=10;
      addRing(f.x,FLOOR-f.y-140,colors[f.id],240,40,2);
      floating(f.x,FLOOR-f.y-280,f.id?'烬 日 绽 放':'沧 海 鲸 鸣',colors[f.id]);sfx('super');
    }
    if(name==='rise'){f.invul=13;f.vy=-13;f.y=Math.max(f.y,2);f.vx=f.face*3;}
    if(name==='wave')f.waveCd=62;
    if(name==='heavy')f.vx=f.face*3.5;
    return true;
  }
  function doDash(f,dir) {
    if(f.stun||f.blockstun||f.action||f.dashCd>0||intro||roundDelay||(f.y>0&&f.airdash))return;
    f.dash=15;f.dashCd=24;f.dashDir=dir||f.face;f.vx=f.dashDir*(f.y>0?15:16);
    if(f.y>0){f.airdash=true;f.vy=0;}
    dust(f);sfx('dash');
  }
  function jump(f) {
    if(f.stun||f.blockstun||f.action||f.jumps>=2||intro||roundDelay)return;
    if(f.y===0){dust(f);f.jumps=0;}
    f.vy=-13.8;f.jumps++;f.y=Math.max(f.y,1);f.dash=0;
    if(f.jumps===2)addRing(f.x,FLOOR-f.y,colors[f.id],55,17,2);
  }
  function romanCancel(f,o) {
    if(f.meter<50||f.stun||f.blockstun||intro||roundDelay)return;
    f.meter-=50;f.action=null;f.dash=0;f.vx*=.3;f.vy*=.3;f.invul=12;f.buffer=[];
    slow=42;o.stun=Math.max(o.stun,Math.abs(f.x-o.x)<280?21:0);
    addRing(f.x,FLOOR-f.y-130,'#f49cf2',260,35,5);sparks(f.x,FLOOR-f.y-130,'#fbb8ff',35,12);
    floating(f.x,FLOOR-f.y-280,'ROMAN CANCEL','#fbb8ff');hitstop=7;sfx('wave');
  }
  function burst(f,o) {
    if(f.burst<99||intro||roundDelay)return;
    f.burst=0;f.action=null;f.stun=0;f.blockstun=0;f.invul=45;f.vx=0;f.vy=f.y>0?2:0;
    addRing(f.x,FLOOR-f.y-120,'#b9e9ff',300,34,7);sparks(f.x,FLOOR-f.y-120,'#b9e9ff',50,14);
    floating(f.x,FLOOR-f.y-270,'BLUE BURST','#b9e9ff');
    if(Math.abs(f.x-o.x)<320&&Math.abs(f.y-o.y)<200){o.stun=35;o.vx=Math.sign(o.x-f.x)*17;o.vy=-8;o.y=Math.max(1,o.y);o.action=null;}
    projectiles=projectiles.filter(p=>p.owner===f.id||Math.abs(p.x-f.x)>330);shake=10;hitstop=6;sfx('heavy');
  }
  function impact(a,b,m,projectile=false) {
    if(b.invul>0||b.hp<=0)return false;
    const front=(a.x-b.x)*b.face>0;
    const low=!projectile&&a.crouch&&a.action==='kick';
    const overhead=!projectile&&a.y>25;
    const guardHeight=(!low||b.crouch)&&(!overhead||!b.crouch);
    const blocked=b.guard&&front&&!b.stun&&!b.action&&(b.y===0||a.y>0)&&guardHeight;
    const x=lerp(a.x,b.x,.75),y=FLOOR-b.y-125;
    a.connected=true;
    if(blocked){
      b.blockstun=m.rank>=4?18:12;b.vx=-b.face*(m.push||6)*.6;b.hp=Math.max(1,b.hp-(m.rank>=5?Math.ceil(m.damage*.09):0));
      addRing(b.x+b.face*40,y,'#9ccfff',65,12,3);sparks(x,y,'#b4e6ff',12,5);hitstop=4;sfx('guard');a.meter=Math.min(100,a.meter+3);b.meter=Math.min(100,b.meter+2);
      return true;
    }
    const counter=!!b.action&&b.age<moves[b.action].startup;
    const isCombo=b.stun>0;
    if(!isCombo){a.combo=0;a.comboDamage=0;}
    a.combo++;const scaling=Math.max(.35,1-(a.combo-1)*.105);
    const damage=Math.round(m.damage*scaling*(counter?1.2:1));
    a.comboDamage+=damage;a.comboTime=105;b.hp=Math.max(0,b.hp-damage);b.lastHit=globalTime;
    b.stun=(m.stun||36)+(counter?10:0);b.action=null;b.blockstun=0;b.guard=false;b.dash=0;b.hurt=14;b.blink=8;
    b.vx=a.face*(m.push||8);if(m.launch||b.y>0){b.vy=-(m.launch||5);b.y=Math.max(1,b.y);}
    a.meter=Math.min(100,a.meter+damage*.23+2);b.meter=Math.min(100,b.meter+damage*.14);b.burst=Math.min(100,b.burst+damage*.1);
    hitstop=m.rank>=4?9:5;shake=m.rank>=4?10:4;flash=m.rank>=4?5:2;
    sparks(x,y,colors[a.id],m.rank>=4?36:22,m.rank>=4?14:9);sparks(x,y,'#fff8d8',12,10);
    slashes.push({x,y,face:a.face,color:colors[a.id],life:13,max:13,size:m.rank>=4?150:90,angle:rand(-.6,.6)});
    if(counter)floating(b.x,y-130,'COUNTER','#ffe1a2');
    if(a.combo===2)floating(a.x,FLOOR-a.y-270,'GATLING',colors[a.id]);
    sfx(m.rank>=4?'heavy':'hit');return true;
  }
  function spawnProjectile(f,ultimate=false) {
    projectiles.push({owner:f.id,x:f.x+f.face*78,y:FLOOR-f.y-(f.crouch?70:125),vx:f.face*(ultimate?12:9),face:f.face,
      size:ultimate?80:30,life:160,age:0,ultimate,hit:false,
      move:ultimate?{damage:92,stun:52,push:16,rank:6,launch:10}:{damage:26,stun:27,push:7,rank:5}});
    sfx('wave');addRing(f.x+f.face*65,FLOOR-f.y-125,colors[f.id],ultimate?140:65,20,3);
  }

  function inputPlayer(f,o) {
    const p=f.id;
    if(bufferedTaps[p].has('burst'))burst(f,o);
    if(bufferedTaps[p].has('rc'))romanCancel(f,o);
    inputBuffer[p]=inputBuffer[p].filter(b=>--b.ttl>0);
    for(let i=inputBuffer[p].length-1;i>=0;i--){if(beginMove(f,inputBuffer[p][i].name)){inputBuffer[p]=[];break;}}
    const direction=Number(held(p,'right'))-Number(held(p,'left'));
    if(bufferedTaps[p].has('up'))jump(f);
    if(bufferedTaps[p].has('dash'))doDash(f,direction||f.face);
    f.crouch=held(p,'down')&&f.y===0;
    f.guard=(held(p,'guard')||direction===-f.face)&&!f.action&&!f.dash&&!f.stun;
    if(!f.stun&&!f.blockstun&&!f.action&&!f.dash){
      f.vx=lerp(f.vx,direction*(f.crouch?1.7:4.5),f.y>0?.12:.35);
      if(direction&&Math.sign(o.x-f.x)===direction)f.meter=Math.min(100,f.meter+.028);
    }
  }
  function cpu(f,o) {
    const dist=Math.abs(f.x-o.x), level=difficulty==='hard'?1:difficulty==='easy'?-.5:0;
    f.aiClock--;f.aiGuard=Math.max(0,f.aiGuard-1);
    if(f.aiClock<=0){
      f.aiClock=Math.round(rand(9,19)-level*4);
      f.aiMove=dist>190?f.face:dist<85&&Math.random()<.25?-f.face:0;
      if(o.action&&dist<260&&Math.random()<.5+level*.2)f.aiGuard=rand(15,30);
      if(f.stun>0&&f.burst>=99&&o.combo>=4&&Math.random()<.35+level*.2)burst(f,o);
      if(!f.stun&&!f.blockstun&&!f.action){
        if(dist<100)beginMove(f,Math.random()<.5?'light':'kick');
        else if(dist<185)beginMove(f,Math.random()<.55?'slash':'heavy');
        else if(dist<245&&Math.random()<.45)beginMove(f,'heavy');
        else if(dist>300&&Math.random()<.28+level*.12)beginMove(f,'wave');
        else if(dist>320&&Math.random()<.35)doDash(f,f.face);
        if(dist<290&&f.meter>=50&&Math.random()<.25+level*.12)beginMove(f,'super');
        if(o.y>80&&dist<170&&Math.random()<.6)beginMove(f,'rise');
        if(projectiles.some(p=>p.owner!==f.id&&Math.abs(p.x-f.x)<260)&&Math.random()<.7)jump(f);
        if(Math.random()<.05+level*.03)jump(f);
      }
    }
    if(f.connected&&f.action&&Math.random()<.16+level*.08){
      const next={light:'kick',kick:'slash',slash:'heavy',heavy:'wave'}[f.action];if(next)beginMove(f,next);
    }
    f.guard=f.aiGuard>0&&!f.action&&!f.dash;f.crouch=false;
    if(!f.stun&&!f.blockstun&&!f.action&&!f.dash)f.vx=lerp(f.vx,f.guard?0:f.aiMove*4.1,.3);
  }

  function tickFighter(f,o) {
    if(!f.action&&!f.stun&&!f.dash)f.face=o.x>=f.x?1:-1;
    f.stun=Math.max(0,f.stun-1);f.blockstun=Math.max(0,f.blockstun-1);f.invul=Math.max(0,f.invul-1);
    f.waveCd=Math.max(0,f.waveCd-1);f.dashCd=Math.max(0,f.dashCd-1);f.blink=Math.max(0,f.blink-1);f.hurt=Math.max(0,f.hurt-1);f.land=Math.max(0,f.land-1);
    f.comboTime=Math.max(0,f.comboTime-1);f.burst=Math.min(100,f.burst+.022);
    if(intro===0&&!roundDelay){
      if(f.id===1&&mode==='cpu')cpu(f,o);
      else if(f.id===1&&mode==='training'){f.guard=false;f.crouch=false;f.vx*=.85;}
      else inputPlayer(f,o);
    }else f.vx*=.8;
    if(f.action){
      const m=moves[f.action];f.age++;
      if(f.age<m.startup&&f.y===0)f.vx*=.72;
      if(f.age===m.startup){
        if(f.action==='wave'||f.action==='super')spawnProjectile(f,f.action==='super');
        else{
          const slashType=m.rank>=3;
          if(slashType)slashes.push({x:f.x+f.face*m.range*.53,y:FLOOR-f.y-m.height,face:f.face,color:colors[f.id],life:13,max:13,size:m.range*.8,angle:f.action==='rise'?-1.2:f.action==='heavy'?.5:-.25});
          tone(f.id?440:300,.08,'triangle',.12,90);
        }
      }
      if(!f.hit&&f.age>=m.startup&&f.age<m.startup+m.active&&m.range){
        const dx=(o.x-f.x)*f.face;
        const vertical=Math.abs((FLOOR-f.y-m.height)-(FLOOR-o.y-(o.crouch?77:130)));
        if(dx>-35&&dx<m.range+28&&vertical<(o.crouch?75:110))f.hit=impact(f,o,m);
      }
      if(f.age>=m.total){f.action=null;f.age=0;}
    }
    if(f.dash>0){
      f.dash--;f.vx=f.dashDir*(f.y>0?13:14)*(f.dash<4?.7:1);
      if(f.y>0)f.vy=0;
      if(f.dash%3===0){ghosts.push({x:f.x,y:f.y,face:f.face,id:f.id,pose:f.pose?{...f.pose}:null,life:14});if(f.y===0)dust(f,3);}
    }
    if(f.stun||f.blockstun)f.vx*=f.y>0?.97:.87;
    else if(f.action)f.vx*=.91;
    f.x+=f.vx;f.x=clamp(f.x,75,W-75);
    if(f.y>0||f.vy<0){f.y-=f.vy; /* velocity below is screen-down; y stores altitude */
      // vy is negative for upward movement. Altitude increases by -vy.
      f.vy+=f.dash>0?0:.58;
      if(f.y<=0){f.y=0;f.vy=0;f.jumps=0;f.airdash=false;f.land=9;dust(f,10);if(f.stun)f.stun=Math.min(f.stun,12);}
    }
    f.walk+=Math.abs(f.vx)*.08;
    if(mode==='training'){
      f.meter=100;f.burst=100;
      if(globalTime-f.lastHit>140&&f.hp<MAX_HP)f.hp=Math.min(MAX_HP,f.hp+5);
    }
  }

  function pollGamepads() {
    const pads=navigator.getGamepads?navigator.getGamepads():[];
    const connected=Array.from(pads).filter(Boolean);
    for(let p=0;p<2;p++){
      const next=new Set(),pad=connected[p];
      if(pad){
        const b=i=>!!pad.buttons[i]?.pressed;
        if(pad.axes[0]<-.28||b(14))next.add('left');if(pad.axes[0]>.28||b(15))next.add('right');
        if(pad.axes[1]<-.5||b(12)||b(0))next.add('up');if(pad.axes[1]>.5||b(13))next.add('down');
        const down=next.has('down');
        if(b(2))next.add('light');if(b(3))next.add('kick');if(b(1))next.add('slash');if(b(5))next.add(down?'burst':'heavy');
        if(b(4))next.add(down?'rc':'dash');if(b(6))next.add('wave');if(b(7))next.add(down?'super':'rise');
        if(b(9)&&!gamepadDown[p].has('pause')){if(phase==='playing')pauseGame();else if(phase==='paused')resumeGame();else if(phase==='menu')startMatch();}if(b(9))next.add('pause');
      }
      gamepadEdges[p]=new Set([...next].filter(x=>!gamepadDown[p].has(x)));gamepadDown[p]=next;
    }
  }
  function update() {
    globalTime++;pollGamepads();
    if(phase==='playing'){
      if(!intro&&!roundDelay){
        for(let p=0;p<2;p++)if(p===0||mode==='versus'){
          for(const name of Object.keys(moves))if(tap(p,name))inputBuffer[p].push({name,ttl:9});
          for(const name of ['up','dash','burst','rc'])if(tap(p,name))bufferedTaps[p].add(name);
        }
      }
      if(announce.timer>0&&--announce.timer===0)$('announcer').innerHTML='';
      if(hitstop>0){hitstop--;pressed.clear();updateFX();return;}
      if(superScene>0)superScene--;
      if(slow>0)slow--;
      if(intro>0){intro--;if(intro===45&&mode!=='training'){announce('LET’S ROCK','',44);sfx('ui');}}
      if(roundDelay>0){
        roundDelay--;
        if(roundDelay===0){
          if(matchWinner>=0){phase='result';$('pauseTitle').textContent=(matchWinner===0?'DEEPSEEK':'CLAUDE')+' 获胜';$('pauseMessage').textContent='最终比分 '+fighters[0].wins+' : '+fighters[1].wins+' · 再来一场，让故事继续。';$('resumeButton').innerHTML='再战一场 <span>↗</span>';$('pauseScreen').classList.remove('hidden');clearInput();}
          else{round++;resetRound();}
        }
      }
      if(phase==='playing'){
        fighters.forEach((f,i)=>{if(!(slow>0&&globalTime%2&&f.invul===0))tickFighter(f,fighters[1-i]);});
        const a=fighters[0],b=fighters[1],dx=b.x-a.x;
        if(Math.abs(dx)<70&&Math.abs(a.y-b.y)<125){const push=(70-Math.abs(dx))*.5,sign=dx>=0?1:-1;a.x=clamp(a.x-push*sign,75,W-75);b.x=clamp(b.x+push*sign,75,W-75);}
        updateProjectiles();
        if(!intro&&!roundDelay&&mode!=='training'){time=Math.max(0,time-1/60);if(time<=0||fighters.some(f=>f.hp<=0))endRound();}
      }
    }
    if(phase==='playing'||phase==='menu')updateFX();
    pressed.clear();bufferedTaps.forEach(b=>b.clear());updateHUD();
  }
  function updateProjectiles() {
    for(const p of projectiles){
      p.x+=p.vx;p.age++;p.life--;
      const target=fighters[1-p.owner],source=fighters[p.owner];
      if(Math.abs(p.x-target.x)<p.size+34&&Math.abs(p.y-(FLOOR-target.y-(target.crouch?70:130)))<p.size+(target.crouch?55:95)){
        if(impact(source,target,p.move,true)){p.life=0;addRing(p.x,p.y,colors[p.owner],p.ultimate?240:90,22,5);}
      }
      if(globalTime%2===0)particles.push({x:p.x-rand(0,60)*p.face,y:p.y+rand(-p.size*.5,p.size*.5),vx:-p.vx*.13,vy:rand(-.6,.6),life:18,max:18,size:rand(2,6),color:colors[p.owner],gravity:0});
    }
    for(let i=0;i<projectiles.length;i++)for(let j=i+1;j<projectiles.length;j++){
      const a=projectiles[i],b=projectiles[j];
      if(a.life>0&&b.life>0&&a.owner!==b.owner&&Math.abs(a.x-b.x)<a.size+b.size&&Math.abs(a.y-b.y)<a.size+b.size){
        sparks((a.x+b.x)/2,(a.y+b.y)/2,'#e1e6df',25,12);sfx('heavy');shake=5;
        if(a.ultimate===b.ultimate){a.life=0;b.life=0;}else if(a.ultimate)b.life=0;else a.life=0;
      }
    }
    projectiles=projectiles.filter(p=>p.life>0&&p.x>-180&&p.x<W+180);
  }
  function updateFX() {
    shake*=.85;flash=Math.max(0,flash-1);
    particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=p.gravity;p.vx*=.97;p.life--;});particles=particles.filter(p=>p.life>0);
    for(const list of [rings,slashes,ghosts,textFx]){list.forEach(p=>p.life--);}
    rings=rings.filter(p=>p.life>0);slashes=slashes.filter(p=>p.life>0);ghosts=ghosts.filter(p=>p.life>0);textFx=textFx.filter(p=>p.life>0);
    if(particles.length>650)particles.splice(0,particles.length-650);
  }
  function updateHUD() {
    fighters.forEach((f,i)=>{
      const n=i+1,pct=clamp(f.hp/MAX_HP,0,1);
      $('health'+n).style.transform='scaleX('+pct+')';$('trail'+n).style.transform='scaleX('+pct+')';
      $('hp'+n).textContent=Math.ceil(f.hp)+' / '+MAX_HP;
      $('meter'+n).style.width=f.meter+'%';$('meterText'+n).textContent=Math.floor(f.meter)+'%';
      $('burst'+n).textContent=(i?'':'● ')+(f.burst>=99?'BURST READY':'BURST '+Math.floor(f.burst)+'%')+(i?' ●':'');
      $('state'+n).textContent=f.stun?'HIT STUN':f.guard?'GUARD':f.action?f.action.toUpperCase():f.y>0?'AIRBORNE':f.dash?'DASH':'NEUTRAL';
      [...$('rounds'+n).children].forEach((el,k)=>el.classList.toggle('won',k<f.wins));
      $('combo'+n).innerHTML=f.comboTime>0&&f.combo>1?'<strong>'+f.combo+'</strong><span>BEAT</span><small>'+f.comboDamage+' DAMAGE</small>':'';
    });
    $('timer').textContent=mode==='training'?'∞':String(Math.ceil(time)).padStart(2,'0');
    $('roundLabel').textContent=mode==='training'?'TRAINING':'ROUND '+String(round).padStart(2,'0');
  }

  // Drawing helpers. Every character layer is vector art, posed continuously.
  function path(d,fill,stroke=null,width=1.5) {
    const p=new Path2D(d);if(fill){ctx.fillStyle=fill;ctx.fill(p);}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke(p);}
  }
  function line(x1,y1,x2,y2,color,width=1) {ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
  function ellipse(x,y,rx,ry,fill) {ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fillStyle=fill;ctx.fill();}
  function gradient(x1,y1,x2,y2,stops) {const g=ctx.createLinearGradient(x1,y1,x2,y2);stops.forEach(([p,c])=>g.addColorStop(p,c));return g;}

  const scenery=document.createElement('canvas');scenery.width=W;scenery.height=H;
  const mainCtx=ctx;
  // Static scenery is cached once; animated water, motes and cloth are layered on top.
  function drawScenery() {
    ctx.fillStyle=gradient(0,0,W,H,[[0,'#173c50'],[.48,'#354d5a'],[1,'#6d4842']]);ctx.fillRect(0,0,W,H);
    const moon=ctx.createRadialGradient(728,242,10,728,242,270);moon.addColorStop(0,'#b4d9d23a');moon.addColorStop(1,'#c6e4d000');ctx.fillStyle=moon;ctx.fillRect(350,0,750,560);
    ellipse(728,242,92,92,'#c3d6cc');ellipse(705,224,73,79,'#cbded30d');
    path('M 0 345 L 120 305 203 330 302 271 378 313 442 278 535 330 619 295 699 335 780 308 865 340 933 285 1027 312 1094 278 1160 310 1280 260 1440 319 V 550 H 0 Z','#294752');
    path('M 0 392 L 84 360 152 383 268 324 389 386 461 344 549 378 609 351 735 396 858 357 978 382 1110 328 1200 368 1360 329 1440 365 V 551 H 0 Z','#233e48');
    ctx.fillStyle=gradient(0,410,0,620,[[0,'#496267'],[.2,'#2b535c'],[1,'#1d3949']]);ctx.fillRect(0,429,W,210);
    for(let i=0;i<70;i++){const y=436+i*2.5,x=728+Math.sin(i*2)*i*1.7;line(x-i*1.5,y,x+i*1.5,y,'#d0dece'+(i%3===0?'20':'0b'),1);}
    // Broken shrine gate, with lanterns framing the horizon.
    for(const x of [495,906]){
      ctx.fillStyle='#172f36';ctx.fillRect(x,284,17,256);ctx.fillStyle='#416062';ctx.fillRect(x+2,284,3,256);
      ctx.fillStyle='#172f36';ctx.fillRect(x-13,491,44,15);
    }
    path('M 435 271 Q 716 298 968 267 L 958 289 Q 715 318 445 292 Z','#142c34','#54716b',2);
    path('M 470 326 Q 713 340 947 321 L 944 334 Q 711 352 472 339 Z','#172e35');
    line(490,353,916,349,'#8a9a7a77',1.5);
    for(let i=0;i<12;i++){const x=510+i*34,y=353-Math.sin(i/11*Math.PI)*4;path(`M ${x} ${y} l -4 10 8 3 -5 13 10 -4 -5 -7 5 -9 Z`,'#c6cab28a');}
    // Left pavilion.
    path('M 0 228 Q 92 249 233 217 L 278 248 Q 190 272 0 264 Z','#142c35','#49656a',2);
    path('M 0 211 Q 123 233 206 191 L 242 220 Q 140 256 0 238 Z','#1b3540');
    ctx.fillStyle='#182e36';ctx.fillRect(47,255,19,300);ctx.fillRect(202,256,14,287);
    ctx.fillStyle='#2c474b';ctx.fillRect(52,263,4,278);line(0,366,225,350,'#5b737065',3);
    // Right pavilion, warm lantern light.
    path('M 1190 235 Q 1328 249 1440 214 V 254 Q 1297 282 1145 261 Z','#2b2e33','#80675b',2);
    path('M 1238 200 Q 1325 229 1440 187 V 221 Q 1292 258 1190 235 Z','#343438');
    ctx.fillStyle='#332f32';ctx.fillRect(1217,267,20,291);ctx.fillRect(1385,252,22,305);
    ctx.fillStyle='#976c4d66';ctx.fillRect(1220,268,4,285);line(1209,362,1440,355,'#ad7a5266',3);
    [130,1290].forEach((x,i)=>{
      const y=i?330:315;line(x,y-55,x,y-10,'#c6bda977',2);
      const glow=ctx.createRadialGradient(x,y+14,0,x,y+14,100);glow.addColorStop(0,i?'#ffbc7140':'#9ce5db30');glow.addColorStop(1,'#ffd18b00');ctx.fillStyle=glow;ctx.fillRect(x-100,y-90,200,200);
      path(`M ${x-17} ${y-12} Q ${x-27} ${y+12} ${x-13} ${y+40} H ${x+13} Q ${x+27} ${y+12} ${x+17} ${y-12} Z`,i?'#f1b878':'#badcc4','#213d43',3);
      for(let a=-1;a<=1;a++)line(x+a*10,y-10,x+a*9,y+39,i?'#86563777':'#3b746d66',1);
      line(x-22,y-13,x+22,y-13,'#172d35',5);line(x-17,y+40,x+17,y+40,'#172d35',4);
    });
    // Foreground pier.
    path('M 0 551 Q 710 534 1440 550 V 760 H 0 Z',gradient(0,550,0,760,[[0,'#45565b'],[.2,'#354852'],[1,'#1b2b38']]));
    path('M 0 549 Q 710 531 1440 548 L 1440 562 Q 710 547 0 563 Z','#6d7b7680');
    for(let i=-7;i<20;i++){const top=720+(i-6)*100;line(top,550,720+(top-720)*2.4,760,'#172c3980',2);}
    for(let i=0;i<8;i++){const y=554+Math.pow(i,1.8)*7;line(0,y,W,y,'#132c3b77',2);line(0,y+3,W,y+3,'#bdc3a50d',1);}
    path('M 0 616 Q 700 607 1440 616',null,'#c0c6b81a',2);
    for(let i=0;i<85;i++){let x=(i*193)%W,y=560+(i*37)%190;line(x,y,x+15+(i%6)*7,y+1,'#c0bfa30c',1);}
    // Reeds and hanging branches.
    for(let side=0;side<2;side++){
      ctx.save();if(side){ctx.translate(W,0);ctx.scale(-1,1);}
      path('M -30 80 Q 80 25 266 38 Q 135 62 82 89 Q 155 96 218 126 Q 118 111 54 122 L -20 173 Z','#102d38');
      for(let i=0;i<15;i++){let x=i*17,y=52+Math.sin(i*1.7)*35;path(`M ${x} ${y} q 23 4 37 22 q -31 0 -37 -22`,side?'#333b3c':'#173b45');}
      for(let i=0;i<12;i++){const x=i*8-30;path(`M ${x} 653 Q ${x+20} 550 ${x-10} ${520+i%3*16}`,null,'#172c34',3);}
      ctx.restore();
    }
  }
  drawScenery();scenery.getContext('2d').drawImage(canvas,0,0);

  function drawBackground(t) {
    ctx.drawImage(scenery,0,0);
    // Slowly sliding water highlights.
    ctx.save();ctx.globalAlpha=.17;
    for(let i=0;i<22;i++){
      const y=443+i*4.1,x=((i*137+t*(i%2?6:-7))%1550+1550)%1550-80;
      line(x,y,x+32+i*3,y,i%3?'#9cbab2':'#cbe0ca',1);
    }ctx.restore();
    for(let i=0;i<28;i++){
      const x=(i*197+Math.sin(t*.2+i)*35)%W,y=175+(i*73)%380+Math.sin(t*.35+i)*15;
      ellipse(x,y,i%5?1:1.8,i%5?1:1.8,i%3?'#8cd9dc33':'#efb08066');
    }
    // Cloth ribbons in the sea breeze.
    for(const [x,y,c] of [[509,289,'#80c8cb55'],[918,286,'#e0ad8155']]){
      path(`M ${x} ${y} Q ${x+18} ${y+50} ${x+Math.sin(t*1.5)*16} ${y+96} Q ${x-7} ${y+65} ${x-5} ${y} Z`,c);
    }
    const fog=ctx.createLinearGradient(0,450,0,600);fog.addColorStop(0,'#acc3ba00');fog.addColorStop(.5,'#b0c8be08');fog.addColorStop(1,'#b0c8be00');ctx.fillStyle=fog;ctx.fillRect(0,450,W,150);
  }

  function targetPose(f,t) {
    let p={lean:0,hip:-104,shoulder:-174,head:0,
      bex:-37,bey:-139,bhx:-40,bhy:-111,fex:34,fey:-143,fhx:54,fhy:-173,
      bkx:-24,bky:-50,bfx:-37,bfy:0,fkx:26,fky:-56,ffx:42,ffy:0};
    const breath=Math.sin(t*2.8+f.id)*2.5;p.shoulder+=breath;p.hip+=breath*.3;
    if(f.crouch&&f.y===0){Object.assign(p,{hip:-63,shoulder:-123,lean:15,bkx:-35,bky:-28,bfx:-55,fkx:39,fky:-34,ffx:55,fey:-93,fhy:-140,bey:-99,bhy:-80});}
    else if(f.y>0){Object.assign(p,{lean:8,hip:-110,shoulder:-179,bkx:-36,bky:-76,bfx:-56,bfy:-64,fkx:40,fky:-74,ffx:25,ffy:-36,bex:-40,bey:-164,bhx:-46,bhy:-136});}
    else if(Math.abs(f.vx)>1.3&&!f.action&&!f.stun){
      const v=Math.sin(f.walk),v2=Math.cos(f.walk);p.lean=10;p.shoulder+=Math.abs(v)*4;
      p.bkx=-v*20-8;p.bfx=-v*48-6;p.bfy=Math.min(0,-v2*13);
      p.fkx=v*22+6;p.ffx=v*49+7;p.ffy=Math.min(0,v2*13);
      p.fex=20-v*17;p.fey=-140;p.fhx=25-v*28;p.fhy=-127;
      p.bex=-20+v*18;p.bhx=-20+v*28;p.bhy=-140;
    }
    if(f.dash){Object.assign(p,{lean:36,shoulder:-156,hip:-93,bex:-55,bey:-153,bhx:-94,bhy:-147,fex:-26,fey:-125,fhx:-52,fhy:-99,bkx:-40,bky:-36,bfx:-84,bfy:-7,fkx:38,fky:-47,ffx:32,ffy:0});}
    if(f.guard){p.lean=-8;p.fex=35;p.fey=p.shoulder+13;p.fhx=27;p.fhy=p.shoulder-28;p.bex=2;p.bey=p.shoulder+28;p.bhx=33;p.bhy=p.shoulder-9;}
    if(f.stun){p.lean=-20;p.head=-9;p.fex=34;p.fey=-135;p.fhx=58;p.fhy=-107;p.bex=-44;p.bey=-155;p.bhx=-65;p.bhy=-139;if(f.y>0){p.ffx=60;p.ffy=-32;p.bfx=-35;p.bfy=-24;}}
    if(f.hp<=0){Object.assign(p,{lean:-45,shoulder:-101,hip:-58,head:-15,bkx:-36,bky:-24,bfx:-64,fkx:36,fky:-28,ffx:66,fex:28,fey:-62,fhx:42,fhy:-30,bex:-58,bey:-82,bhx:-72,bhy:-48});}
    if(f.action){
      const m=moves[f.action],a=f.age,extension=clamp((a-(m.startup-4))/4,0,1)*(1-clamp((a-m.startup-m.active)/(m.total-m.startup-m.active),0,1));
      const e=extension;
      if(f.action==='light'){p.lean=12*e;p.fex=lerp(23,62,e);p.fey=-169;p.fhx=lerp(35,107,e);p.fhy=-169;p.bhx=-3;p.bhy=-160;}
      if(f.action==='kick'){p.lean=(f.crouch?15:-12)*e;p.fkx=lerp(26,64,e);p.fky=lerp(-56,f.crouch?-35:-99,e);p.ffx=lerp(42,145,e);p.ffy=lerp(0,f.crouch?-17:-103,e);p.fhx=20;p.fhy=f.crouch?-135:-166;}
      if(f.action==='slash'){p.lean=18*e;p.fex=lerp(17,64,e);p.fey=-161;p.fhx=lerp(-12,115,e);p.fhy=lerp(-196,-139,e);p.bhx=-28;p.bhy=-100;}
      if(f.action==='heavy'){p.lean=23*e;p.fex=lerp(-34,66,e);p.fey=lerp(-211,-148,e);p.fhx=lerp(-34,124,e);p.fhy=lerp(-256,-96,e);p.bhx=lerp(-10,92,e);p.bhy=lerp(-217,-120,e);p.ffx=54;}
      if(f.action==='wave'){p.lean=14;p.fex=51;p.fey=-151;p.fhx=88;p.fhy=-159;p.bex=22;p.bey=-145;p.bhx=65;p.bhy=-151;}
      if(f.action==='rise'){p.lean=13;p.fex=28;p.fey=-219;p.fhx=45;p.fhy=-263;p.bhx=-20;p.bhy=-135;p.fkx=40;p.fky=-84;p.ffx=22;p.ffy=-61;}
      if(f.action==='super'){p.lean=5;p.fex=58;p.fey=-173;p.fhx=89;p.fhy=-205;p.bex=-46;p.bey=-174;p.bhx=-72;p.bhy=-203;}
    }
    return p;
  }
  function limb(ax,ay,bx,by,cx,cy,thick1,thick2,color,outline='#112a3b') {
    const a=Math.atan2(by-ay,bx-ax),b=Math.atan2(cy-by,cx-bx),n=[Math.sin(a),-Math.cos(a)],m=[Math.sin(b),-Math.cos(b)];
    path(`M ${ax+n[0]*thick1} ${ay+n[1]*thick1} Q ${bx+n[0]*thick2} ${by+n[1]*thick2} ${cx+m[0]*thick2*.7} ${cy+m[1]*thick2*.7} L ${cx-m[0]*thick2*.7} ${cy-m[1]*thick2*.7} Q ${bx-n[0]*thick2} ${by-n[1]*thick2} ${ax-n[0]*thick1} ${ay-n[1]*thick1} Z`,color,outline,1.8);
    ellipse(bx,by,thick2,thick2,color);
  }
  function drawLeg(f,p,front) {
    const id=f.id,hipx=front?10:-11,kx=p[front?'fkx':'bkx'],ky=p[front?'fky':'bky'],fx=p[front?'ffx':'bfx'],fy=p[front?'ffy':'bfy'];
    limb(hipx,p.hip+10,kx,ky,fx,fy-10,11,8,id?'#32333e':front?'#e2eced':'#b2c9d2');
    // Stocking seam and top band.
    line(hipx,p.hip+22,lerp(hipx,kx,.35),lerp(p.hip+10,ky,.35),id?'#e6b68a':'#718fa6',2.4);
    line(kx+3,ky+5,fx+3,fy-15,id?'#62575a':'#f5f5e7',1.5);
    path(`M ${fx-8} ${fy-16} Q ${fx+1} ${fy-12} ${fx+9} ${fy-15} L ${fx+12} ${fy-5} Q ${fx+24} ${fy-3} ${fx+23} ${fy+2} L ${fx-9} ${fy+2} Z`,id?'#292d36':'#18374d','#112638',2);
    line(fx-7,fy-5,fx+11,fy-5,id?'#eeac79':'#72becb',2);
    path(`M ${fx-7} ${fy+2} h 31 v 3 h -31 Z`,'#0f2330');
  }
  function drawArm(f,p,front) {
    const px=p.lean+(front?12:-14),py=p.shoulder+9,ex=p[front?'fex':'bex'],ey=p[front?'fey':'bey'],hx=p[front?'fhx':'bhx'],hy=p[front?'fhy':'bhy'];
    const id=f.id,cloth=id?(front?'#f0dac1':'#c9ac97'):(front?'#eff7ef':'#a3c8d6');
    limb(px,py,ex,ey,hx,hy,13,8,cloth);
    // Puffy shoulder and contrasting cuff.
    ellipse(px,py,14,15,id?'#ece0cc':'#e7f2ec');
    ctx.save();ctx.translate(hx,hy);ctx.rotate(Math.atan2(hy-ey,hx-ex));
    path('M -11 -9 L -1 -9 L 1 8 L -10 9 Z',id?'#393741':'#214b67','#172d3b',1);
    line(-8,-7,-7,7,id?'#eeaf77':'#73d8e0',1.5);
    path('M 0 -6 Q 7 -9 12 -4 L 15 1 Q 15 6 9 7 L 1 6 Z','#f7d8c0','#956f6b',1.2);
    line(9,-3,10,3,'#d39e8a',.8);ctx.restore();
  }
  function drawCharacter(f,alpha=1,ghost=false) {
    const t=globalTime/60,id=f.id;
    const target=targetPose(f,t);
    if(!f.pose)f.pose={...target};
    if(!ghost&&(phase==='playing'||phase==='menu')){for(const k in target)f.pose[k]=lerp(f.pose[k],target[k],.4);}
    const p=f.pose||target;
    const sx=p.lean,sy=p.shoulder,hx=sx+p.head+2,hy=sy-45;
    const outline='#12293b',hair=id?'#d87e54':'#28547e',tip=id?'#f4bb7b':'#65d8e3';
    const hairG=gradient(0,hy-32,0,p.hip+10,[[0,id?'#e89b67':'#234d7b'],[.6,hair],[1,tip]]);
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(f.x,FLOOR-f.y);ctx.scale(f.face*1.14,1.14);
    if(f.blink>0&&!ghost)ctx.globalAlpha*=.86;
    if(f.invul>0&&globalTime%6<3&&!ghost)ctx.globalAlpha*=.65;
    const sway=Math.sin(t*2.8)*8-f.vx*1.6;
    if(!id){
      // Large attached whale tail, anchored behind the waist.
      const ty=p.hip+24;
      path(`M -13 ${p.hip+8} C -55 ${ty-14} -64 ${ty+55} -104 ${ty+39} Q -131 ${ty+27} -123 ${ty-16} C -146 ${ty-32} -167 ${ty-27+sway*.4} -172 ${ty-43+sway*.4} Q -174 ${ty+2} -138 ${ty+13} Q -161 ${ty+35} -153 ${ty+60} Q -122 ${ty+51} -111 ${ty+33} Q -72 ${ty+92} -27 ${ty+31} Z`,gradient(-150,ty,0,ty+50,[[0,'#4fc4d4'],[.55,'#285a83'],[1,'#244169']]),outline,2.3);
      path(`M -122 ${ty+10} Q -110 ${ty+50} -70 ${ty+45}`,null,'#b2f5ee77',2);
    }else{
      // Long scarf gives the orange character a readable silhouette.
      path(`M ${sx-2} ${sy-16} Q -42 ${sy-8} -70 ${sy-34+sway} Q -100 ${sy-54+sway} -133 ${sy-28+sway} L -115 ${sy-7+sway} Q -78 ${sy-35+sway} -51 ${sy-5} Q -24 ${sy+14} ${sx+12} ${sy+2} Z`,'#dba175',outline,2);
      path(`M -74 ${sy-27+sway} Q -102 ${sy-36+sway} -125 ${sy-23+sway}`,null,'#ffe4b2',2);
    }
    // Back hair, individually articulated tips.
    path(`M ${hx-30} ${hy-15} Q ${hx-50} ${hy+13} ${hx-37+sway*.3} ${hy+73} Q ${hx-35+sway} ${hy+111} ${hx-62+sway} ${hy+146} Q ${hx-22+sway} ${hy+144} ${hx-10} ${hy+106} Q ${hx+12+sway} ${hy+151} ${hx+41+sway} ${hy+135} Q ${hx+18} ${hy+98} ${hx+35} ${hy+45} Q ${hx+44} ${hy-8} ${hx+22} ${hy-26} Z`,hairG,outline,2.4);
    if(id){
      path(`M ${hx-21} ${hy+8} Q ${hx-45} ${hy+55} ${hx-69+sway} ${hy+76} Q ${hx-42+sway} ${hy+78} ${hx-35} ${hy+58} L ${hx-37} ${hy+82} Q ${hx-13} ${hy+63} ${hx-7} ${hy+36} Z`,'#edab72',outline,1.8);
    }
    drawArm(f,p,false);drawLeg(f,p,false);drawLeg(f,p,true);
    // Bodice, skirt and apron follow the hip/shoulder lean.
    const skirtY=p.hip+17,wave=Math.sin(t*4)*2+f.vx*.4;
    path(`M ${sx-19} ${sy+13} Q ${sx-26} ${sy+44} -21 ${p.hip-2} Q -36 ${p.hip+12} -51 ${skirtY+22} Q -4 ${skirtY+42+wave} 53 ${skirtY+24} Q 35 ${p.hip+5} 22 ${p.hip-4} Q ${sx+30} ${sy+47} ${sx+22} ${sy+13} Z`,id?'#343542':'#234b70',outline,2.4);
    path(`M -49 ${skirtY+22} Q -30 ${skirtY+31} -18 ${skirtY+29} Q -2 ${skirtY+42} 14 ${skirtY+30} Q 34 ${skirtY+38} 52 ${skirtY+24} L 49 ${skirtY+31} Q 31 ${skirtY+43} 15 ${skirtY+36} Q -3 ${skirtY+48} -19 ${skirtY+36} Q -37 ${skirtY+39} -49 ${skirtY+29} Z`,id?'#d8b795':'#e1eee8',outline,1);
    for(let i=-2;i<=2;i++)line(i*11,p.hip+3,i*18,skirtY+26,id?'#9d7b6544':'#76a5b455',1.2);
    if(!id){
      path(`M ${sx-11} ${sy+20} L ${sx+13} ${sy+20} L 16 ${p.hip-4} Q 24 ${p.hip+12} 30 ${skirtY+25} Q 1 ${skirtY+34} -31 ${skirtY+24} Q -28 ${p.hip+8} -15 ${p.hip-4} Z`,'#e4f2eb','#173f59',1.6);
      path(`M ${sx-10} ${sy+22} L ${sx+1} ${sy+31} L ${sx+13} ${sy+22} L ${sx+9} ${sy+42} L ${sx-7} ${sy+42} Z`,'#fffaf0');
      line(sx-15,sy+16,-14,p.hip-3,'#f8f6e9',5);line(sx+16,sy+16,16,p.hip-3,'#f8f6e9',5);
      path(`M -21 ${p.hip-6} L 23 ${p.hip-6} L 22 ${p.hip+1} L -22 ${p.hip+1} Z`,'#b6d8d7',outline,1);
    }else{
      path(`M ${sx-12} ${sy+17} L ${sx+15} ${sy+17} L 18 ${p.hip-3} L -17 ${p.hip-3} Z`,'#f1ddc0',outline,1.6);
      path(`M ${sx-6} ${sy+34} L ${sx+14} ${sy+30} L 14 ${p.hip-4} L -9 ${p.hip-4} Z`,'#4a4247');
      for(let i=0;i<3;i++)line(sx+2-i,sy+44+i*10,sx+12-i,sy+48+i*10,'#dfa87b',1.1);
      path(`M -22 ${p.hip-8} L 24 ${p.hip-8} L 24 ${p.hip+1} L -22 ${p.hip+1} Z`,'#b17c58',outline,1);
      ctx.strokeStyle='#efc99e';ctx.lineWidth=2;ctx.strokeRect(-3,p.hip-8,10,9);
    }
    // Neck and collar.
    path(`M ${hx-7} ${hy+19} L ${hx-6} ${sy+5} L ${hx+8} ${sy+5} L ${hx+9} ${hy+17} Z`,'#ecc1a8',outline,1.2);
    path(`M ${sx-16} ${sy-4} L ${sx} ${sy+8} L ${sx-3} ${sy+22} L ${sx-21} ${sy+7} Z`,'#faf2dc',outline,1);
    path(`M ${sx+13} ${sy-4} L ${sx} ${sy+8} L ${sx+8} ${sy+21} L ${sx+25} ${sy+7} Z`,'#f4ecd7',outline,1);
    if(!id){
      path(`M ${sx} ${sy+11} Q ${sx-25} ${sy-4} ${sx-22} ${sy+16} Q ${sx-12} ${sy+21} ${sx} ${sy+11} Q ${sx+23} ${sy-3} ${sx+21} ${sy+17} Q ${sx+10} ${sy+22} ${sx} ${sy+11}`,'#2d6987',outline,1.4);
      ellipse(sx,sy+12,4,5,'#77e3e8');
    }else{ellipse(sx+1,sy+10,6,7,'#e8a36e');line(sx+1,sy+4,sx+1,sy+16,'#ffdf9e',1);}
    // Face: clean linework, shaded jaw, oversized luminous anime eyes.
    path(`M ${hx-25} ${hy-17} Q ${hx} ${hy-39} ${hx+26} ${hy-17} L ${hx+26} ${hy+6} Q ${hx+23} ${hy+22} ${hx+5} ${hy+30} Q ${hx-15} ${hy+23} ${hx-24} ${hy+9} Z`,'#f8ddc4',outline,1.7);
    path(`M ${hx-24} ${hy-10} Q ${hx-16} ${hy+18} ${hx+5} ${hy+29} Q ${hx-16} ${hy+23} ${hx-24} ${hy+9} Z`,'#eab99e');
    // Eye whites and slanted lashes.
    for(const [ex,ey,w] of [[hx-10,hy+4,8],[hx+15,hy+3,7.2]]){
      path(`M ${ex-w} ${ey-4} Q ${ex} ${ey-8} ${ex+w} ${ey-3} Q ${ex+w} ${ey+8} ${ex-1} ${ey+9} Q ${ex-w} ${ey+7} ${ex-w} ${ey-4} Z`,'#fff9e9');
      ellipse(ex+2,ey+2,4.8,7,id?'#ad603c':'#257996');ellipse(ex+3,ey+2,2.2,5.3,'#123646');ellipse(ex+3,ey-1,1.8,2.4,'#fffef0');ellipse(ex+1,ey+6,2.4,1.3,id?'#ffcb74':'#86f7f1');
      path(`M ${ex-w-2} ${ey-5} Q ${ex} ${ey-9} ${ex+w+1} ${ey-3}`,null,'#253342',2.1);
      line(ex-w,ey-4,ex-w-4,ey-7,'#253342',1.5);
    }
    line(hx+8,hy+11,hx+11,hy+14,'#c58f7b',.8);
    path(`M ${hx+4} ${hy+20} q 5 ${f.stun?4:1} 9 -1`,null,'#ae776d',1);
    ellipse(hx-15,hy+15,6,2.2,'#e8a89a66');ellipse(hx+19,hy+14,5,2,'#e8a89a55');
    // Hair cap and swept bangs.
    path(`M ${hx-28} ${hy+3} Q ${hx-39} ${hy-38} ${hx-8} ${hy-43} Q ${hx+25} ${hy-51} ${hx+32} ${hy-17} L ${hx+34} ${hy+15} Q ${hx+23} ${hy+7} ${hx+22} ${hy-13} L ${hx+14} ${hy-2} L ${hx+8} ${hy-21} L ${hx-3} ${hy-4} L ${hx-7} ${hy-23} Q ${hx-17} ${hy-12} ${hx-23} ${hy+16} Z`,gradient(hx-25,hy-40,hx+32,hy+20,[[0,id?'#f4bd7f':'#365e91'],[1,id?'#ce7953':'#235076']]),outline,2);
    path(`M ${hx-22} ${hy-23} Q ${hx-9} ${hy-39} ${hx+9} ${hy-33}`,null,id?'#ffdda3':'#88c3e4',2.4);
    path(`M ${hx-21} ${hy+3} Q ${hx-30} ${hy+42} ${hx-14+sway*.2} ${hy+61} L ${hx-28+sway*.3} ${hy+53} Q ${hx-35} ${hy+31} ${hx-28} ${hy-7} Z`,hairG,outline,1.5);
    if(!id){
      // Whale fin ears, maid frill and a small ahoge.
      path(`M ${hx-25} ${hy-18} Q ${hx-50} ${hy-21} ${hx-52} ${hy-40} Q ${hx-34} ${hy-39} ${hx-20} ${hy-26} Z`,'#5bb9d0',outline,1.7);
      path(`M ${hx+24} ${hy-21} Q ${hx+45} ${hy-34} ${hx+44} ${hy-47} Q ${hx+29} ${hy-39} ${hx+19} ${hy-30} Z`,'#54b1ca',outline,1.7);
      path(`M ${hx-25} ${hy-32} l -1 -9 9 1 2 -8 9 3 5 -7 7 5 7 -3 4 8 8 0 2 11 Q ${hx} ${hy-43} ${hx-25} ${hy-32} Z`,'#f0f5e8',outline,1.5);
      path(`M ${hx+1} ${hy-43} Q ${hx-3} ${hy-68} ${hx+13} ${hy-58} Q ${hx+24} ${hy-48} ${hx+9} ${hy-46}`,null,'#70c7dc',2.5);
    }else{
      // Claude-inspired sunburst hair ornament.
      ctx.save();ctx.translate(hx-23,hy-23);ctx.rotate(t*.08);ctx.strokeStyle='#ffe1a1';ctx.lineWidth=2;
      for(let i=0;i<8;i++){const a=i*TAU/8;line(Math.cos(a)*3,Math.sin(a)*3,Math.cos(a)*10,Math.sin(a)*10,'#ffe1a1',2);}ellipse(0,0,3,3,'#fcebc7');ctx.restore();
      path(`M ${hx+3} ${hy-43} Q ${hx+16} ${hy-62} ${hx+25} ${hy-48}`,null,'#f3b878',2.5);
    }
    drawArm(f,p,true);
    // Elemental edge on slashes, with a distinct silhouette per fighter.
    if(f.action&&['slash','heavy','rise'].includes(f.action)){
      const m=moves[f.action],active=f.age>m.startup-4&&f.age<m.startup+m.active+6;
      if(active){
        ctx.save();ctx.translate(p.fhx,p.fhy);ctx.rotate(f.action==='rise'?-1.35:f.action==='heavy'?.7:-.45);
        ctx.shadowBlur=14;ctx.shadowColor=colors[id];
        path('M 0 -5 Q 58 -22 110 -7 Q 66 13 4 5 Z',id?'#ffc291':'#99f3f6',id?'#fff1c7':'#ebffff',1);
        path('M 10 -2 L 99 -7 L 22 3 Z','#ffffffbd');ctx.restore();
      }
    }
    if(f.action==='wave'||f.action==='super'){
      const r=f.action==='super'?23:12;
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.shadowBlur=20;ctx.shadowColor=colors[id];ellipse(p.fhx+10,p.fhy,r,r,colors[id]);ellipse(p.fhx+10,p.fhy,r*.4,r*.4,'#fffde2');ctx.restore();
    }
    ctx.restore();
  }

  function drawProjectile(p) {
    const c=colors[p.owner],r=p.size,wobble=Math.sin(p.age*.5)*.1;
    ctx.save();ctx.translate(p.x,p.y);ctx.scale(p.face,1);ctx.globalCompositeOperation='lighter';
    const aura=ctx.createRadialGradient(0,0,0,0,0,r*2.3);aura.addColorStop(0,c+'6b');aura.addColorStop(1,c+'00');ctx.fillStyle=aura;ctx.fillRect(-r*2.3,-r*2.3,r*4.6,r*4.6);
    ctx.shadowColor=c;ctx.shadowBlur=18;
    if(!p.owner){
      // Swimming whale silhouette inside the blue projectile.
      path(`M ${r} 0 Q ${r*.4} ${-r*.9} ${-r*.65} ${-r*.4} L ${-r*1.5} ${-r*.85} L ${-r*1.1} 0 L ${-r*1.5} ${r*.8} L ${-r*.65} ${r*.4} Q ${r*.45} ${r*.85} ${r} 0 Z`,'#79e8f0');
      path(`M ${-r*.45} ${r*.14} Q 0 ${r*.5} ${r*.7} ${r*.09}` ,null,'#f1fff7',3);
      ellipse(r*.46,-r*.14,2.5,2.5,'#fffef0');
      path(`M ${-r*.1} ${r*.2} L ${-r*.25} ${r*.75} L ${r*.3} ${r*.4} Z`,'#d1ffff');
    }else{
      ctx.rotate(p.age*.07);const points=[];
      for(let i=0;i<16;i++){const a=i*TAU/16,rr=i%2?r*.47:r;points.push([Math.cos(a)*rr,Math.sin(a)*rr]);}
      path('M '+points.map(p=>p.join(' ')).join(' L ')+' Z','#f7a572','#ffe5ad',2);
      ellipse(0,0,r*.36,r*.36,'#ffedbe');
    }
    ctx.rotate(wobble);ctx.strokeStyle=c;ctx.lineWidth=p.ultimate?4:2;ctx.beginPath();ctx.ellipse(0,0,r*1.4,r*.8,0,-1.1,1.1);ctx.stroke();
    for(let i=0;i<3;i++){const y=(i-1)*r*.8;line(-r*1.5-i*12,y,-r*3-i*5,y*.8,c+(i===1?'99':'55'),2);}
    ctx.restore();
  }
  function drawFX() {
    ctx.save();ctx.globalCompositeOperation='lighter';
    for(const r of rings){const p=1-r.life/r.max;ctx.globalAlpha=(1-p)*.85;ctx.strokeStyle=r.color;ctx.lineWidth=r.width*(1-p*.6);ctx.beginPath();ctx.ellipse(r.x,r.y,r.size*p,r.size*p*(r.size<70?.4:1),0,0,TAU);ctx.stroke();}
    for(const s of slashes){
      const p=1-s.life/s.max;ctx.save();ctx.translate(s.x,s.y);ctx.scale(s.face,1);ctx.rotate(s.angle);ctx.globalAlpha=(1-p)*.8;
      const r=s.size*(.7+p*.35);
      path(`M ${-r*.7} ${-r*.65} Q ${r*1.1} ${-r*.8} ${r*.75} ${r*.6} Q ${r*.67} ${-r*.3} ${-r*.7} ${-r*.65} Z`,s.color);
      path(`M ${-r*.6} ${-r*.65} Q ${r*1.1} ${-r*.7} ${r*.75} ${r*.6}`,null,'#fffbed',2);ctx.restore();
    }
    for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);if(p.size<4){line(p.x,p.y,p.x-p.vx*2.5,p.y-p.vy*2.5,p.color,p.size*.6);}else ellipse(p.x,p.y,p.size,p.size*.6,p.color);}
    ctx.restore();
    for(const p of textFx){ctx.save();ctx.globalAlpha=Math.min(1,p.life/15);ctx.fillStyle=p.color;ctx.textAlign='center';ctx.font='600 19px "Arial Narrow", "Microsoft YaHei", sans-serif';ctx.shadowColor='#081c2c';ctx.shadowBlur=8;ctx.fillText(p.text,p.x,p.y-(p.max-p.life)*.55);ctx.restore();}
  }
  function render() {
    ctx.save();
    if(shake>.2&&!reduceMotion)ctx.translate(rand(-shake,shake)*.5,rand(-shake,shake)*.3);
    drawBackground(globalTime/60);
    if(superScene>0){ctx.fillStyle='#091626bb';ctx.fillRect(0,0,W,H);for(let i=0;i<18;i++){const y=(i*67+globalTime*15)%H;line(0,y,W,y-90,i%2?'#71dbe816':'#f4b47f16',2);}}
    ctx.save();
    const mobile=window.innerWidth<=600;
    const focus=mobile?(fighters[0].x+fighters[1].x)/2:W/2;
    const zoom=mobile?Math.min(1,900/(Math.abs(fighters[0].x-fighters[1].x)+300)):1;
    cameraX=lerp(cameraX,focus,.12);cameraZoom=lerp(cameraZoom,zoom,.1);
    ctx.translate(W/2-cameraX*cameraZoom,FLOOR*(1-cameraZoom));ctx.scale(cameraZoom,cameraZoom);
    fighters.forEach(f=>{
      const a=1-clamp(f.y/400,0,.75);const g=ctx.createRadialGradient(f.x,FLOOR+4,0,f.x,FLOOR+4,80);g.addColorStop(0,'#061726a6');g.addColorStop(1,'#06172600');ctx.save();ctx.translate(f.x,FLOOR+4);ctx.scale(1,.16);ctx.globalAlpha=a;ellipse(0,0,85,85,g);ctx.restore();
      if(f.meter>=50){ctx.save();ctx.globalAlpha=.16;ellipse(f.x,FLOOR+2,50+Math.sin(globalTime*.08)*4,7,colors[f.id]);ctx.restore();}
    });
    ghosts.forEach(g=>{const f={...fighters[g.id],x:g.x,y:g.y,face:g.face,pose:g.pose,blink:0};drawCharacter(f,g.life/50,true);});
    // The more airborne fighter appears behind a grounded opponent.
    [...fighters].sort((a,b)=>b.y-a.y).forEach(f=>drawCharacter(f));
    projectiles.forEach(drawProjectile);drawFX();
    ctx.restore();
    if(flash>0&&!reduceMotion){ctx.fillStyle='#fff3c9'+Math.floor(flash*6).toString(16).padStart(2,'0');ctx.fillRect(0,0,W,H);}
    ctx.restore();
  }

  function clearInput() {keys.clear();pressed.clear();gamepadDown=[new Set(),new Set()];gamepadEdges=[new Set(),new Set()];bufferedTaps=[new Set(),new Set()];inputBuffer=[[],[]];document.querySelectorAll('.pressed').forEach(b=>b.classList.remove('pressed'));}
  function showHelp() {wasHelpPlaying=phase==='playing';if(wasHelpPlaying)pauseGame();$('helpDialog').showModal();}
  function closeHelp() {$('helpDialog').close();}
  $('helpDialog').addEventListener('close',()=>{if(wasHelpPlaying&&phase==='paused')resumeGame();wasHelpPlaying=false;});
  $('helpButton').addEventListener('click',showHelp);$('deckHelp').addEventListener('click',showHelp);$('closeHelp').addEventListener('click',closeHelp);
  $('helpDialog').addEventListener('click',e=>{if(e.target===$('helpDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeHelp();}});
  $('startButton').addEventListener('click',startMatch);$('pauseButton').addEventListener('click',pauseGame);$('resumeButton').addEventListener('click',resumeGame);
  $('restartButton').addEventListener('click',startMatch);$('menuButton').addEventListener('click',menu);
  $('mode').addEventListener('change',()=>{$('difficultyLabel').style.visibility=$('mode').value==='cpu'?'visible':'hidden';});
  $('soundButton').addEventListener('click',()=>{initAudio();muted=!muted;$('soundButton').textContent=muted?'声音 OFF':'声音 ON';$('soundButton').setAttribute('aria-label',muted?'开启声音':'关闭声音');sfx('ui');});
  $('fullscreenButton').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(_){floating(W/2,250,'此浏览器不支持全屏','#f4c6a0');}});
  const allCodes=new Set([...Object.values(maps[0]),...Object.values(maps[1]),'ShiftRight']);
  window.addEventListener('keydown',e=>{
    if(e.target.matches('select,input,textarea'))return;
    if($('helpDialog').open)return;
    if(e.code==='Escape'){e.preventDefault();if(phase==='playing')pauseGame();else if(phase==='paused')resumeGame();return;}
    if(e.code==='Slash'&&e.shiftKey){e.preventDefault();showHelp();return;}
    if(e.code==='Enter'&&!e.repeat){if(phase==='menu')startMatch();else if(phase==='paused'||phase==='result')resumeGame();return;}
    if(e.code==='KeyR'&&mode==='training'&&phase==='playing'){resetRound(true);return;}
    const code=e.code==='ShiftRight'?'ShiftLeft':e.code;
    if(allCodes.has(e.code)){e.preventDefault();if(!keys.has(code)&&!e.repeat)pressed.add(code);keys.add(code);}
  });
  window.addEventListener('keyup',e=>keys.delete(e.code==='ShiftRight'?'ShiftLeft':e.code));
  window.addEventListener('blur',()=>{clearInput();if(phase==='playing')pauseGame();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pauseGame();}});
  document.querySelectorAll('[data-code]').forEach(button=>{
    button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);const c=button.dataset.code;if(!keys.has(c))pressed.add(c);keys.add(c);button.classList.add('pressed');initAudio();});
    const release=()=>{keys.delete(button.dataset.code);button.classList.remove('pressed');};
    button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
    button.addEventListener('contextmenu',e=>e.preventDefault());
  });

  fighters=[fighter(0),fighter(1)];updateHUD();
  let previous=performance.now(),accumulator=0;
  function loop(now) {
    const elapsed=Math.min(.1,(now-previous)/1000);previous=now;accumulator+=elapsed;
    while(accumulator>=1/60){update();accumulator-=1/60;}
    render();frameCount++;fpsClock+=elapsed;
    if(fpsClock>=1){$('fps').textContent=Math.round(frameCount/fpsClock)+' FPS';fpsClock=0;frameCount=0;}
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  // Read-only diagnostic snapshot for local QA and performance inspection.
  window.NeuralClash=Object.freeze({snapshot:()=>({phase,mode,round,time,tick:globalTime,intro,roundDelay,particles:particles.length,projectiles:projectiles.length,fighters:fighters.map(({id,x,y,hp,meter,burst,wins,action,age,stun,combo,invul})=>({id,x,y,hp,meter,burst,wins,action,age,stun,combo,invul}))})});
})();
