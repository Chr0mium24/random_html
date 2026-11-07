/* Pure game rules. Kept independent of rendering so every action can be verified. */
(function (root) {
  'use strict';
  const SIZE = 15;
  const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const SKILLS = Object.freeze({
    thunder: { name: '雷霆破阵', cost: 45, cooldown: 4, color: '#e1bc72' },
    frost: { name: '冰封禁域', cost: 35, cooldown: 3, color: '#9bdde6' },
    twin: { name: '星陨连珠', cost: 60, cooldown: 5, color: '#c5a0f4' },
    oracle: { name: '天机洞察', cost: 25, cooldown: 3, color: '#c5d998' }
  });
  function player() { return { energy: 70, turns: 0, casts: 0, ready: { thunder: 0, frost: 0, twin: 0, oracle: 0 } }; }
  function create(settings = {}) {
    return { board: Array.from({ length: SIZE }, () => Array(SIZE).fill(0)), players: [null, player(), player()],
      turn: 1, ply: 0, moves: 0, freezes: [], pending: 0, skillUsed: false, ended: false,
      winner: 0, winningLine: [], last: null, settings: { mode: 'ai', difficulty: 'normal', skills: true, effects: true, ...settings } };
  }
  function inside(x, y) { return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < SIZE && y < SIZE; }
  function frozen(s, x, y) { return s.freezes.some(f => f.x === x && f.y === y && f.until > s.ply); }
  function legal(s, x, y) { return inside(x, y) && s.board[y][x] === 0 && !frozen(s, x, y); }
  function cooldown(s, skill, who = s.turn) { return Math.max(0, s.players[who].ready[skill] - s.players[who].turns); }
  function skillError(s, skill) {
    if (!SKILLS[skill]) return '未知秘术';
    if (s.ended) return '此局已定，请开启新局';
    if (!s.settings.skills) return '传统模式未开启秘术';
    if (s.skillUsed) return '本回合已施展秘术';
    if (cooldown(s, skill)) return `秘术尚需冷却 ${cooldown(s, skill)} 回合`;
    if (s.players[s.turn].energy < SKILLS[skill].cost) return '灵力不足，静候星蕴恢复';
    return '';
  }
  function lineAt(s, x, y, who) {
    for (const [dx, dy] of DIRECTIONS) {
      const line = [[x, y]];
      for (const sign of [-1, 1]) {
        let nx = x + dx * sign, ny = y + dy * sign;
        while (inside(nx, ny) && s.board[ny][nx] === who) {
          if (sign < 0) line.unshift([nx, ny]); else line.push([nx, ny]);
          nx += dx * sign; ny += dy * sign;
        }
      }
      if (line.length >= 5) return line;
    }
    return [];
  }
  function finish(s) {
    const p = s.players[s.turn];
    p.energy = Math.min(100, p.energy + 10);
    p.turns++; s.ply++; s.turn = 3 - s.turn; s.skillUsed = false; s.pending = 0;
    s.freezes = s.freezes.filter(f => f.until > s.ply);
    // A fully occupied board is a draw. Temporarily frozen vacancies expire naturally.
    if (s.board.every(row => row.every(Boolean))) { s.ended = true; s.winner = 0; }
    // If every vacancy is sealed, pass turns (and tick the seals) to avoid a deadlock.
    let guard = 0;
    while (!s.ended && !s.board.some((row, y) => row.some((v, x) => !v && !frozen(s, x, y))) && guard++ < 6) {
      s.players[s.turn].energy = Math.min(100, s.players[s.turn].energy + 10);
      s.players[s.turn].turns++; s.ply++; s.turn = 3 - s.turn;
      s.freezes = s.freezes.filter(f => f.until > s.ply);
    }
  }
  function play(s, x, y) {
    if (s.ended) return { ok: false, error: '此局已定，请开启新局' };
    if (!legal(s, x, y)) return { ok: false, error: frozen(s, x, y) ? '此处已被冰封，暂不可落子' : '请落在空置的星盘交点上' };
    const who = s.turn;
    s.board[y][x] = who; s.moves++; s.last = { x, y, who };
    const line = lineAt(s, x, y, who);
    if (line.length) { s.ended = true; s.winner = who; s.winningLine = line; s.pending = 0; return { ok: true, who, win: true, endedTurn: true }; }
    if (s.pending > 0) s.pending--;
    if (s.pending > 0 && s.board.some((r, yy) => r.some((v, xx) => !v && !frozen(s, xx, yy)))) return { ok: true, who, endedTurn: false };
    finish(s);
    return { ok: true, who, endedTurn: true };
  }
  function cast(s, skill, x, y) {
    const error = skillError(s, skill);
    if (error) return { ok: false, error };
    if (skill === 'thunder' && (!inside(x, y) || s.board[y][x] !== 3 - s.turn)) return { ok: false, error: '请选择一枚敌方棋子' };
    if (skill === 'frost' && !legal(s, x, y)) return { ok: false, error: '请选择未被冰封的空置交点' };
    const who = s.turn, p = s.players[who];
    p.energy -= SKILLS[skill].cost; p.casts++; p.ready[skill] = p.turns + SKILLS[skill].cooldown + 1;
    s.skillUsed = true;
    if (skill === 'thunder') { s.board[y][x] = 0; if (s.last?.x === x && s.last?.y === y) s.last = null; finish(s); }
    if (skill === 'frost') { s.freezes.push({ x, y, until: s.ply + 5, who }); finish(s); }
    if (skill === 'twin') s.pending = 2;
    return { ok: true, who, endedTurn: skill === 'thunder' || skill === 'frost' };
  }
  function candidates(s) {
    const set = new Set();
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (s.board[y][x]) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (legal(s, x + dx, y + dy)) set.add((y + dy) * SIZE + x + dx);
    }
    if (!set.size) for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (legal(s, x, y)) set.add(y * SIZE + x);
    return [...set].map(v => ({ x: v % SIZE, y: Math.floor(v / SIZE) }));
  }
  function evaluate(s, x, y, who) {
    if (!legal(s, x, y)) return -Infinity;
    let score = 0, threes = 0, fours = 0;
    for (const [dx, dy] of DIRECTIONS) {
      let count = 1, open = 0;
      for (const sign of [-1, 1]) {
        let nx = x + dx * sign, ny = y + dy * sign;
        while (inside(nx, ny) && s.board[ny][nx] === who) { count++; nx += dx * sign; ny += dy * sign; }
        if (legal(s, nx, ny)) open++;
      }
      if (count >= 5) return 10000000;
      if (count === 4 && open) { score += open === 2 ? 160000 : 30000; fours++; }
      else if (count === 3 && open) { score += open === 2 ? 12000 : 900; if (open === 2) threes++; }
      else if (count === 2 && open) score += open === 2 ? 600 : 90;
      else if (open) score += open === 2 ? 24 : 5;
      // Recognize split formations such as XX_X and X_XX, in five-cell windows.
      for (let offset = -4; offset <= 0; offset++) {
        let mine = 0, free = 0, blocked = false;
        for (let n = 0; n < 5; n++) {
          const nx = x + (offset + n) * dx, ny = y + (offset + n) * dy;
          if (!inside(nx, ny) || frozen(s, nx, ny) || s.board[ny][nx] === 3 - who) { blocked = true; break; }
          if ((nx === x && ny === y) || s.board[ny][nx] === who) mine++; else free++;
        }
        if (!blocked && free) score += [0, 1, 15, 180, 4000][mine] || 0;
      }
    }
    if (threes >= 2) score += 60000;
    if (fours && threes) score += 90000;
    return score + (14 - Math.abs(x - 7) - Math.abs(y - 7)) * 2;
  }
  function immediate(s, who) { return candidates(s).filter(c => evaluate(s, c.x, c.y, who) >= 10000000); }
  function best(s, who = s.turn, difficulty = 'normal') {
    const options = candidates(s);
    if (!options.length) return null;
    const ranked = options.map(c => {
      const attack = evaluate(s, c.x, c.y, who), defense = evaluate(s, c.x, c.y, 3 - who);
      return { ...c, attack, defense, score: attack >= 10000000 ? 1e12 : defense >= 10000000 ? 1e11 + attack : attack + defense * (difficulty === 'hard' ? 1.12 : .92) };
    }).sort((a, b) => b.score - a.score);
    if (difficulty === 'easy' && ranked[0].score < 1e11) return ranked[Math.floor(Math.random() * Math.min(4, ranked.length))];
    if (difficulty === 'hard' && ranked[0].score < 1e11) {
      // Two-ply threat search for the strongest candidates.
      for (const c of ranked.slice(0, 8)) {
        s.board[c.y][c.x] = who;
        const threats = immediate(s, who).length;
        let danger = 0;
        for (const reply of candidates(s)) danger = Math.max(danger, evaluate(s, reply.x, reply.y, 3 - who));
        s.board[c.y][c.x] = 0;
        c.score += (threats >= 2 ? 500000 : threats * 45000) - danger * .3;
      }
      ranked.sort((a, b) => b.score - a.score);
    }
    return ranked[0];
  }
  const api = Object.freeze({ SIZE, DIRECTIONS, SKILLS, create, inside, frozen, legal, cooldown, skillError, lineAt, play, cast, candidates, evaluate, immediate, best });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CelestialEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
