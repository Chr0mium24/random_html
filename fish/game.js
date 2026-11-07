/* TIDEBORN · 鲸蓝之誓 — original fan game. Three.js is vendored under MIT. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  function fail(error) {
    $('loading').hidden = true; $('error').hidden = false;
    $('error-text').textContent = '无法初始化 3D 场景。请开启浏览器硬件加速后重试。' + (error ? '（' + error.message + '）' : '');
    console.error(error);
  }
  if (!window.THREE) { fail(new Error('本地 Three.js 未加载')); return; }
  const T = THREE, TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const face = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  let seed = 2704;
  function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  function mat(color, metalness = .1, roughness = .7, emissive = 0, intensity = 0) {
    return new T.MeshStandardMaterial({color, metalness, roughness, emissive, emissiveIntensity:intensity});
  }
  function mesh(geo, material, parent, x = 0, y = 0, z = 0) {
    const m = new T.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
  }
  function box(parent, material, x, y, z, w, h, d) { return mesh(new T.BoxGeometry(w,h,d),material,parent,x,y,z); }
  function sphere(parent, material, x, y, z, sx, sy = sx, sz = sx) {
    const m = mesh(new T.SphereGeometry(1,16,12),material,parent,x,y,z); m.scale.set(sx,sy,sz); return m;
  }
  function cylinder(parent, material, x, y, z, top, bottom, height, sides = 16) {
    return mesh(new T.CylinderGeometry(top,bottom,height,sides),material,parent,x,y,z);
  }
  function ring(parent, radius, width, color, opacity = 1) {
    const m = mesh(new T.RingGeometry(radius-width/2,radius+width/2,128),new T.MeshBasicMaterial({color,transparent:opacity<1,opacity,side:T.DoubleSide,depthWrite:false}),parent);
    m.rotation.x = -Math.PI/2; m.castShadow = false; return m;
  }
  function tube(parent, points, radius, material) {
    return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),24,radius,8,false),material,parent);
  }

  let renderer;
  try {
    renderer = new T.WebGLRenderer({canvas:$('scene'),antialias:true,alpha:false,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.7)); renderer.setSize(innerWidth,innerHeight);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  } catch(e) { fail(e); return; }
  const scene = new T.Scene(); scene.background = new T.Color(0x061824); scene.fog = new T.FogExp2(0x082332,.023);
  const camera = new T.PerspectiveCamera(48,innerWidth/innerHeight,.1,180);
  scene.add(new T.HemisphereLight(0xa3d8ee,0x15353e,2.1));
  const moonLight = new T.DirectionalLight(0xb9e3ef,3.1); moonLight.position.set(-9,19,-10); moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048,2048); Object.assign(moonLight.shadow.camera,{left:-24,right:24,top:24,bottom:-24,near:1,far:65}); moonLight.shadow.bias = -.001; scene.add(moonLight);
  const fill = new T.DirectionalLight(0x339dc5,1.8); fill.position.set(7,6,10); scene.add(fill);
  const warmLight = new T.PointLight(0xf1b984,22,17,2); warmLight.position.set(0,4,-8); scene.add(warmLight);
  const groundMat = mat(0x263e49,.3,.65), stone = mat(0x334c56,.18,.78), darkStone = mat(0x172e3b,.25,.8);
  const trim = mat(0x929b89,.55,.5), glow = mat(0x83e7e4,.4,.3,0x41cfcf,2.4);
  const gold = mat(0x93815b,.7,.4), black = mat(0x102535,.35,.6);
  const arena = new T.Group(); scene.add(arena);
  cylinder(arena,darkStone,0,-.65,0,18,18.7,1.2,128);
  cylinder(arena,groundMat,0,-.08,0,17.65,17.65,.22,128);
  // Individual inlaid stones and concentric bronze rings form the ritual floor.
  const tileBatches=[[],[]],tileTransform=new T.Object3D();
  for (let row=0;row<6;row++) {
    const radius=2.7+row*2.65, segments=12+row*8;
    for(let i=0;i<segments;i++) {
      const a=i/segments*TAU+(row%2)*.1;
      const batch=random()>.48?0:1;
      tileTransform.position.set(Math.sin(a)*radius,.045,Math.cos(a)*radius);
      tileTransform.rotation.set(0,a,0);tileTransform.scale.set(.8+random()*.4,1,1);tileTransform.updateMatrix();
      tileBatches[batch].push(tileTransform.matrix.clone());
    }
  }
  tileBatches.forEach((matrices,i)=>{const tiles=new T.InstancedMesh(new T.BoxGeometry(1.15,.07,1.9),i===0?stone:groundMat,matrices.length);matrices.forEach((matrix,j)=>tiles.setMatrixAt(j,matrix));tiles.receiveShadow=true;arena.add(tiles);});
  [2.1,5.5,10.6,15.8,17.4].forEach((r,i)=>{const m=ring(arena,r,i===4?.15:.045,i===4?0x73b7bf:0x879b94,.75);m.position.y=.1;});
  for(let i=0;i<48;i++) {
    const a=i/48*TAU;
    const marker=box(arena,trim,Math.sin(a)*16.6,.115,Math.cos(a)*16.6,.06,.025,i%4===0?.7:.22); marker.rotation.y=a;
  }
  const center = mesh(new T.CircleGeometry(2.04,64),black,arena,0,.06,0);center.rotation.x=-Math.PI/2;
  for(let i=0;i<8;i++) {const a=i/8*TAU;const r=box(arena,trim,Math.sin(a)*1.3,.08,Math.cos(a)*1.3,.035,.02,1.1);r.rotation.y=a+.5;}
  const water = mesh(new T.PlaneGeometry(250,250),mat(0x0b3448,.75,.21),scene,0,-.88,0); water.rotation.x=-Math.PI/2; water.castShadow=false;
  const waterRings=[];
  for(let i=0;i<12;i++){const m=ring(scene,20+i*4,.045,0x497f89,.22);m.position.y=-.86;waterRings.push(m);}
  // Broken colonnade, pale flames, and a distant drowned cathedral.
  const flames=[];
  for(let i=0;i<16;i++) {
    const a=i/16*TAU, x=Math.sin(a)*18.6,z=Math.cos(a)*18.6,h=3.5+random()*5;
    const g=new T.Group();g.position.set(x,0,z);g.rotation.y=a;arena.add(g);
    box(g,darkStone,0,.1,0,1.7,.45,1.7);box(g,trim,0,.38,0,1.4,.13,1.4);
    cylinder(g,stone,0,h/2+.4,0,.43,.56,h,8);cylinder(g,trim,0,h+.4,0,.7,.55,.3,8);
    for(let j=0;j<5;j++){const q=j/5*TAU;const r=box(g,darkStone,Math.sin(q)*.43,h*.5+.4,Math.cos(q)*.43,.04,h*.85,.08);r.rotation.y=q;}
    if(i%2===0){const f=sphere(g,glow,0,h+.85,0,.16,.5,.16);flames.push(f);}
    if(i%4===1){const broken=box(arena,stone,x*.84,.45,z*.84,.9,.8,2.1);broken.rotation.set(.1,a+.7,.15);}
    if(i%2===0){const arch=new T.Mesh(new T.TorusGeometry(3.65,.22,8,32,Math.PI),stone);arch.position.set(Math.sin(a+.19)*18.2,6.5,Math.cos(a+.19)*18.2);arch.rotation.y=a+.19;arena.add(arch);}
  }
  for(let i=0;i<32;i++) {
    const a=random()*TAU,r=19+random()*30,h=5+random()*20;
    const ruin=box(scene,darkStone,Math.sin(a)*r,h/2-2,Math.cos(a)*r,1+random()*2,h,1+random()*2);ruin.rotation.y=a;
  }
  const moon = sphere(scene,new T.MeshBasicMaterial({color:0x91c2c9}),-11,20,-48,8,8,.8);moon.castShadow=false;
  const halo=mesh(new T.RingGeometry(8.4,8.46,100),new T.MeshBasicMaterial({color:0x8ab9c6,transparent:true,opacity:.4,side:T.DoubleSide}),scene,-11,20,-47.8);
  halo.rotation.z=.4;
  const particlesCount=400,particlePositions=new Float32Array(particlesCount*3),particleSpeeds=[];
  for(let i=0;i<particlesCount;i++){particlePositions[i*3]=(random()-.5)*70;particlePositions[i*3+1]=random()*20;particlePositions[i*3+2]=(random()-.5)*70;particleSpeeds.push(.06+random()*.16);}
  const particleGeo=new T.BufferGeometry();particleGeo.setAttribute('position',new T.BufferAttribute(particlePositions,3));
  const particles=new T.Points(particleGeo,new T.PointsMaterial({color:0x9fe9e4,size:.055,transparent:true,opacity:.65,depthWrite:false}));scene.add(particles);

  function buildMaid() {
    const root=new T.Group(), body=new T.Group();root.add(body);scene.add(root);
    const skin=mat(0xf4dacc,.05,.7),hair=mat(0x2268b5,.3,.4),hairLight=mat(0x509ede,.25,.42);
    const dress=mat(0x101e35,.25,.7),white=mat(0xd9e8e2,.1,.6),ribbon=mat(0x2876b6,.35,.45);
    const torso=cylinder(body,dress,0,1.15,0,.23,.3,.55);
    sphere(body,white,0,1.19,.21,.18,.25,.06);
    const skirt=cylinder(body,dress,0,.83,0,.25,.49,.48,20);
    cylinder(body,white,0,.602,0,.5,.51,.065,24);
    const apron=mesh(new T.CylinderGeometry(.28,.48,.4,18,1,true,-.85,1.7),white,body,0,.86,0);
    box(body,ribbon,0,1.02,.265,.3,.075,.04);
    for(const side of [-1,1]){const bow=sphere(body,white,side*.13,1.04,-.27,.16,.08,.05);bow.rotation.z=side*.35;}
    const head=new T.Group();head.position.y=1.73;body.add(head);
    sphere(head,skin,0,0,0,.265,.29,.255);
    sphere(head,hair,0,.08,-.035,.29,.28,.265);
    sphere(head,skin,0,-.035,.15,.225,.22,.145);
    for(let i=0;i<7;i++) {const b=sphere(head,i%2?hairLight:hair,(i-3)*.075,.13,.205,.075,.16,.07);b.rotation.z=(i-3)*.13;}
    for(const side of [-1,1]) {
      sphere(head,hair,side*.256,-.07,-.02,.075,.25,.16);
      sphere(head,white,side*.103,-.025,.278,.065,.052,.02);
      sphere(head,mat(0x2472ac,.2,.3,0x174777,.4),side*.103,-.027,.295,.027,.043,.012);
      sphere(head,white,side*.095,-.01,.308,.009,.014,.007);
      sphere(head,mat(0xe4a7ac),side*.172,-.1,.269,.045,.018,.009);
    }
    box(head,mat(0xbb8383),0,-.14,.286,.045,.012,.008);
    // The whale crest, maid frills and paired blue locks establish the character silhouette.
    const frill=mesh(new T.TorusGeometry(.255,.036,6,20,Math.PI),white,head,0,.17,.02);frill.rotation.z=0;
    for(let i=0;i<7;i++){const a=i/6*Math.PI;sphere(head,white,Math.cos(a)*.255,.17+Math.sin(a)*.255,.02,.053,.055,.04);}
    const whale=sphere(head,hairLight,.12,.34,.02,.13,.055,.065);
    const fin=sphere(head,hairLight,.245,.365,.01,.06,.025,.035);fin.rotation.z=.5;
    const hairTails=[];
    for(const side of [-1,1]) {
      const lock=new T.Group();lock.position.set(side*.23,1.76,-.12);body.add(lock);
      tube(lock,[[0,0,0],[side*.13,-.28,-.02],[side*.12,-.65,.03],[side*.22,-.94,.09]],.09,hair);
      tube(lock,[[side*.01,-.05,.07],[side*.12,-.3,.07],[side*.12,-.64,.1]],.018,hairLight);
      sphere(lock,white,side*.055,-.12,.02,.1,.04,.1);hairTails.push(lock);
    }
    const legs=[],arms=[];
    for(const side of [-1,1]){
      const leg=new T.Group();leg.position.set(side*.16,.65,0);body.add(leg);
      cylinder(leg,white,0,-.23,0,.075,.06,.47,10);box(leg,dress,0,-.51,.065,.15,.18,.28);legs.push(leg);
      const arm=new T.Group();arm.position.set(side*.29,1.37,0);body.add(arm);
      sphere(arm,white,0,-.03,0,.115,.12,.12);cylinder(arm,dress,0,-.2,0,.06,.05,.28,10);
      cylinder(arm,white,0,-.37,0,.07,.08,.09,10);sphere(arm,skin,0,-.45,0,.064,.085,.06);arm.rotation.z=side*.12;arms.push(arm);
    }
    const sword=new T.Group();sword.position.set(0,-.43,.06);sword.rotation.x=-.5;arms[1].add(sword);
    box(sword,gold,0,0,.04,.29,.06,.065);box(sword,black,0,-.12,.04,.06,.22,.06);
    const blade=box(sword,mat(0xb7edf1,.7,.2,0x358ba5,.8),0,.55,.04,.09,1.04,.04);
    mesh(new T.ConeGeometry(.055,.2,4),glow,sword,0,1.17,.04);
    const tail=new T.Group();tail.position.set(0,.9,-.26);body.add(tail);
    tube(tail,[[0,0,0],[0,-.12,-.38],[0,.04,-.72],[0,.28,-.88]],.09,hair);
    for(const side of [-1,1]){const fluke=sphere(tail,hairLight,side*.17,.29,-.9,.24,.065,.13);fluke.rotation.z=side*.3;}
    const light=new T.PointLight(0x5aceff,2.6,3);light.position.set(0,1.4,.5);root.add(light);
    return {root,body,head,legs,arms,hairTails,tail,sword,blade,apron,torso,skirt};
  }
  function buildBoss() {
    const root=new T.Group(),body=new T.Group();root.add(body);scene.add(root);
    const armor=mat(0x384c56,.8,.42),edge=mat(0x9a9d87,.7,.42),cloak=mat(0x183e48,.15,.9),pale=mat(0xc8bfa5,.5,.6);
    cylinder(body,armor,0,2.08,0,.56,.41,1.12,8);sphere(body,edge,0,2.3,.35,.42,.36,.16);
    for(let i=0;i<3;i++)box(body,gold,0,1.85+i*.19,.44,.48-i*.08,.035,.04);
    cylinder(body,cloak,0,1.22,-.08,.4,.78,.92,10);
    for(let i=0;i<9;i++){const a=i/9*TAU;const m=box(body,armor,Math.sin(a)*.47,1.25,Math.cos(a)*.47,.25,.65,.1);m.rotation.y=a;m.rotation.x=-.16;}
    const head=new T.Group();head.position.set(0,2.95,0);body.add(head);
    sphere(head,armor,0,0,0,.34,.43,.3);box(head,pale,0,-.1,.265,.3,.39,.09);
    box(head,glow,0,.025,.31,.38,.045,.028);box(head,gold,0,.08,.34,.045,.33,.04);
    for(let i=0;i<5;i++){const a=(i-2)*.6;const h=.32+(2-Math.abs(i-2))*.16;const horn=mesh(new T.ConeGeometry(.1,h,5),edge,head,Math.sin(a)*.33,.35+h/2,Math.cos(a)*.18);horn.rotation.z=-a*.2;}
    for(const side of [-1,1])tube(head,[[side*.28,.15,-.05],[side*.6,.5,-.08],[side*.63,.94,-.2],[side*.48,1.12,-.25]],.09,edge);
    const legs=[],arms=[];
    for(const side of [-1,1]){
      const leg=new T.Group();leg.position.set(side*.29,1.15,0);body.add(leg);
      cylinder(leg,armor,0,-.4,0,.18,.13,.85,8);sphere(leg,edge,0,-.35,.13,.2,.21,.12);
      box(leg,armor,0,-.91,.1,.35,.32,.55);legs.push(leg);
      const arm=new T.Group();arm.position.set(side*.61,2.45,0);body.add(arm);
      sphere(arm,edge,0,0,0,.34,.25,.36);cylinder(arm,armor,0,-.43,0,.16,.13,.75,8);
      sphere(arm,edge,0,-.76,0,.16,.19,.17);arm.rotation.z=side*.17;arms.push(arm);
      for(let j=0;j<3;j++){const spike=mesh(new T.ConeGeometry(.07,.35,5),gold,arm,side*(.08+j*.09),.23,0);spike.rotation.z=-side*.3;}
    }
    const weapon=new T.Group();weapon.position.set(0,-.7,.12);arms[1].add(weapon);weapon.rotation.x=-.2;
    cylinder(weapon,gold,0,.6,0,.055,.055,3.8,10);
    box(weapon,edge,0,2.15,0,.8,.15,.15);
    for(const side of [-1,0,1]){const p=box(weapon,edge,side*.33,2.5,0,.1,.75+(side===0?.4:0),.09);mesh(new T.ConeGeometry(.085,.32,4),glow,weapon,side*.33,2.96+(side===0?.2:0),0);}
    const weaponGlow=new T.MeshBasicMaterial({color:0xffb96a,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false});
    for(const side of [-1,0,1])sphere(weapon,weaponGlow,side*.33,2.94+(side===0?.2:0),0,.14,.34,.14);
    const weaponLight=new T.PointLight(0xffb96a,0,5);weaponLight.position.set(0,2.5,0);weapon.add(weaponLight);
    const cape=mesh(new T.ConeGeometry(.75,2.15,8,1,true,Math.PI*.2,Math.PI*.6),cloak,body,0,1.65,-.14);cape.rotation.x=.14;
    const eyeLight=new T.PointLight(0x7de8de,4,5);eyeLight.position.set(0,2.9,.5);root.add(eyeLight);
    return {root,body,head,arms,legs,weapon,weaponGlow,weaponLight,eyeLight,cape,armor,edge};
  }
  const maid=buildMaid(), guardian=buildBoss();
  const targetRing=ring(scene,.8,.035,0xd9d4a0,.7);targetRing.position.y=.14;
  const targetDiamond=mesh(new T.OctahedronGeometry(.09),new T.MeshBasicMaterial({color:0xf3ecc7}),scene);targetDiamond.castShadow=false;
  const guardRing=ring(scene,.9,.09,0x79dced,.7);guardRing.visible=false;
  const telegraphMat=new T.MeshBasicMaterial({color:0xe8a27c,transparent:true,opacity:.18,side:T.DoubleSide,depthWrite:false});
  const telegraph=mesh(new T.CircleGeometry(1,64),telegraphMat,scene);telegraph.rotation.x=-Math.PI/2;telegraph.position.y=.13;telegraph.visible=false;telegraph.castShadow=false;
  const telegraphEdge=ring(scene,1,.025,0xf0b48d,.8);telegraphEdge.visible=false;
  const dashLine=box(scene,new T.MeshBasicMaterial({color:0xe5a581,transparent:true,opacity:.22,depthWrite:false}),0,.14,0,1.8,.02,12);dashLine.visible=false;
  const slash=new T.Mesh(new T.TorusGeometry(1.05,.035,5,32,Math.PI*1.3),new T.MeshBasicMaterial({color:0x9de7ff,transparent:true,opacity:.8,depthWrite:false}));scene.add(slash);slash.visible=false;
  const slashGlow=new T.Mesh(new T.TorusGeometry(1.05,.1,5,32,Math.PI*1.3),new T.MeshBasicMaterial({color:0x64d4ff,transparent:true,opacity:.19,blending:T.AdditiveBlending,depthWrite:false}));slash.add(slashGlow);
  const bossSlash=new T.Mesh(new T.TorusGeometry(2.9,.07,5,40,Math.PI*1.4),new T.MeshBasicMaterial({color:0xffcf9d,transparent:true,opacity:.85,depthWrite:false}));scene.add(bossSlash);bossSlash.visible=false;
  const effects=[],waves=[];
  const impact={life:0,duration:.2,strength:0,kick:0,bossFlash:0,flashDuration:.16,recoil:0,recoilX:0,recoilZ:0};
  const impactFlashColor=new T.Color(0xc2eeff);
  const cameraBase=new T.Vector3(),cameraRight=new T.Vector3(),cameraBack=new T.Vector3();
  const impactRingGeometry=new T.RingGeometry(.2,.235,40),impactRayGeometry=new T.PlaneGeometry(1,.045);
  function burst(pos,color,count=14,power=2) {
    // Shared geometry, each short-lived shard owns only its material.
    for(let i=0;i<count;i++) {
      const m=new T.Mesh(shardGeometry,new T.MeshBasicMaterial({color,transparent:true,opacity:1}));m.position.copy(pos);m.position.y+=.9;
      const v=new T.Vector3((random()-.5)*power,random()*power+1,(random()-.5)*power);scene.add(m);effects.push({m,v,life:.4+random()*.35,max:.8});
    }
  }
  const shardGeometry=new T.OctahedronGeometry(.045);
  function contactEffects(pos,normal,heavy,parried) {
    const color=parried?0x9cefff:0xffdb9b,count=parried?30:heavy?24:14,power=heavy||parried?5.2:3.3;
    for(let i=0;i<count;i++){
      const m=new T.Mesh(shardGeometry,new T.MeshBasicMaterial({color:i%3?color:0xffffff,transparent:true,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false}));
      m.position.copy(pos);m.scale.set(.6,1.5+random()*2,.6);
      const v=new T.Vector3((random()-.5)*power+normal.x*2,(random()-.3)*power+1,(random()-.5)*power+normal.z*2);
      m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.clone().normalize());
      const life=.2+random()*.22;scene.add(m);effects.push({m,v,life,max:life,gravity:3,drag:2});
    }
    for(let i=0;i<3;i++){
      const m=new T.Mesh(i===0?impactRingGeometry:impactRayGeometry,new T.MeshBasicMaterial({color:i===0?color:0xe9fbff,transparent:true,blending:T.AdditiveBlending,side:T.DoubleSide,depthWrite:false,toneMapped:false}));
      m.position.copy(pos);const life=i===0?.24:.13,size=parried?2:heavy?1.6:1;
      scene.add(m);effects.push({m,life,max:life,kind:'flash',size,spin:i===0?0:i===1?.6:-.85});
    }
  }
  function hitFeedback(kind) {
    const heavy=kind==='heavy'||kind==='finisher',parried=kind==='parry',hurt=kind==='hurt';
    const duration=parried?.3:heavy?.24:hurt?.22:.17;
    Object.assign(impact,{life:duration,duration,strength:parried?.34:heavy?.25:hurt?.26:.12,kick:parried?.35:heavy?.24:hurt?-.14:.1});
    hitStop=Math.max(hitStop,parried?.14:kind==='heavy'?.105:kind==='finisher'?.075:hurt?.065:.05);
    const normal=new T.Vector3(player.x-boss.x,0,player.z-boss.z).normalize();
    const pos=hurt?new T.Vector3(player.x,1.15,player.z):parried?new T.Vector3(player.x-normal.x*.6,1.35,player.z-normal.z*.6):new T.Vector3(boss.x+normal.x*.52,1.65,boss.z+normal.z*.52);
    contactEffects(pos,normal,heavy,parried);
    if(!hurt){
      impact.flashDuration=parried?.22:heavy?.18:.13;impact.bossFlash=impact.flashDuration;
      impact.recoil=parried?.23:heavy?.15:.065;impact.recoilX=-normal.x;impact.recoilZ=-normal.z;
    }
    impactSound(kind);
    updateHUD();
  }
  function updateFeedback(dt) {
    impact.life=Math.max(0,impact.life-dt);impact.bossFlash=Math.max(0,impact.bossFlash-dt);
    for(let i=effects.length-1;i>=0;i--){
      const e=effects[i];e.life-=dt;
      if(e.kind==='flash'){
        const p=clamp(1-e.life/e.max,0,1);e.m.quaternion.copy(camera.quaternion);e.m.rotateZ(e.spin);
        e.m.scale.setScalar(e.size*(e.spin===0?.7+p*3:1+p*.6));e.m.material.opacity=Math.pow(1-p,2);
      }else{
        e.v.y-=dt*(e.gravity??5);if(e.drag)e.v.multiplyScalar(Math.exp(-e.drag*dt));
        e.m.position.addScaledVector(e.v,dt);e.m.rotation.x+=dt*4;e.m.material.opacity=Math.max(0,e.life/e.max);
      }
      if(e.life<=0){scene.remove(e.m);e.m.material.dispose();effects.splice(i,1);}
    }
  }
  function makeWave(pos,phase) {
    // A fixed-radius impact flash; all damage is resolved once by updateBoss.
    const m=ring(scene,attackDefs.slam.range,.12,phase===2?0xffb486:0x9de9e8,.9);m.position.set(pos.x,.17,pos.z);
    waves.push({m,life:.2,maxLife:.2});
    burst(pos,0xaad7cd,30,7);tone(65,.5,'sawtooth',.16);
  }
  function clearEffects() {for(const e of effects){scene.remove(e.m);e.m.material.dispose();}effects.length=0;for(const w of waves){scene.remove(w.m);w.m.geometry.dispose();w.m.material.dispose();}waves.length=0;}

  let mode='title',previousMode='title',helpPaused=false,clock=0,bossClock=0,elapsed=0,shake=0,hitStop=0,announceTimer=0,hintTimer=0;
  let deaths=0,best=null,attempt=0;
  try{deaths=Number(localStorage.getItem('tideborn.deaths'))||0;best=Number(localStorage.getItem('tideborn.best'))||null;}catch{}
  const player={x:0,z:7,yaw:Math.PI,hp:100,stamina:100,state:'idle',t:0,duration:0,regen:0,inv:0,flasks:3,combo:0,comboAt:0,hit:false,buffer:null,dx:0,dz:-1,hurt:0,damageDealt:0,parries:0,rolls:0};
  const boss={x:0,z:-4,yaw:0,hp:1200,maxHp:1200,state:'idle',t:0,duration:1.7,phase:1,attack:'sweep',hit:false,combo:0,stagger:0,staggerDelay:0,aimX:0,aimZ:1,pattern:0,phasePending:false,warned:false};
  const attackDefs={
    sweep:{wind:1.5,active:.25,recover:1.02,damage:28,range:3.45,arc:2.1,label:'横斩 · 等待蓝色闪光',tell:'横斩蓄力 · 等蓝光弹反'},
    slam:{wind:1.9,active:.25,recover:1.4,damage:39,range:2.7,arc:Math.PI,label:'潮震 · 离开圆圈或瞬间翻滚',tell:'举槊砸地 · 离开圆圈'},
    charge:{wind:1.7,active:.58,recover:1.3,damage:34,range:1.7,arc:Math.PI,label:'突进 · 向侧面闪避',tell:'俯身冲锋 · 向侧面闪避'},
    double:{wind:1.35,followWind:1.05,active:.22,recover:.28,damage:24,range:3.5,arc:2.2,label:'连斩 · 不要急于反击',tell:'二连横斩 · 留意第二击'}
  };
  const playerReach={light:2.73,heavy:3.15};
  const playerDamageMultiplier=1.4;
  const bossActionSpeed=()=>boss.phase===2?2:1;
  const parryCueLead=.18;
  const keys=new Set();let touchX=0,touchY=0,orbitYaw=0,camDistance=7.5,locked=true,dragging=false,lastMouseX=0;
  let muted=false,audio=null,ambient=null,noiseBuffer=null;
  function initAudio(){if(audio)return;try{audio=new (window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=52;g.gain.value=.018;o.connect(g).connect(audio.destination);o.start();ambient=g;noiseBuffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*.4),audio.sampleRate);const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;}catch{}}
  function tone(freq,duration=.1,type='sine',volume=.07,endFreq){if(muted||!audio||audio.state!=='running')return;const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);if(endFreq)o.frequency.exponentialRampToValueAtTime(endFreq,audio.currentTime+duration);g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}
  function noise(duration,frequency,volume,endFrequency=frequency) {
    if(muted||!audio||!noiseBuffer||audio.state!=='running')return;
    const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain(),now=audio.currentTime;
    source.buffer=noiseBuffer;filter.type='bandpass';filter.Q.value=.7;filter.frequency.setValueAtTime(frequency,now);filter.frequency.exponentialRampToValueAtTime(endFrequency,now+duration);
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(volume,now+.003);gain.gain.exponentialRampToValueAtTime(.001,now+duration);
    source.connect(filter).connect(gain).connect(audio.destination);source.start();source.stop(now+duration);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  }
  function impactSound(kind) {
    const heavy=kind==='heavy'||kind==='finisher',parried=kind==='parry',hurt=kind==='hurt';
    tone(hurt?82:heavy?125:180,heavy?.2:.12,'sine',heavy?.17:.11,42);
    noise(parried?.22:heavy?.16:.1,parried?3600:hurt?650:2200,parried?.18:heavy?.17:.1,parried?1800:650);
    if(!hurt){tone(parried?1350:heavy?710:960,parried?.35:.12,'triangle',parried?.075:.035,parried?800:370);}
  }
  function toggleSound(){muted=!muted;$('sound-btn').textContent=muted?'♪̸':'♫';$('sound-btn').setAttribute('aria-label',muted?'开启声音':'关闭声音');if(ambient)ambient.gain.value=muted?0:.018;}
  function hint(text,duration=1.8){$('combat-hint').textContent=text;hintTimer=duration;$('combat-hint').style.opacity=1;}
  function announce(text,duration=2.6){$('announcement').textContent=text;$('announcement').style.opacity=1;announceTimer=duration;}
  function formatTime(t){return String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0');}
  function setPositionModels(){maid.root.position.set(player.x,0,player.z);maid.root.rotation.y=player.yaw;guardian.root.position.set(boss.x,0,boss.z);guardian.root.rotation.y=boss.yaw;}
  function reset(toTitle=false){
    clearEffects();keys.clear();touchX=touchY=0;resetStick();
    Object.assign(player,{x:0,z:7,yaw:Math.PI,hp:100,stamina:100,state:'idle',t:0,duration:0,regen:0,inv:0,flasks:3,combo:0,comboAt:0,hit:false,buffer:null,dx:0,dz:-1,walk:0,hurt:0,damageDealt:0,parries:0,rolls:0});
    Object.assign(boss,{x:0,z:-4,yaw:0,hp:1200,state:'idle',t:0,duration:1.7,phase:1,attack:'sweep',hit:false,combo:0,stagger:0,staggerDelay:0,aimX:0,aimZ:1,pattern:0,phasePending:false,warned:false});
    guardian.eyeLight.color.setHex(0x7de8de);guardian.armor.emissive.setHex(0);guardian.edge.emissive.setHex(0);guardian.body.rotation.set(0,0,0);guardian.body.position.set(0,0,0);maid.body.rotation.set(0,0,0);
    mode=toTitle?'title':'playing';elapsed=0;bossClock=0;shake=0;hitStop=0;locked=true;orbitYaw=0;hintTimer=0;announceTimer=0;
    impact.life=impact.bossFlash=0;camera.fov=48;camera.updateProjectionMatrix();
    $('boss-warning').hidden=true;guardian.weaponGlow.opacity=0;guardian.weaponLight.intensity=0;
    $('announcement').style.opacity=0;$('combat-hint').style.opacity=0;$('landing').hidden=!toTitle;$('hud').hidden=toTitle;
    $('result').hidden=true;$('pause').hidden=true;$('help').hidden=true;document.body.classList.toggle('playing',!toTitle);
    $('touch-controls').hidden=toTitle||!isTouch;telegraph.visible=telegraphEdge.visible=dashLine.visible=slash.visible=bossSlash.visible=false;
    setPositionModels();updateHUD();if(!toTitle){attempt++;initAudio();audio?.resume();announce('沉没的圣所',2.4);hint('观察前摇 · 翻滚躲避 · 留力反击',4);camera.position.set(0,4.3,14.7);}else{camera.position.set(12,5.2,15);}
    cameraBase.copy(camera.position);
  }
  function start(){reset();}
  function togglePause(){if(mode==='playing'){mode='paused';$('pause').hidden=false;keys.clear();touchX=touchY=0;resetStick();}else if(mode==='paused'){mode='playing';$('pause').hidden=true;}}
  function openHelp(){if(!$('help').hidden)return;previousMode=mode;helpPaused=mode==='playing';if(helpPaused)mode='paused';keys.clear();touchX=touchY=0;resetStick();$('help').hidden=false;}
  function closeHelp(){$('help').hidden=true;if(helpPaused)mode=previousMode;helpPaused=false;}
  function end(won){
    if(mode!=='playing')return;mode=won?'victory':'dead';keys.clear();touchX=touchY=0;resetStick();$('touch-controls').hidden=true;
    if(!won){deaths++;try{localStorage.setItem('tideborn.deaths',deaths);}catch{}tone(78,1.3,'sine',.13,35);}
    else {if(!best||elapsed<best){best=elapsed;try{localStorage.setItem('tideborn.best',best);}catch{}}tone(261,.8,'sine',.1);tone(392,1.2,'sine',.06);}
    $('result-eyebrow').textContent=won?'THE OATH ENDURES':'THE TIDE WILL REMEMBER';$('result-title').textContent=won?'深渊已破':'誓约破碎';$('result-title').style.color=won?'#d2d9ba':'#bd7475';
    $('result-copy').textContent=won?'守卫终于记起了自己的誓言。潮水退去，黎明将至。':'深渊带走了你的呼吸，却带不走你的意志。';
    const stats=[['试炼时间',formatTime(elapsed)],['造成伤害',Math.round(player.damageDealt)],['成功弹反',player.parries],['最佳通关',best?formatTime(best):'—']];
    $('result-stats').replaceChildren(...stats.map(([label,value])=>{const d=document.createElement('div'),b=document.createElement('b');b.textContent=value;d.append(b,document.createTextNode(label));return d;}));
    $('retry-btn').firstElementChild.textContent=won?'再次试炼':'重燃誓约';$('result').hidden=false;telegraph.visible=telegraphEdge.visible=dashLine.visible=false;$('boss-warning').hidden=true;
  }
  function spend(value){if(player.stamina<value){hint('体力不足 · 稍作喘息',.8);return false;}player.stamina-=value;player.regen=.85;return true;}
  function movementDirection(){
    let x=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+touchX;
    let z=(keys.has('KeyS')?1:0)-(keys.has('KeyW')?1:0)+touchY;
    const length=Math.hypot(x,z);if(length<.08)return{x:0,z:0,amount:0};x/=Math.max(1,length);z/=Math.max(1,length);
    const yaw=Math.atan2(camera.position.x-player.x,camera.position.z-player.z);
    return{x:x*Math.cos(yaw)+z*Math.sin(yaw),z:-x*Math.sin(yaw)+z*Math.cos(yaw),amount:Math.min(1,length)};
  }
  function act(action){
    if(mode!=='playing')return;initAudio();audio?.resume();
    if(player.state!=='idle'){
      if((action==='light'||action==='heavy'||action==='dodge')&&player.t>player.duration-.2&&player.state!=='hurt')player.buffer=action;
      return;
    }
    if(action==='dodge'){
      if(!spend(26))return;const d=movementDirection();
      player.dx=d.amount?d.x:-Math.sin(player.yaw);player.dz=d.amount?d.z:-Math.cos(player.yaw);
      const l=Math.hypot(player.dx,player.dz);player.dx/=l;player.dz/=l;player.state='dodge';player.duration=.62;player.rolls++;tone(190,.18,'sine',.045,70);
    } else if(action==='light'||action==='heavy'){
      const heavy=action==='heavy';if(!spend(heavy?37:21))return;
      player.combo=!heavy&&clock-player.comboAt<1.05?(player.combo%3)+1:1;player.comboAt=clock;
      player.state=action;player.duration=heavy?.96:.49;player.hit=false;
      if(locked)player.yaw=face(player,boss);tone(heavy?170:280,.16,'triangle',.06,80);
    } else if(action==='heal'){
      if(player.flasks<=0){hint('潮露已耗尽',1);return;}if(player.hp>=100){hint('生命已满',.8);return;}
      player.state='heal';player.duration=1.15;player.flasks--;player.hit=false;hint('饮用潮露…',1.15);tone(440,.7,'sine',.04,880);
    } else if(action==='parry'){
      if(!spend(19))return;player.state='parry';player.duration=.67;if(locked)player.yaw=face(player,boss);tone(650,.12,'triangle',.045,850);
    }else return;
    player.t=0;player.buffer=null;updateHUD();
  }
  function hurtPlayer(damage,source,parryable=false){
    if(player.inv>0||mode!=='playing'||player.hp<=0)return false;
    if(player.state==='dodge'&&player.t>=.065&&player.t<=.47){hint('擦身而过',.6);return false;}
    if(parryable&&player.state==='parry'&&player.t>=.015&&player.t<=.29&&Math.abs(angleDiff(player.yaw,face(player,boss)))<1.4){
      boss.state='stunned';boss.t=0;boss.duration=2.25;boss.stagger=0;player.state='idle';player.t=0;player.stamina=Math.min(100,player.stamina+33);player.parries++;player.inv=.35;
      damageBoss(90,0,true);hint('弹反成功 · 守卫失衡',2);return false;
    }
    player.hp=Math.max(0,player.hp-damage);player.state='hurt';player.t=0;player.duration=.52;player.inv=.75;player.buffer=null;
    player.dx=(player.x-source.x);player.dz=(player.z-source.z);const l=Math.hypot(player.dx,player.dz)||1;player.dx/=l;player.dz/=l;
    player.hurt=.3;hitFeedback('hurt');burst(maid.root.position,0xf1ada1,8,2.5);
    if(player.hp<=0)end(false);return true;
  }
  function damageBoss(amount,poise,parried=false){
    if(boss.hp<=0)return;amount=Math.min(Math.round(amount*playerDamageMultiplier),boss.hp);boss.hp-=amount;player.damageDealt+=amount;boss.stagger+=poise;boss.staggerDelay=3;
    hitFeedback(parried?'parry':poise>=40?'heavy':poise>=24?'finisher':'light');
    if(boss.hp<=0){boss.state='dead';end(true);return;}
    if(boss.stagger>=100&&boss.state!=='transition'){boss.state='stunned';boss.t=0;boss.duration=1.8;boss.stagger=0;hint('守卫失衡 · 乘势追击',1.7);}
    if(boss.hp<=boss.maxHp*.5&&boss.phase===1)boss.phasePending=true;
  }
  function clampArena(actor,radius=16.9){const d=Math.hypot(actor.x,actor.z);if(d>radius){actor.x=actor.x/d*radius;actor.z=actor.z/d*radius;}}
  function updatePlayer(dt){
    player.inv=Math.max(0,player.inv-dt);player.hurt=Math.max(0,player.hurt-dt);player.regen=Math.max(0,player.regen-dt);
    if(player.regen<=0&&player.state==='idle')player.stamina=Math.min(100,player.stamina+30*dt);
    if(keys.has('ArrowLeft'))orbitYaw+=dt*1.8;if(keys.has('ArrowRight'))orbitYaw-=dt*1.8;
    if(keys.has('ArrowUp'))camDistance=Math.max(4.5,camDistance-dt*3);if(keys.has('ArrowDown'))camDistance=Math.min(12,camDistance+dt*3);
    if(player.state==='idle'){
      const d=movementDirection();let speed=3.35;
      if((keys.has('ShiftLeft')||keys.has('ShiftRight'))&&d.amount&&player.stamina>1){speed=5.3;player.stamina=Math.max(0,player.stamina-17*dt);player.regen=.65;}
      player.x+=d.x*speed*dt;player.z+=d.z*speed*dt;
      if(locked){player.yaw+=angleDiff(face(player,boss),player.yaw)*Math.min(1,dt*12);}else if(d.amount){player.yaw+=angleDiff(Math.atan2(d.x,d.z),player.yaw)*Math.min(1,dt*13);}
      player.walk=d.amount*speed;
    }else{
      player.walk=0;player.t+=dt;
      if(player.state==='dodge'){const speed=player.t<.43?8.4:2;player.x+=player.dx*speed*dt;player.z+=player.dz*speed*dt;}
      if(player.state==='hurt'){player.x+=player.dx*2.8*dt;player.z+=player.dz*2.8*dt;}
      if(player.state==='light'||player.state==='heavy'){
        const heavy=player.state==='heavy',strike=heavy?.53:.19;
        if(player.t<strike){player.x+=Math.sin(player.yaw)*dt*(heavy?.7:1.4);player.z+=Math.cos(player.yaw)*dt*(heavy?.7:1.4);}
        if(player.t>=strike&&!player.hit){player.hit=true;const reach=playerReach[player.state],arc=heavy?1.8:2;
          noise(heavy?.15:.09,1200,heavy?.065:.035,300);
          if(distance(player,boss)<reach&&Math.abs(angleDiff(face(player,boss),player.yaw))<arc){const bonus=boss.state==='stunned'?1.4:1;damageBoss(Math.round((heavy?59:player.combo===3?37:28)*bonus),heavy?43:player.combo===3?24:16);}
          else tone(320,.08,'sine',.025,90);
        }
      }
      if(player.state==='heal'&&player.t>=.8&&!player.hit){player.hit=true;player.hp=Math.min(100,player.hp+55);burst(maid.root.position,0xa6e4bd,24,1.7);hint('潮露 · 恢复生命',1.1);}
      if(player.t>=player.duration){const buffered=player.buffer;player.state='idle';player.t=0;player.buffer=null;if(buffered)act(buffered);}
    }
    clampArena(player);
    const d=distance(player,boss),minimum=1.05;
    if(d<minimum&&d>.001){const push=(minimum-d);player.x+=(player.x-boss.x)/d*push;player.z+=(player.z-boss.z)/d*push;clampArena(player);}
  }
  function chooseAttack(){
    const d=distance(player,boss);let type;
    if(d>6.2)type=boss.pattern%3===0?'slam':'charge';
    else {const pattern=boss.phase===2?['double','slam','charge','sweep','double','slam']:['sweep','sweep','slam','charge','sweep','slam'];type=pattern[boss.pattern%pattern.length];}
    boss.pattern++;boss.attack=type;boss.state='windup';boss.t=0;boss.duration=attackDefs[type].wind;boss.hit=false;boss.combo=0;boss.warned=false;
    boss.yaw=face(boss,player);boss.aimX=Math.sin(boss.yaw);boss.aimZ=Math.cos(boss.yaw);
    $('boss-action').textContent=attackDefs[type].label;
    tone(type==='slam'?120:190,.2,'sine',.05,90);
  }
  function updateBoss(dt){
    boss.staggerDelay-=dt;if(boss.staggerDelay<=0)boss.stagger=Math.max(0,boss.stagger-dt*10);
    // All action timers, movement and hit timing share the same phase speed.
    dt*=bossActionSpeed();boss.t+=dt;
    const def=attackDefs[boss.attack];
    if(boss.phasePending&&['idle','recover','stunned'].includes(boss.state)){
      boss.phasePending=false;boss.phase=2;boss.state='transition';boss.t=0;boss.duration=2.7;boss.stagger=0;boss.hit=false;
      guardian.eyeLight.color.setHex(0xff9f70);guardian.armor.emissive.setHex(0x632b1c);guardian.armor.emissiveIntensity=.25;guardian.edge.emissive.setHex(0x8b3821);guardian.edge.emissiveIntensity=.4;
      announce('第二阶段 · 怒潮苏醒',2.5/bossActionSpeed());hint('离开圆圈 · 爆发瞬间翻滚',2/bossActionSpeed());$('boss-action').textContent='怒潮苏醒 · 二倍速';tone(58,1.7/bossActionSpeed(),'sawtooth',.08,90);
    }
    if(boss.state==='idle'){
      const d=distance(player,boss);boss.yaw+=angleDiff(face(boss,player),boss.yaw)*Math.min(1,dt*4);
      if(d>2.65){const speed=1.65;boss.x+=Math.sin(boss.yaw)*dt*speed;boss.z+=Math.cos(boss.yaw)*dt*speed;}
      if(boss.t>boss.duration)chooseAttack();
    }else if(boss.state==='windup'){
      if(boss.attack!=='charge'&&boss.t<boss.duration*.35)boss.yaw+=angleDiff(face(boss,player),boss.yaw)*Math.min(1,dt*3);
      if(!boss.warned&&(boss.duration-boss.t)/bossActionSpeed()<=parryCueLead){boss.warned=true;tone(boss.attack==='slam'||boss.attack==='charge'?380:880,.15,'triangle',.07,500);}
      if(boss.t>=boss.duration){boss.state='active';boss.t=0;boss.duration=def.active;boss.hit=false;tone(100,.22,'sawtooth',.075,42);}
    }else if(boss.state==='active'){
      if(boss.attack==='charge'){
        const old={x:boss.x,z:boss.z};boss.x+=boss.aimX*21*dt;boss.z+=boss.aimZ*21*dt;clampArena(boss,16.4);
        // A swept capsule catches contact even on a slower frame.
        const vx=boss.x-old.x,vz=boss.z-old.z,l2=vx*vx+vz*vz;
        const f=l2?clamp(((player.x-old.x)*vx+(player.z-old.z)*vz)/l2,0,1):0;
        if(!boss.hit&&Math.hypot(player.x-old.x-vx*f,player.z-old.z-vz*f)<1.5){boss.hit=true;hurtPlayer(def.damage,boss);}
      }else if(boss.attack==='slam'){
        if(!boss.hit){boss.hit=true;makeWave(boss,boss.phase);if(distance(player,boss)<=def.range)hurtPlayer(def.damage,boss);shake=.28;}
      }else if(!boss.hit&&boss.t>=.045){
        boss.hit=true;if(distance(player,boss)<def.range&&Math.abs(angleDiff(face(boss,player),boss.yaw))<def.arc)hurtPlayer(def.damage,boss,true);
      }
      if(boss.state==='active'&&boss.t>=boss.duration){
        if(boss.attack==='double'&&boss.combo===0){boss.combo++;boss.state='windup';boss.t=0;boss.duration=def.followWind;boss.hit=false;boss.warned=false;boss.yaw=face(boss,player);$('boss-action').textContent='第二击蓄力 · 等待出手';tone(190,.2,'sine',.05,90);}
        else{boss.state='recover';boss.t=0;boss.duration=def.recover;$('boss-action').textContent='破绽 · 趁现在反击';}
      }
    }else if(boss.state==='recover'||boss.state==='stunned'){
      if(boss.t>=boss.duration){boss.state='idle';boss.t=0;boss.duration=.7;$('boss-action').textContent='留意守卫的下一次动作';}
    }else if(boss.state==='transition'){
      if(boss.t>=2&&!boss.hit){boss.hit=true;makeWave(boss,2);if(distance(player,boss)<=attackDefs.slam.range)hurtPlayer(32,boss);shake=.4;}
      if(boss.t>=boss.duration){boss.state='idle';boss.t=0;boss.duration=.5;boss.hit=false;}
    }
    clampArena(boss,16.4);
  }
  function updateWaves(dt){
    for(let i=waves.length-1;i>=0;i--){const w=waves[i];w.life-=dt;w.m.material.opacity=.9*Math.max(0,w.life/w.maxLife);
      if(w.life<=0){scene.remove(w.m);w.m.geometry.dispose();w.m.material.dispose();waves.splice(i,1);}
    }
  }
  function animateModels(dt){
    setPositionModels();
    const walking=player.state==='idle'?(player.walk||0):0, stride=Math.sin(clock*walking*3.1)*Math.min(1,walking/3)*.56;
    maid.legs[0].rotation.x=stride;maid.legs[1].rotation.x=-stride;
    maid.arms[0].rotation.x=-stride*.5;maid.arms[1].rotation.x=stride*.4-.2;maid.arms[1].rotation.z=.12;
    maid.body.position.y=walking?Math.abs(Math.sin(clock*walking*3.1))*.035:Math.sin(clock*2)*.015;
    maid.body.rotation.x=lerp(maid.body.rotation.x,0,Math.min(1,dt*15));maid.body.rotation.z=0;
    maid.hairTails.forEach((h,i)=>{h.rotation.x=Math.sin(clock*3+i)*.09+walking*.035;h.rotation.z=Math.sin(clock*2+i)*.04;});maid.tail.rotation.y=Math.sin(clock*2.2)*.2;
    if(player.state==='dodge'){
      maid.body.rotation.x=-TAU*clamp(player.t/.57,0,1);maid.body.position.y=.38+Math.sin(player.t/.62*Math.PI)*.22;
      maid.root.rotation.y=Math.atan2(player.dx,player.dz);maid.arms[0].rotation.x=-1.2;maid.arms[1].rotation.x=-1.2;
    }
    if(player.state==='light'||player.state==='heavy'){
      const heavy=player.state==='heavy',strike=heavy?.53:.19,side=player.combo%2===0?-1:1;
      const wind=clamp(player.t/(strike-.065),0,1),cut=clamp((player.t-strike+.065)/(heavy?.17:.13),0,1);
      const snap=1-Math.pow(1-cut,3),recover=clamp((player.t-strike-.12)/(player.duration-strike-.12),0,1);
      const raised=lerp(-.2,heavy?-2.65:-1.65,wind);
      maid.arms[1].rotation.x=lerp(lerp(raised,heavy?1.05:.8,snap),-.2,recover);
      maid.arms[1].rotation.z=lerp(lerp(.12,side*1.2,wind)-side*snap*2.5,.12,recover);
      maid.body.rotation.z=side*(wind*.1-snap*.22)*(1-recover);
      maid.body.rotation.y=side*(wind*.2-snap*.38)*(1-recover);
      slash.visible=cut>0&&player.t<strike+.17;slash.position.set(player.x,1.12,player.z);
      slash.rotation.set(Math.PI/2,.25,player.yaw+side*(snap*3-.8));
      slash.material.opacity=(1-recover)*.95;slash.scale.setScalar((playerReach[player.state]-.55)/1.05);
      slashGlow.material.opacity=heavy?.28:.17;maid.blade.material.emissiveIntensity=1.4+snap*1.6;
    }else {slash.visible=false;maid.body.rotation.y=0;maid.blade.material.emissiveIntensity=.8;}
    if(player.state==='heal'){maid.arms[0].rotation.x=-2.3;maid.arms[0].rotation.z=-.3;}
    guardRing.visible=player.state==='parry';if(guardRing.visible){guardRing.rotation.set(0,player.yaw,0);guardRing.position.set(player.x+Math.sin(player.yaw)*.5,1.2,player.z+Math.cos(player.yaw)*.5);guardRing.material.opacity=player.t<.29?.9:.2;maid.arms[0].rotation.x=-1.5;}
    maid.root.visible=mode==='dead'||!(player.inv>0&&player.state==='hurt'&&Math.floor(clock*22)%2===0);
    if(mode==='dead'){maid.body.rotation.z=-1.35;maid.body.position.y=-.35;}
    const flash=impact.bossFlash/impact.flashDuration,recoil=flash*flash*impact.recoil;
    guardian.armor.emissive.setHex(boss.phase===2?0x632b1c:0x000000).lerp(impactFlashColor,flash);
    guardian.armor.emissiveIntensity=(boss.phase===2?.25:0)+flash*1.15;
    guardian.body.position.set(impact.recoilX*recoil,Math.sin(bossClock*1.8)*.025,impact.recoilZ*recoil);
    guardian.body.rotation.set(0,0,0);guardian.head.rotation.x=0;guardian.weapon.rotation.x=-.2;
    guardian.arms[1].rotation.x=-.3;guardian.arms[1].rotation.z=.17;guardian.arms[0].rotation.x=.1;guardian.arms[0].rotation.z=-.17;
    const bossWalk=boss.state==='idle'&&distance(player,boss)>2.65&&mode==='playing';guardian.legs[0].rotation.x=bossWalk?Math.sin(bossClock*5)*.3:0;guardian.legs[1].rotation.x=-guardian.legs[0].rotation.x;
    if(boss.state==='windup'){
      // Reach a distinct loaded pose early, then hold it before the fast release.
      const p=clamp(boss.t/boss.duration,0,1),load=1-Math.pow(1-clamp(p/.48,0,1),3);
      if(boss.attack==='slam'){
        guardian.arms[1].rotation.x=guardian.arms[0].rotation.x=-2.45*load;
        guardian.arms[1].rotation.z=.3*load;guardian.arms[0].rotation.z=-.3*load;
        guardian.weapon.rotation.x=-.2+2.25*load;guardian.body.rotation.x=-.22*load;
        guardian.body.position.y-=.2*load;guardian.head.rotation.x=-.12*load;
      }else if(boss.attack==='charge'){
        guardian.body.rotation.x=.42*load;guardian.body.position.y-=.3*load;
        guardian.arms[1].rotation.x=1.1*load;guardian.arms[1].rotation.z=.2;
        guardian.weapon.rotation.x=-.2+.55*load;guardian.arms[0].rotation.x=-.8*load;
        guardian.legs[0].rotation.x=.4*load;guardian.legs[1].rotation.x=-.4*load;
      }else{
        const side=boss.attack==='double'&&boss.combo===1?-1:1;
        guardian.body.rotation.y=-side*.68*load;guardian.body.rotation.x=-.12*load;
        guardian.arms[1].rotation.x=-.65*load;guardian.arms[1].rotation.z=side*1.85*load;
        guardian.arms[0].rotation.x=-.6*load;guardian.head.rotation.x=-.08*load;
      }
    }else if(boss.state==='active'){
      const snap=1-Math.pow(1-clamp((boss.t+(boss.attack==='slam'?.04:.015))/.085,0,1),3);
      if(boss.attack==='slam'){
        guardian.arms[1].rotation.x=lerp(-2.45,.95,snap);guardian.arms[0].rotation.x=lerp(-2.45,.4,snap);
        guardian.arms[1].rotation.z=.3;guardian.weapon.rotation.x=lerp(2.05,.5,snap);
        guardian.body.rotation.x=lerp(-.22,.32,snap);guardian.body.position.y-=.2;
      }else if(boss.attack==='charge'){
        guardian.body.rotation.x=.45;guardian.body.position.y-=.2;guardian.arms[1].rotation.x=1.1;guardian.weapon.rotation.x=.35;
      }else{
        const side=boss.attack==='double'&&boss.combo===1?-1:1;
        guardian.arms[1].rotation.x=lerp(-.65,1.05,snap);guardian.arms[1].rotation.z=side*lerp(1.85,-1.4,snap);
        guardian.body.rotation.y=side*lerp(-.68,.55,snap);guardian.body.rotation.x=.18;
      }
    }else if(boss.state==='stunned'){guardian.body.rotation.x=.5;guardian.body.position.y=-.24;}
    else if(boss.state==='transition'){guardian.arms[0].rotation.z=-1.3;guardian.arms[1].rotation.z=1.3;guardian.arms[0].rotation.x=guardian.arms[1].rotation.x=-.8;guardian.body.rotation.x=-.15;guardian.body.position.y=.1+Math.sin(bossClock*15)*.025;}
    else if(boss.state==='dead'){guardian.body.rotation.x=-1.4;guardian.body.position.y=-1;}
    guardian.body.rotation.x+=impact.recoilZ*recoil*.8;guardian.body.rotation.z-=impact.recoilX*recoil*.8;
    bossSlash.visible=boss.state==='active'&&['sweep','double'].includes(boss.attack);
    if(bossSlash.visible){bossSlash.position.set(boss.x,1.1,boss.z);bossSlash.rotation.set(Math.PI/2,.1,boss.yaw+boss.t*15);bossSlash.material.opacity=1-boss.t/boss.duration;}
    targetRing.visible=targetDiamond.visible=locked&&mode==='playing';targetRing.position.x=boss.x;targetRing.position.z=boss.z;
    targetRing.rotation.z=clock*.2;targetDiamond.position.set(boss.x,3.6+Math.sin(clock*3)*.07,boss.z);targetDiamond.rotation.y=clock;
    const warning=(boss.state==='windup'||boss.state==='transition'&&!boss.hit||boss.state==='active'&&boss.attack==='slam'&&!boss.hit)&&mode==='playing';
    telegraph.visible=telegraphEdge.visible=warning;dashLine.visible=warning&&boss.attack==='charge'&&boss.state!=='transition';
    $('boss-warning').hidden=!warning;
    guardian.weaponGlow.opacity=0;guardian.weaponLight.intensity=0;
    if(warning){
      const slam=boss.attack==='slam'||boss.state==='transition',r=slam?attackDefs.slam.range:attackDefs[boss.attack].range;
      telegraph.position.set(boss.x,.135,boss.z);telegraph.scale.set(r,r,1);telegraphEdge.position.set(boss.x,.145,boss.z);telegraphEdge.scale.set(r,r,1);
      const duration=boss.state==='transition'?2:boss.duration,remaining=boss.state==='active'?0:Math.max(0,duration-boss.t)/bossActionSpeed();
      const p=boss.state==='active'?1:clamp(boss.t/duration,0,1),parryable=!slam&&boss.attack!=='charge',soon=remaining<=parryCueLead;
      const ready=parryable&&soon,color=ready?0x7bdfff:soon?0xff794d:0xffbd78;
      telegraphMat.color.setHex(color);telegraphMat.opacity=.12+p*.16;telegraphEdge.material.color.copy(telegraphMat.color);telegraphEdge.material.opacity=.5+p*.45;
      guardian.weaponGlow.color.setHex(color);guardian.weaponGlow.opacity=.35+p*.5;
      guardian.weaponLight.color.setHex(color);guardian.weaponLight.intensity=3+p*9;
      $('boss-warning').classList.toggle('parry-ready',ready);$('boss-warning').classList.toggle('strike-soon',soon&&!ready);
      $('boss-warning-text').textContent=soon?(ready?'蓝光 · 现在弹反':'即将出手 · 翻滚闪避'):boss.state==='transition'?'怒潮蓄力 · 离开圆圈':boss.attack==='double'&&boss.combo===1?'第二击蓄力 · 继续观察':attackDefs[boss.attack].tell;
      $('boss-warning-time').textContent=remaining.toFixed(1)+' s';$('windup-fill').style.width=p*100+'%';
      if(dashLine.visible){dashLine.position.set(boss.x+boss.aimX*6,.15,boss.z+boss.aimZ*6);dashLine.rotation.y=boss.yaw;dashLine.material.opacity=.18+p*.18;}
    }
  }
  function updateHUD(){
    $('hp-fill').style.width=player.hp+'%';$('stamina-fill').style.width=player.stamina+'%';$('hp-text').textContent=Math.ceil(player.hp)+' / 100';$('stamina-text').textContent='体力 '+Math.ceil(player.stamina);
    $('flask-count').textContent=player.flasks;$('heal-btn').style.opacity=player.flasks?1:.35;
    const hp=boss.hp/boss.maxHp*100+'%';$('boss-fill').style.width=hp;$('boss-trail').style.width=hp;$('boss-hp-text').textContent=Math.max(0,Math.ceil(boss.hp)).toLocaleString()+' / 1,200';
    $('boss-phase').textContent=boss.phase===2?'Ⅱ · WRATH OF THE TIDE':'Ⅰ · THE OATHBOUND';$('boss-phase').style.color=boss.phase===2?'#e2a07d':'#9ba9a7';
    $('target-label').textContent=locked?'◈ 已锁定':'◇ 自由视角';$('elapsed').textContent=formatTime(elapsed);$('death-count').textContent=deaths;
  }
  function updateCamera(dt){
    const smooth=1-Math.exp(-dt*5);
    if(mode==='title'){
      const a=.64+Math.sin(clock*.09)*.1;camera.position.lerp(new T.Vector3(Math.sin(a)*19,5.2,Math.cos(a)*19),smooth);
      camera.lookAt(innerWidth>700?-2.8:-.5,1.7,-.6);return;
    }
    const toward=locked?face(player,boss)+Math.PI+orbitYaw:orbitYaw;
    const back=new T.Vector3(Math.sin(toward)*camDistance,camDistance*.42+1,Math.cos(toward)*camDistance);
    const look=new T.Vector3(player.x,1.18,player.z);
    if(locked){look.x=lerp(player.x,boss.x,.22);look.z=lerp(player.z,boss.z,.22);look.y=1.5;}
    const pos=new T.Vector3(player.x+back.x,back.y,player.z+back.z);
    // Add the short impact impulse after camera smoothing so it remains crisp.
    cameraBase.lerp(pos,smooth);camera.position.copy(cameraBase);
    const progress=1-impact.life/impact.duration,envelope=Math.pow(impact.life/impact.duration,2);
    const strength=impact.strength*envelope,jolt=Math.sin(progress*43)*.65+Math.sin(progress*79)*.35;
    cameraRight.set(Math.cos(toward),0,-Math.sin(toward));cameraBack.copy(back).normalize();
    camera.position.addScaledVector(cameraRight,jolt*strength*.65+Math.sin(clock*71)*shake*.2);
    camera.position.y+=Math.sin(progress*61)*strength*.35+Math.cos(clock*83)*shake*.15;
    camera.position.addScaledVector(cameraBack,-impact.kick*envelope);
    const fov=48-impact.kick*envelope*6;
    if(Math.abs(camera.fov-fov)>.001){camera.fov=fov;camera.updateProjectionMatrix();}
    camera.lookAt(look);
  }
  let last=performance.now(),hudTick=0;
  function frame(now){
    requestAnimationFrame(frame);const realDt=Math.min((now-last)/1000,.04);last=now;
    if(mode!=='paused'){
      let dt=realDt;
      if(hitStop>0){hitStop=Math.max(0,hitStop-realDt);dt*=.02;}
      clock+=dt;bossClock+=dt*bossActionSpeed();
      if(mode==='playing'){elapsed+=realDt;updatePlayer(dt);if(mode==='playing')updateBoss(dt);}
      updateWaves(realDt);
      shake=Math.max(0,shake-realDt*.65);updateFeedback(realDt);updateCamera(realDt);animateModels(realDt);
      for(let i=0;i<particlesCount;i++){particlePositions[i*3+1]+=realDt*particleSpeeds[i];if(particlePositions[i*3+1]>20)particlePositions[i*3+1]=0;particlePositions[i*3]+=Math.sin(clock*.2+i)*realDt*.025;}particleGeo.attributes.position.needsUpdate=true;
      flames.forEach((f,i)=>{f.scale.y=.43+Math.sin(clock*3+i)*.1;f.rotation.z=Math.sin(clock*2+i)*.09;});waterRings.forEach((r,i)=>r.material.opacity=.13+Math.sin(clock*.7+i)*.06);
      if(announceTimer>0){announceTimer-=realDt;if(announceTimer<=0)$('announcement').style.opacity=0;}
      if(hintTimer>0){hintTimer-=realDt;if(hintTimer<=0)$('combat-hint').style.opacity=0;}
      $('hit-flash').style.opacity=player.hurt>0?String(player.hurt*.9):'0';
      hudTick+=realDt;if(hudTick>.07){hudTick=0;updateHUD();}
    }
    renderer.render(scene,camera);
  }

  const isTouch=matchMedia('(pointer: coarse)').matches;if(isTouch)document.body.classList.add('touch');
  function resetStick(){$('joystick-knob').style.transform='translate(0px,0px)';}
  $('start-btn').onclick=start;$('retry-btn').onclick=start;$('restart-btn').onclick=start;
  $('home-btn').onclick=()=>reset(true);$('pause-home-btn').onclick=()=>reset(true);
  $('pause-btn').onclick=togglePause;$('resume-btn').onclick=togglePause;$('help-btn').onclick=openHelp;$('close-help-btn').onclick=closeHelp;
  $('heal-btn').onclick=()=>act('heal');$('sound-btn').onclick=()=>{initAudio();toggleSound();};
  document.addEventListener('keydown',e=>{
    if(['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
    if(e.code==='Escape'){if(!$('help').hidden)closeHelp();else togglePause();return;}
    if(e.repeat){keys.add(e.code);return;}keys.add(e.code);
    if(e.code==='KeyM')toggleSound();
    if(e.code==='KeyF'){if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});else document.documentElement.requestFullscreen?.().catch(()=>{});}
    if(e.code==='KeyR'&&(mode==='dead'||mode==='victory'))start();
    if(e.code==='Enter'&&mode==='title'&&$('help').hidden)start();
    if(e.code==='Tab'&&mode==='playing'){locked=!locked;orbitYaw=locked?0:Math.atan2(camera.position.x-player.x,camera.position.z-player.z);}
    const actions={Space:'dodge',KeyJ:'light',KeyK:'heavy',KeyQ:'heal',KeyE:'parry'};if(actions[e.code])act(actions[e.code]);
  });
  document.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>{keys.clear();touchX=touchY=0;resetStick();if(mode==='playing')togglePause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing')togglePause();});
  const canvas=$('scene');canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;if(e.button===1){dragging=true;lastMouseX=e.clientX;canvas.setPointerCapture(e.pointerId);e.preventDefault();}else if(e.button===0)act('light');else if(e.button===2)act('heavy');});
  canvas.addEventListener('pointermove',e=>{if(dragging){orbitYaw-=(e.clientX-lastMouseX)*.006;lastMouseX=e.clientX;}});
  canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
  canvas.addEventListener('wheel',e=>{camDistance=clamp(camDistance+e.deltaY*.006,4.5,12);e.preventDefault();},{passive:false});
  let stickPointer=null;
  function updateStick(e){const rect=$('joystick').getBoundingClientRect(),r=rect.width*.32;let x=e.clientX-rect.left-rect.width/2,y=e.clientY-rect.top-rect.height/2;const length=Math.hypot(x,y);if(length>r){x=x/length*r;y=y/length*r;}touchX=x/r;touchY=y/r;$('joystick-knob').style.transform=`translate(${x}px,${y}px)`;}
  $('joystick').addEventListener('pointerdown',e=>{if(stickPointer!==null)return;stickPointer=e.pointerId;$('joystick').setPointerCapture(e.pointerId);updateStick(e);e.preventDefault();});
  $('joystick').addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)updateStick(e);});
  function releaseStick(e){if(e.pointerId!==stickPointer)return;stickPointer=null;touchX=touchY=0;resetStick();}
  $('joystick').addEventListener('pointerup',releaseStick);$('joystick').addEventListener('pointercancel',releaseStick);
  document.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('pointerdown',e=>{e.preventDefault();act(btn.dataset.action);}));
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();if(mode==='playing')togglePause();fail(new Error('图形上下文丢失，请重新加载'));});
  // Read-only snapshot for diagnostics, without modifying game state.
  window.Tideborn=Object.freeze({snapshot:()=>({mode,elapsed,player:{...player},boss:{...boss},deaths,attempt,locked,entities:scene.children.length,render:renderer.info.render})});
  reset(true);$('loading').hidden=true;requestAnimationFrame(frame);
})();
