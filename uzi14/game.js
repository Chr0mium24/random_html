(() => {
  'use strict';
  const E = window.CelestialEngine;
  const $ = id => document.getElementById(id);
  const board = $('board'), ctx = board.getContext('2d');
  const fx = $('effects'), fctx = fx.getContext('2d');
  const ambient = $('ambient'), actx = ambient.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let settings = { mode: 'ai', difficulty: 'normal', skills: true, effects: !reducedMotion };
  try { settings = { ...settings, ...JSON.parse(localStorage.getItem('celestial-settings') || '{}') }; } catch { /* Local storage is optional. */ }
  let state, history = [], logs = [], selected = null, hint = null, hover = null;
  let cursor = { x: 7, y: 7 }, keyboard = false, turnSaved = false;
  let size = 500, dpr = 1, dirty = true, startedAt = 0, endedAt = 0;
  let aiTimer = 0, resultTimer = 0, toastTimer = 0, announceTimer = 0, epoch = 0;
  let particles = [], waves = [], bolts = [], sigils = [], dust = [], lastFrame = 0, lastAmbient = 0, victoryAt = 0;
  let audio = null, sound = false;
  const letters = 'ABCDEFGHIJKLMNO';
  const skillEnglish = { thunder: 'THUNDER OF THE HEAVENS', frost: 'DOMAIN OF FROZEN STARS', twin: 'DESCENT OF TWIN STARS', oracle: 'VISION OF THE CELESTIAL' };
  const timeText = ms => { const sec = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; };
  const coord = (x, y) => `${letters[x]}${15 - y}`;
  const playerName = p => p === 1 ? (settings.mode === 'ai' ? '你' : '玄曜') : (settings.mode === 'ai' ? '天机' : '素月');
  const isHuman = () => !state.ended && (settings.mode === 'local' || state.turn === 1);
  const effectsOn = () => settings.effects && !reducedMotion;
  const point = (x, y) => ({ x: size * .073 + x * size * .854 / 14, y: size * .073 + y * size * .854 / 14 });
  const cellSize = () => size * .854 / 14;

  function toast(message) {
    $('toast').textContent = message; $('toast').classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2500);
  }
  function addLog(text, type = '', detail = '') {
    logs.unshift({ text, type, detail: detail || `第 ${Math.floor(state.ply / 2) + 1} 轮 · ${timeText(Date.now() - startedAt)}` });
    logs = logs.slice(0, 35); renderLogs();
  }
  function renderLogs() {
    const list = $('logList'); list.replaceChildren();
    for (const log of logs) {
      const row = document.createElement('div'); row.className = `log-item log-${log.type}`;
      const icon = document.createElement('i'); icon.textContent = ({ thunder: 'ϟ', frost: '❄', twin: '✧', oracle: '◈', win: '✦', start: '✧' })[log.type] || '·';
      const body = document.createElement('div'); body.textContent = log.text;
      const detail = document.createElement('small'); detail.textContent = log.detail;
      body.append(detail); row.append(icon, body); list.append(row);
    }
    list.scrollTop = 0;
  }
  function refresh() {
    for (const who of [1, 2]) {
      const p = state.players[who];
      $(`energy${who}`).textContent = p.energy; $(`bar${who}`).style.width = `${p.energy}%`;
      $(`stones${who}`).textContent = state.board.flat().filter(v => v === who).length;
      $(`casts${who}`).textContent = p.casts;
      $(`player${who}`).classList.toggle('active-player', state.turn === who && !state.ended);
    }
    $('tag1').textContent = state.ended ? '弈局已定' : state.turn === 1 ? (settings.mode === 'ai' ? '你的回合' : '正在执棋') : '静候对手';
    $('tag2').textContent = state.ended ? '弈局已定' : state.turn === 2 ? (settings.mode === 'ai' ? '推演之中' : '正在执棋') : settings.mode === 'ai' ? `天机 · ${{ easy: '入门', normal: '标准', hard: '大师' }[settings.difficulty]}` : '静候对手';
    $('roundNumber').textContent = String(Math.floor(state.ply / 2) + 1).padStart(2, '0');
    let status = state.ended ? (state.winner ? `${playerName(state.winner)}连成五子 · 弈局已定` : '星盘已满 · 平分秋色') : !isHuman() ? '天机正在观星推演…' : state.pending ? '星陨连珠 · 请落下第二子' : selected ? `${E.SKILLS[selected].name} · 选择目标` : state.moves === 0 ? '静待落子' : `${playerName(state.turn)}执${state.turn === 1 ? '黑' : '白'} · 请落子`;
    $('turnStatus').textContent = status;
    document.body.classList.toggle('thinking', !isHuman() && !state.ended);
    let instruction = state.ended ? '此局终了。再赴一局，续写星盘。' : state.pending ? '星力未尽，再落一子' : selected === 'thunder' ? '选择一枚敌方棋子，将其击碎' : selected === 'frost' ? '选择一处空位，召来冰封' : selected === 'twin' ? '选择第一处落点，开启连珠' : hint ? `天机指引：${coord(hint.x, hint.y)} · 仍由你落子` : !isHuman() ? '星盘推演中，请稍候' : state.moves ? '纵横经纬间，静心落子' : '点击星盘交点，落下你的第一颗棋子';
    $('boardHint').textContent = instruction;
    $('targetBanner').hidden = !selected && !state.pending;
    $('targetText').textContent = selected ? instruction : '星陨连珠 · 请落下第二子';
    $('cancelSkill').hidden = state.pending > 0;
    for (const card of document.querySelectorAll('[data-skill]')) {
      const skill = card.dataset.skill, remaining = E.cooldown(state, skill);
      card.disabled = !isHuman() || !!E.skillError(state, skill);
      card.classList.toggle('selected', selected === skill || (skill === 'twin' && state.pending > 0));
      card.classList.toggle('on-cooldown', remaining > 0);
      card.querySelector('.cooldown-badge').textContent = `冷却 ${remaining}`;
      card.title = E.skillError(state, skill) || `${E.SKILLS[skill].name} · 数字键 ${Object.keys(E.SKILLS).indexOf(skill) + 1}`;
    }
    $('undoBtn').disabled = !history.length;
    board.setAttribute('aria-label', `15乘15五子棋棋盘。${status}。当前光标 ${coord(cursor.x, cursor.y)}。方向键移动，回车落子。`);
    dirty = true;
  }
  function newGame() {
    clearTimeout(aiTimer); clearTimeout(resultTimer); clearTimeout(announceTimer); epoch++;
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    state = E.create(settings); history = []; logs = []; selected = hint = hover = null;
    particles = []; waves = []; bolts = []; sigils = []; victoryAt = 0;
    cursor = { x: 7, y: 7 }; keyboard = false; turnSaved = false; startedAt = Date.now(); endedAt = 0;
    $('timer').textContent = '00:00'; $('skillAnnouncement').classList.remove('show');
    $('name1').textContent = settings.mode === 'ai' ? '执棋者' : '玄曜';
    $('name2').textContent = settings.mode === 'ai' ? '天机' : '素月';
    $('desc1').textContent = '以心入局，落子无悔';
    $('desc2').textContent = settings.mode === 'ai' ? '观星推演，算尽千机' : '月落星河，与君对弈';
    $('modeText').textContent = settings.mode === 'ai' ? '人机对弈' : '双人同屏';
    document.body.classList.toggle('classic', !settings.skills);
    document.body.classList.toggle('fx-off', !effectsOn());
    addLog('星盘已启，静候执棋者', 'start', settings.mode === 'ai' ? '人机对弈 · 黑棋先行' : '双人同屏 · 黑棋先行');
    $('wisdom').innerHTML = '善弈者谋势，<br>不善弈者谋子。';
    $('wisdomNote').textContent = '攻守之间，自有章法';
    syncSettings(); refresh();
  }
  function saveTurn() {
    if (turnSaved) return;
    history.push({ state: structuredClone(state), logs: structuredClone(logs) });
    if (history.length > 120) history.shift();
    turnSaved = true;
  }
  function undo() {
    if (!history.length) return;
    let index = history.length - 1;
    if (settings.mode === 'ai') while (index >= 0 && history[index].state.turn !== 1) index--;
    if (index < 0) return;
    clearTimeout(aiTimer); clearTimeout(resultTimer); epoch++;
    const previous = history[index]; state = structuredClone(previous.state); logs = structuredClone(previous.logs); history.splice(index);
    selected = hint = null; turnSaved = false; endedAt = 0; victoryAt = 0; particles = []; waves = []; bolts = []; sigils = [];
    clearTimeout(announceTimer);
    $('skillAnnouncement').classList.remove('show'); $('resultDialog').close();
    addLog('星盘回溯，重寻一手', 'oracle', '灵力与秘术冷却已恢复'); refresh(); toast('已回到上一次行动前');
  }
  function selectSkill(skill) {
    if (!isHuman()) return toast(state.ended ? '此局已定，请开启新局' : '请静候天机落子');
    const error = E.skillError(state, skill);
    if (error) return toast(error);
    if (selected === skill) { cancelSkill(); return; }
    if (skill === 'thunder' && !state.board.flat().includes(3 - state.turn)) return toast('星盘上还没有敌方棋子');
    if (skill === 'oracle') {
      const target = E.best(state, state.turn, 'hard');
      if (!target) return toast('暂无可用落点');
      saveTurn(); const result = E.cast(state, skill); hint = { x: target.x, y: target.y }; selected = null;
      addLog(`${playerName(result.who)}窥见天机`, skill, `星盘指引 · ${coord(target.x, target.y)}`);
      announce(skill, result.who); burst(target.x, target.y, skill); refresh();
      return;
    }
    selected = skill; hint = null; refresh(); tone('select');
  }
  function cancelSkill() {
    if (state.pending) return;
    selected = null; refresh();
  }
  function act(x, y) {
    if (!isHuman()) return;
    cursor = { x, y };
    if (selected === 'thunder' || selected === 'frost') {
      const skill = selected;
      if (skill === 'thunder' ? state.board[y]?.[x] !== 3 - state.turn : !E.legal(state, x, y)) return toast(skill === 'thunder' ? '请选择一枚敌方棋子' : '请选择未被冰封的空置交点');
      saveTurn(); const result = E.cast(state, skill, x, y);
      if (!result.ok) return toast(result.error);
      selected = null; hint = null;
      addLog(`${playerName(result.who)}施展${E.SKILLS[skill].name}`, skill, `${coord(x, y)} · ${skill === 'thunder' ? '敌子化为星尘' : '冰封两个轮次'}`);
      announce(skill, result.who); burst(x, y, skill); afterAction(result); return;
    }
    if (!E.legal(state, x, y)) return toast(E.frozen(state, x, y) ? '此处已被冰封，暂不可落子' : '此处已有棋子，请另择落点');
    saveTurn();
    if (selected === 'twin') {
      const cast = E.cast(state, 'twin');
      if (!cast.ok) return toast(cast.error);
      selected = null; announce('twin', cast.who);
      addLog(`${playerName(cast.who)}唤醒星陨连珠`, 'twin', '星辰响应 · 连续落下两子');
    }
    place(x, y);
  }
  function place(x, y) {
    const twin = state.pending > 0;
    const result = E.play(state, x, y);
    if (!result.ok) return toast(result.error);
    hint = null;
    addLog(`${playerName(result.who)}落子 ${coord(x, y)}`, twin ? 'twin' : '', `${result.who === 1 ? '玄曜 · 黑棋' : '素月 · 白棋'}${twin ? ' · 连珠' : ''}`);
    burst(x, y, twin ? 'twin' : 'place'); tone('place', result.who);
    afterAction(result);
  }
  function afterAction(result) {
    if (result.endedTurn) turnSaved = false;
    refresh();
    if (state.ended) { finishGame(); return; }
    if (state.moves > 8) { $('wisdom').innerHTML = '局中见天地，<br>落子知进退。'; $('wisdomNote').textContent = '秘术有时，谋略无尽'; }
    if (!isHuman()) scheduleAI();
  }
  function finishGame() {
    clearTimeout(aiTimer); endedAt = Date.now(); victoryAt = performance.now();
    const winner = state.winner;
    addLog(winner ? `${playerName(winner)}五子连星，问鼎弈境` : '星盘已满，平分秋色', 'win', '本局终了');
    if (winner) {
      tone('win');
      for (const [x, y] of state.winningLine) burst(x, y, 'win');
    }
    $('resultTitle').textContent = winner === 0 ? '星河同辉，平分秋色' : settings.mode === 'local' ? `${playerName(winner)}，问鼎弈境` : winner === 1 ? '星河为你加冕' : '胜负之外，弈道无穷';
    $('resultEyebrow').textContent = winner === 0 ? 'A PERFECT EQUILIBRIUM' : settings.mode === 'ai' && winner === 2 ? 'EVERY GAME IS A NEW BEGINNING' : 'CONSTELLATION COMPLETE';
    $('resultText').textContent = winner === 0 ? '方寸星盘，难分伯仲。再开一局，续写传奇。' : settings.mode === 'ai' && winner === 2 ? '天机此番技高一筹。复盘此局，下一手自有新天地。' : '五子连成星河，所有谋划在这一刻绽放。';
    $('resultRounds').textContent = Math.floor(state.ply / 2) + 1;
    $('resultCasts').textContent = state.players[1].casts + state.players[2].casts;
    $('resultTime').textContent = timeText(endedAt - startedAt);
    resultTimer = setTimeout(() => { if (state.ended) { for (const d of document.querySelectorAll('dialog[open]')) d.close(); $('resultDialog').showModal(); } }, effectsOn() ? 1700 : 350);
    refresh();
  }

  function scheduleAI() {
    clearTimeout(aiTimer);
    if (state.ended || settings.mode !== 'ai' || state.turn !== 2) return;
    const token = epoch;
    aiTimer = setTimeout(() => { if (epoch === token && state.turn === 2 && !state.ended) aiAct(); }, state.pending ? 650 : 700 + Math.random() * 450);
  }
  function aiAct() {
    const who = state.turn, enemy = 3 - who;
    const wins = E.immediate(state, who), threats = E.immediate(state, enemy);
    saveTurn();
    if (wins.length) { place(wins[0].x, wins[0].y); return; }
    if (settings.difficulty !== 'easy' && !state.skillUsed) {
      if (threats.length > 1 && !E.skillError(state, 'thunder')) {
        // Destroy the enemy stone that eliminates the most immediate winning points.
        let target = null, lowest = threats.length;
        for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) if (state.board[y][x] === enemy) {
          state.board[y][x] = 0; const count = E.immediate(state, enemy).length; state.board[y][x] = enemy;
          if (count < lowest) { lowest = count; target = { x, y }; }
        }
        if (target) { aiTargetSkill('thunder', target); return; }
      }
      if (threats.length === 1 && !E.skillError(state, 'frost') && state.moves > 8 && settings.difficulty === 'hard') { aiTargetSkill('frost', threats[0]); return; }
      if (!E.skillError(state, 'twin') && state.moves >= (settings.difficulty === 'hard' ? 3 : 7)) {
        const result = E.cast(state, 'twin');
        addLog('天机唤醒星陨连珠', 'twin', '星辰响应 · 连续落下两子'); announce('twin', who);
        const target = threats[0] || E.best(state, who, settings.difficulty);
        if (result.ok && target) { place(target.x, target.y); return; }
      }
    }
    const target = threats[0] || E.best(state, who, settings.difficulty);
    if (target) place(target.x, target.y);
  }
  function aiTargetSkill(skill, target) {
    const result = E.cast(state, skill, target.x, target.y);
    if (!result.ok) { const move = E.best(state); if (move) place(move.x, move.y); return; }
    addLog(`天机施展${E.SKILLS[skill].name}`, skill, `${coord(target.x, target.y)} · ${skill === 'thunder' ? '雷落破阵' : '封锁星位'}`);
    announce(skill, result.who); burst(target.x, target.y, skill); afterAction(result);
  }

  function syncSettings() {
    const form = $('settingsForm');
    form.elements.mode.value = settings.mode; form.elements.difficulty.value = settings.difficulty;
    form.elements.skills.checked = settings.skills; form.elements.effects.checked = settings.effects;
    $('difficultyField').disabled = settings.mode !== 'ai';
  }
  function openSettings() { syncSettings(); $('settingsDialog').showModal(); }
  $('settingsBtn').addEventListener('click', openSettings); $('modeBtn').addEventListener('click', openSettings);
  $('helpBtn').addEventListener('click', () => $('helpDialog').showModal());
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', event => { if (event.target !== d) return; const r = d.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) d.close(); }));
  $('settingsForm').addEventListener('change', () => { $('difficultyField').disabled = $('settingsForm').elements.mode.value !== 'ai'; });
  $('settingsForm').addEventListener('submit', event => {
    event.preventDefault(); const form = event.currentTarget;
    settings = { mode: form.elements.mode.value, difficulty: form.elements.difficulty.value, skills: form.elements.skills.checked, effects: form.elements.effects.checked };
    try { localStorage.setItem('celestial-settings', JSON.stringify(settings)); } catch { /* The game works without persistence. */ }
    newGame(); toast('新局已启，请执黑先行');
  });
  $('restartBtn').addEventListener('click', () => state.moves || state.ply || state.skillUsed ? $('confirmDialog').showModal() : newGame());
  $('confirmRestart').addEventListener('click', newGame); $('playAgain').addEventListener('click', newGame);
  $('undoBtn').addEventListener('click', undo); $('cancelSkill').addEventListener('click', cancelSkill);
  document.querySelectorAll('[data-skill]').forEach(b => b.addEventListener('click', () => selectSkill(b.dataset.skill)));
  function eventCell(event) {
    const r = board.getBoundingClientRect();
    const x = ((event.clientX - r.left) / r.width - .073) / (.854 / 14), y = ((event.clientY - r.top) / r.height - .073) / (.854 / 14);
    const ix = Math.round(x), iy = Math.round(y);
    return E.inside(ix, iy) && Math.abs(x - ix) <= .48 && Math.abs(y - iy) <= .48 ? { x: ix, y: iy } : null;
  }
  board.addEventListener('pointermove', event => { const p = eventCell(event); if (hover?.x !== p?.x || hover?.y !== p?.y) { hover = p; keyboard = false; dirty = true; } });
  board.addEventListener('pointerleave', () => { hover = null; dirty = true; });
  board.addEventListener('click', event => { const p = eventCell(event); keyboard = false; if (p) act(p.x, p.y); });
  board.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(event.key)) {
      event.preventDefault(); keyboard = true;
      if (event.key === 'ArrowLeft') cursor.x = Math.max(0, cursor.x - 1);
      if (event.key === 'ArrowRight') cursor.x = Math.min(14, cursor.x + 1);
      if (event.key === 'ArrowUp') cursor.y = Math.max(0, cursor.y - 1);
      if (event.key === 'ArrowDown') cursor.y = Math.min(14, cursor.y + 1);
      if (event.key === 'Enter' || event.key === ' ') act(cursor.x, cursor.y);
      hover = { ...cursor }; refresh();
    }
  });
  document.addEventListener('keydown', event => {
    if (document.querySelector('dialog[open]') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
    if (event.key === 'Escape') cancelSkill();
    if (['1', '2', '3', '4'].includes(event.key)) { event.preventDefault(); selectSkill(Object.keys(E.SKILLS)[Number(event.key) - 1]); }
  });

  $('soundBtn').addEventListener('click', async () => {
    sound = !sound;
    if (sound) {
      try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); await audio.resume(); }
      catch { sound = false; toast('当前浏览器不支持音效'); }
    }
    $('soundBtn').classList.toggle('sound-on', sound); $('soundBtn').setAttribute('aria-pressed', String(sound));
    $('soundBtn').setAttribute('aria-label', sound ? '关闭音效' : '开启音效'); $('soundBtn').title = sound ? '关闭音效' : '开启音效';
    if (sound) tone('select');
  });
  function note(frequency, when, duration, volume = .1, type = 'sine') {
    if (!sound || !audio || audio.state !== 'running') return;
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = type; osc.frequency.value = frequency;
    gain.gain.setValueAtTime(.0001, when); gain.gain.exponentialRampToValueAtTime(volume, when + .008); gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    osc.connect(gain); gain.connect(audio.destination); osc.start(when); osc.stop(when + duration + .01);
  }
  function tone(type, who = 1) {
    if (!sound || !audio) return;
    const now = audio.currentTime;
    if (type === 'place') { note(who === 1 ? 330 : 440, now, .18, .13); note(who === 1 ? 1260 : 1680, now, .06, .025); }
    else if (type === 'select') note(660, now, .16, .05);
    else {
      const seq = type === 'thunder' ? [65, 98, 130, 260] : type === 'frost' ? [880, 1318, 1760, 2093] : type === 'twin' ? [440, 660, 880, 1320] : type === 'win' ? [392, 494, 587, 784, 988] : [523, 659, 784, 1046];
      seq.forEach((f, i) => note(f, now + i * .09, .8, type === 'thunder' ? .12 : .07, type === 'thunder' ? 'triangle' : 'sine'));
    }
  }
  function announce(skill, who) {
    tone(skill);
    if (!effectsOn()) return;
    const el = $('skillAnnouncement'); clearTimeout(announceTimer);
    el.classList.remove('show'); void el.offsetWidth;
    el.style.color = E.SKILLS[skill].color;
    el.querySelector('span').textContent = `${playerName(who)} · 星蕴秘术`;
    el.querySelector('strong').textContent = E.SKILLS[skill].name;
    el.querySelector('small').textContent = skillEnglish[skill];
    el.classList.add('show'); announceTimer = setTimeout(() => el.classList.remove('show'), 1850);
  }

  function resize() {
    size = board.getBoundingClientRect().width; dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [board, fx]) { c.width = Math.round(size * dpr); c.height = Math.round(size * dpr); c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0); }
    const w = window.innerWidth, h = window.innerHeight;
    ambient.width = w * dpr; ambient.height = h * dpr; actx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dust = Array.from({ length: Math.min(65, Math.floor(w / 23)) }, () => ({ x: Math.random() * w, y: Math.random() * h, r: .4 + Math.random() * .9, speed: .08 + Math.random() * .18, phase: Math.random() * 6.28 }));
    dirty = true;
    // Resize clears a canvas immediately; repaint in the same task to avoid an empty frame.
    if (state) { drawBoard(performance.now()); dirty = false; }
  }
  new ResizeObserver(resize).observe($('boardStage'));
  window.addEventListener('resize', resize);
  function drawBoard(now) {
    ctx.clearRect(0, 0, size, size);
    const start = size * .073, end = size * .927, step = cellSize();
    ctx.lineWidth = Math.max(.5, size / 1000);
    // Thin, warm grid over a deep jade star chart.
    for (let n = 0; n < 15; n++) {
      const pos = start + n * step;
      ctx.strokeStyle = n === 7 ? '#b4b17c55' : '#9f9c6c36';
      ctx.beginPath(); ctx.moveTo(start, pos); ctx.lineTo(end, pos); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pos, start); ctx.lineTo(pos, end); ctx.stroke();
    }
    ctx.strokeStyle = '#b0a77755'; ctx.strokeRect(start, start, end - start, end - start);
    ctx.font = `${Math.max(7, size * .016)}px Georgia, serif`; ctx.fillStyle = '#7c8a6a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let n = 0; n < 15; n++) {
      ctx.fillText(letters[n], start + n * step, size * .025);
      ctx.fillText(String(15 - n), size * .027, start + n * step);
      ctx.fillStyle = '#63745a99'; ctx.fillText(letters[n], start + n * step, size * .975); ctx.fillStyle = '#7c8a6a';
    }
    for (const [x, y] of [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]]) {
      const p = point(x, y); ctx.fillStyle = '#b2ad79'; ctx.beginPath(); ctx.arc(p.x, p.y, size * .004, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#a5a77a35'; ctx.beginPath(); ctx.arc(p.x, p.y, size * .009, 0, Math.PI * 2); ctx.stroke();
    }
    // Quiet compass details at the center, visible through the board.
    const mid = size / 2;
    ctx.save(); ctx.translate(mid, mid); ctx.strokeStyle = '#a5a36b20'; ctx.lineWidth = .6;
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(0, -size * .26); ctx.lineTo(size * .008, -size * .22); ctx.lineTo(0, -size * .23); ctx.lineTo(-size * .008, -size * .22); ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
    for (const seal of state.freezes) drawSeal(seal, now);
    for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) if (state.board[y][x]) drawStone(x, y, state.board[y][x]);
    if (state.last) {
      const p = point(state.last.x, state.last.y);
      ctx.strokeStyle = state.last.who === 1 ? '#cfc48b' : '#63775f'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x - step * .10, p.y); ctx.lineTo(p.x + step * .10, p.y); ctx.moveTo(p.x, p.y - step * .10); ctx.lineTo(p.x, p.y + step * .10); ctx.stroke();
    }
    if (hint && !state.ended) {
      const p = point(hint.x, hint.y), pulse = effectsOn() ? .65 + Math.sin(now / 250) * .2 : .8;
      ctx.save(); ctx.globalAlpha = pulse; ctx.strokeStyle = '#c5d998'; ctx.lineWidth = 1.2;
      ctx.shadowColor = '#bed68a'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(p.x, p.y, step * .34, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x, p.y - step * .18); ctx.lineTo(p.x + step * .13, p.y); ctx.lineTo(p.x, p.y + step * .18); ctx.lineTo(p.x - step * .13, p.y); ctx.closePath(); ctx.stroke(); ctx.restore();
    }
    if ((hover || keyboard) && isHuman()) {
      const h = hover || cursor, p = point(h.x, h.y);
      if (selected === 'thunder' && state.board[h.y][h.x] === 3 - state.turn) {
        ctx.strokeStyle = '#e1bc72'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, step * .47, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * step * .36, p.y + Math.sin(a) * step * .36); ctx.lineTo(p.x + Math.cos(a) * step * .65, p.y + Math.sin(a) * step * .65); ctx.stroke(); }
      } else if (E.legal(state, h.x, h.y)) {
        if (selected === 'frost') { ctx.fillStyle = '#94d6df22'; ctx.fillRect(p.x - step * .45, p.y - step * .45, step * .9, step * .9); }
        else { ctx.save(); ctx.globalAlpha = .4; drawStone(h.x, h.y, state.turn, true); ctx.restore(); }
        ctx.strokeStyle = selected ? E.SKILLS[selected].color : '#cfbf87'; ctx.lineWidth = 1; const r = step * .48, l = step * .14;
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) { ctx.beginPath(); ctx.moveTo(p.x + sx * r, p.y + sy * (r - l)); ctx.lineTo(p.x + sx * r, p.y + sy * r); ctx.lineTo(p.x + sx * (r - l), p.y + sy * r); ctx.stroke(); }
      }
    }
    if (state.winningLine.length) {
      const line = state.winningLine, a = point(...line[0]), b = point(...line[line.length - 1]);
      const progress = effectsOn() ? Math.min(1, (now - victoryAt) / 650) : 1;
      ctx.save(); ctx.strokeStyle = '#e0c88d'; ctx.shadowColor = '#e0c88d'; ctx.shadowBlur = 15; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + (b.x - a.x) * progress, a.y + (b.y - a.y) * progress); ctx.stroke(); ctx.restore();
    }
  }
  function drawStone(x, y, who, ghost = false) {
    const p = point(x, y), r = cellSize() * .397;
    ctx.save();
    if (!ghost) { ctx.shadowColor = '#0009'; ctx.shadowBlur = r * .5; ctx.shadowOffsetY = r * .2; }
    const grad = ctx.createRadialGradient(p.x - r * .32, p.y - r * .38, r * .05, p.x + r * .2, p.y + r * .25, r * 1.2);
    if (who === 1) { grad.addColorStop(0, '#657669'); grad.addColorStop(.25, '#3b5044'); grad.addColorStop(.65, '#1c3026'); grad.addColorStop(1, '#0b1610'); }
    else { grad.addColorStop(0, '#fbf8e9'); grad.addColorStop(.3, '#e8e9d5'); grad.addColorStop(.7, '#c5ceba'); grad.addColorStop(1, '#879b83'); }
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.strokeStyle = who === 1 ? '#8ea78b88' : '#e6e8cbb3'; ctx.lineWidth = .8; ctx.stroke();
    ctx.strokeStyle = who === 1 ? '#a9baa31a' : '#ffffff55'; ctx.beginPath(); ctx.arc(p.x - r * .05, p.y - r * .06, r * .78, Math.PI * 1.07, Math.PI * 1.77); ctx.stroke();
    ctx.restore();
  }
  function drawSeal(seal, now) {
    const p = point(seal.x, seal.y), step = cellSize(), r = step * .4;
    ctx.save(); ctx.translate(p.x, p.y);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, step * .7); glow.addColorStop(0, '#8ed2de28'); glow.addColorStop(1, '#8ed2de00');
    ctx.fillStyle = glow; ctx.fillRect(-step, -step, step * 2, step * 2);
    ctx.strokeStyle = '#8ed2de9f'; ctx.lineWidth = .9;
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r); ctx.moveTo(0, -r * .6); ctx.lineTo(-r * .2, -r * .8); ctx.moveTo(0, -r * .6); ctx.lineTo(r * .2, -r * .8); ctx.stroke();
    }
    ctx.font = `${Math.max(6, size * .012)}px sans-serif`; ctx.textAlign = 'right'; ctx.fillStyle = '#a4d2d8'; ctx.fillText(String(seal.until - state.ply), r * 1.2, r * 1.2); ctx.restore();
  }

  function burst(x, y, type) {
    if (!effectsOn()) return;
    const p = point(x, y), color = E.SKILLS[type]?.color || (type === 'win' ? '#f2d58e' : '#b8c794');
    const count = type === 'thunder' ? 95 : type === 'win' ? 45 : type === 'place' ? 17 : 60;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2, speed = (Math.random() * 2.4 + .4) * (type === 'place' ? .55 : 1.4);
      particles.push({ x: p.x, y: p.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, decay: .009 + Math.random() * .018, r: Math.random() * 2 + .5, color, type });
    }
    particles = particles.slice(-700);
    if (E.SKILLS[type]) sigils.push({ x: p.x, y: p.y, life: 1, color, type });
    waves.push({ x: p.x, y: p.y, r: 4, life: 1, speed: type === 'place' ? 1.3 : 3.3, color, type });
    if (type === 'thunder') {
      for (let n = 0; n < 3; n++) {
        const nodes = [{ x: p.x + (n - 1) * size * .16, y: 0 }];
        for (let i = 1; i < 9; i++) nodes.push({ x: p.x + (Math.random() - .5) * size * .15 * (1 - i / 10), y: p.y * i / 9 });
        nodes.push(p); bolts.push({ nodes, life: 1, color });
      }
      $('boardStage').classList.remove('screen-shake'); void $('boardStage').offsetWidth; $('boardStage').classList.add('screen-shake');
    }
  }
  function drawEffects(dt) {
    fctx.clearRect(0, 0, size, size);
    if (!effectsOn()) return;
    fctx.save(); fctx.globalCompositeOperation = 'lighter';
    for (const s of sigils) {
      s.life -= .009 * dt;
      const t = 1 - s.life, alpha = Math.sin(Math.min(1, t) * Math.PI);
      const r = cellSize() * (2 + t * 1.7);
      if (s.type === 'thunder' && t < .18) {
        fctx.globalAlpha = Math.max(0, .2 - t * 1.1); fctx.fillStyle = '#eadba5'; fctx.fillRect(0, 0, size, size);
      }
      fctx.save(); fctx.translate(s.x, s.y); fctx.rotate(t * (s.type === 'frost' ? -.25 : .35));
      fctx.globalAlpha = alpha * .5; fctx.strokeStyle = s.color; fctx.shadowColor = s.color; fctx.shadowBlur = 9; fctx.lineWidth = .8;
      fctx.beginPath(); fctx.arc(0, 0, r, 0, Math.PI * 2); fctx.stroke();
      fctx.beginPath(); fctx.arc(0, 0, r * .83, 0, Math.PI * 2); fctx.stroke();
      const sides = s.type === 'frost' ? 6 : 8;
      fctx.beginPath();
      for (let i = 0; i <= sides; i++) {
        const angle = i * Math.PI * 2 / sides - Math.PI / 2, x = Math.cos(angle) * r * .79, y = Math.sin(angle) * r * .79;
        i ? fctx.lineTo(x, y) : fctx.moveTo(x, y);
      }
      fctx.stroke();
      for (let i = 0; i < 48; i++) {
        const a = i * Math.PI / 24, inner = i % 6 === 0 ? .9 : .96;
        fctx.beginPath(); fctx.moveTo(Math.cos(a) * r * inner, Math.sin(a) * r * inner); fctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); fctx.stroke();
      }
      fctx.shadowBlur = 0;
      const runes = s.type === 'frost' ? '霜寒玄冰封雪' : '乾坤震巽坎离艮兑';
      fctx.font = `${Math.max(9, r * .1)}px serif`; fctx.textAlign = 'center'; fctx.textBaseline = 'middle';
      fctx.fillStyle = s.color; fctx.globalAlpha = alpha * .7;
      for (let i = 0; i < runes.length; i++) {
        const a = i * Math.PI * 2 / runes.length - Math.PI / 2;
        fctx.fillText(runes[i], Math.cos(a) * r * 1.12, Math.sin(a) * r * 1.12);
      }
      if (s.type === 'frost') {
        fctx.globalAlpha = alpha * .6;
        for (let i = 0; i < 6; i++) {
          fctx.rotate(Math.PI / 3); fctx.beginPath(); fctx.moveTo(0, 0); fctx.lineTo(0, -r * .7);
          fctx.moveTo(0, -r * .4); fctx.lineTo(-r * .18, -r * .6); fctx.moveTo(0, -r * .4); fctx.lineTo(r * .18, -r * .6); fctx.stroke();
        }
      }
      fctx.restore();
      if (s.type === 'twin' && t < .45) {
        const travel = Math.min(1, t / .35);
        for (const offset of [-.15, .15]) {
          const startX = s.x + size * offset, startY = -size * .1;
          const x = startX + (s.x - startX) * travel, y = startY + (s.y - startY) * travel;
          const tail = fctx.createLinearGradient(x, y - size * .3, x, y); tail.addColorStop(0, '#c5a0f400'); tail.addColorStop(1, '#dec5ff');
          fctx.strokeStyle = tail; fctx.globalAlpha = alpha; fctx.lineWidth = 2;
          fctx.beginPath(); fctx.moveTo(x + (startX - s.x) * .3, y - size * .3); fctx.lineTo(x, y); fctx.stroke();
          fctx.fillStyle = '#fff1ff'; fctx.beginPath(); fctx.arc(x, y, 2.5, 0, Math.PI * 2); fctx.fill();
        }
      }
    }
    for (const w of waves) {
      w.r += w.speed * dt; w.life -= .023 * dt;
      fctx.globalAlpha = Math.max(0, w.life * .6); fctx.strokeStyle = w.color; fctx.lineWidth = w.type === 'thunder' ? 2 : .8;
      fctx.beginPath(); fctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); fctx.stroke();
      if (w.type !== 'place') { fctx.lineWidth = .5; fctx.beginPath(); fctx.arc(w.x, w.y, w.r * .65, 0, Math.PI * 2); fctx.stroke(); }
    }
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(.98, dt); p.vy *= Math.pow(.98, dt); p.life -= p.decay * dt;
      fctx.globalAlpha = Math.max(0, p.life); fctx.fillStyle = p.color;
      if (p.type === 'frost' || p.type === 'thunder') { fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.life * 5); fctx.fillRect(-p.r, -p.r, p.r * 1.5, p.r * 3); fctx.restore(); }
      else { fctx.beginPath(); fctx.arc(p.x, p.y, p.r * Math.max(.1, p.life), 0, Math.PI * 2); fctx.fill(); }
    }
    for (const bolt of bolts) {
      bolt.life -= .055 * dt; fctx.globalAlpha = Math.max(0, bolt.life); fctx.strokeStyle = '#fff5d5'; fctx.shadowColor = bolt.color; fctx.shadowBlur = 16; fctx.lineWidth = 2;
      fctx.beginPath(); bolt.nodes.forEach((p, i) => i ? fctx.lineTo(p.x, p.y) : fctx.moveTo(p.x, p.y)); fctx.stroke();
    }
    fctx.restore(); particles = particles.filter(p => p.life > 0); waves = waves.filter(w => w.life > 0); bolts = bolts.filter(b => b.life > 0); sigils = sigils.filter(s => s.life > 0);
  }
  function drawAmbient(now) {
    actx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (!effectsOn()) return;
    for (const p of dust) {
      p.y -= p.speed; if (p.y < 0) p.y = window.innerHeight;
      actx.globalAlpha = .13 + (Math.sin(now / 2000 + p.phase) + 1) * .15;
      actx.fillStyle = '#b9be8d'; actx.beginPath(); actx.arc(p.x + Math.sin(now / 6000 + p.phase) * 12, p.y, p.r, 0, Math.PI * 2); actx.fill();
    }
    actx.globalAlpha = 1;
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || now - lastFrame < 30) return;
    const dt = Math.min(3, (now - lastFrame) / 16.67); lastFrame = now;
    if (dirty || (effectsOn() && (hint || state.winningLine.length && now - victoryAt < 1000))) { drawBoard(now); dirty = false; }
    if (particles.length || waves.length || bolts.length || sigils.length) drawEffects(dt); else if (fx.width) fctx.clearRect(0, 0, size, size);
    if (now - lastAmbient > 45) { drawAmbient(now); lastAmbient = now; }
  }
  setInterval(() => { if (startedAt) $('timer').textContent = timeText((endedAt || Date.now()) - startedAt); }, 1000);
  newGame(); resize(); requestAnimationFrame(frame);
})();
