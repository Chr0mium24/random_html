const assert = require('node:assert/strict');
const E = require('../engine.js');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function game() { return E.create({ mode: 'local' }); }
test('initial state and legal moves', () => {
  const s = game(); assert.equal(s.players[1].energy, 70); assert.equal(s.turn, 1);
  assert.equal(E.play(s, 7, 7).ok, true); assert.equal(s.turn, 2); assert.equal(s.players[1].energy, 80);
  assert.equal(E.play(s, 7, 7).ok, false); assert.equal(E.play(s, -1, 0).ok, false);
});
for (const [dx, dy] of E.DIRECTIONS) test(`five-in-a-row in direction ${dx},${dy}`, () => {
  const s = game(); const start = dy < 0 ? 9 : 4;
  for (let n = 0; n < 4; n++) s.board[start + n * dy][4 + n * dx] = 1;
  const result = E.play(s, 4 + 4 * dx, start + 4 * dy);
  assert.equal(result.win, true); assert.equal(s.winner, 1); assert.equal(s.winningLine.length, 5);
  assert.equal(E.play(s, 0, 0).ok, false);
});
test('overline wins in freestyle rules', () => {
  const s = game(); for (const x of [2, 3, 4, 6, 7]) s.board[7][x] = 1;
  E.play(s, 5, 7); assert.equal(s.winningLine.length, 6);
});
test('thunder removes only opposing stones and ends the turn', () => {
  const s = game(); s.board[7][7] = 2; s.board[6][6] = 1;
  const before = structuredClone(s); assert.equal(E.cast(s, 'thunder', 6, 6).ok, false); assert.deepEqual(s, before);
  assert.equal(E.cast(s, 'thunder', 7, 7).ok, true); assert.equal(s.board[7][7], 0);
  assert.equal(s.turn, 2); assert.equal(s.players[1].energy, 35); assert.equal(E.cooldown(s, 'thunder', 1), 4);
});
test('frost seals a vacancy for four subsequent actions, then expires', () => {
  const s = game(); E.cast(s, 'frost', 7, 7);
  for (let n = 0; n < 4; n++) {
    assert.equal(E.frozen(s, 7, 7), true); assert.equal(E.play(s, 7, 7).ok, false);
    E.play(s, n, 0);
  }
  assert.equal(E.frozen(s, 7, 7), false); assert.equal(E.legal(s, 7, 7), true);
});
test('twin retains turn until the second stone', () => {
  const s = game(); E.cast(s, 'twin');
  assert.equal(s.players[1].energy, 10); assert.equal(s.pending, 2);
  assert.equal(E.play(s, 7, 7).endedTurn, false); assert.equal(s.turn, 1);
  assert.equal(E.play(s, 7, 7).ok, false); assert.equal(s.pending, 1);
  assert.equal(E.play(s, 8, 7).endedTurn, true); assert.equal(s.turn, 2); assert.equal(s.players[1].energy, 20);
});
test('twin stops immediately if the first stone wins', () => {
  const s = game(); for (let x = 3; x < 7; x++) s.board[7][x] = 1;
  E.cast(s, 'twin'); E.play(s, 7, 7); assert.equal(s.ended, true); assert.equal(s.pending, 0);
});
test('oracle keeps the move and limits skills to one per turn', () => {
  const s = game(); E.cast(s, 'oracle'); assert.equal(s.turn, 1); assert.equal(s.players[1].energy, 45);
  assert.equal(E.cast(s, 'frost', 7, 7).ok, false); E.play(s, 7, 7); assert.equal(s.players[1].energy, 55);
});
test('insufficient energy and classic mode do not mutate state', () => {
  const s = game(); s.players[1].energy = 10; const before = structuredClone(s);
  assert.equal(E.cast(s, 'twin').ok, false); assert.deepEqual(s, before);
  s.settings.skills = false; s.players[1].energy = 100; assert.equal(E.cast(s, 'oracle').ok, false);
});
test('cooldowns count the caster actions, not opponent actions', () => {
  const s = game(); E.cast(s, 'oracle'); E.play(s, 0, 0);
  assert.equal(E.cooldown(s, 'oracle', 1), 3);
  for (let n = 0; n < 3; n++) {
    E.play(s, n * 2, 2); assert.equal(E.cooldown(s, 'oracle', 1), 3 - n);
    E.play(s, n * 2 + 2, 0);
  }
  E.play(s, 10, 2); assert.equal(E.cooldown(s, 'oracle', 1), 0);
});
test('AI takes a win before blocking and blocks immediate threats', () => {
  const s = game(); for (let x = 4; x < 8; x++) s.board[6][x] = 1;
  let move = E.best(s, 2); assert.ok([3, 8].includes(move.x)); assert.equal(move.y, 6);
  for (let x = 2; x < 6; x++) s.board[2][x] = 2;
  move = E.best(s, 2); assert.equal(move.y, 2); assert.ok([1, 6].includes(move.x));
});
test('AI respects frozen intersections and leaves the state unchanged', () => {
  const s = game(); s.board[7][7] = 1; s.freezes.push({ x: 8, y: 7, until: 5, who: 1 });
  const before = structuredClone(s); const move = E.best(s, 2, 'hard');
  assert.equal(E.legal(s, move.x, move.y), true); assert.deepEqual(s, before);
});
test('energy never exceeds 100', () => {
  const s = game(); s.players[1].energy = 99; E.play(s, 7, 7); assert.equal(s.players[1].energy, 100);
});
test('fully occupied board ends in a draw', () => {
  const s = game(); for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) s.board[y][x] = (Math.floor(x / 2) + y) % 2 + 1;
  s.board[0][0] = 0; s.turn = 1;
  E.play(s, 0, 0); assert.equal(s.ended, true); assert.equal(s.winner, 0);
});
test('fully sealed remaining vacancy automatically advances until available', () => {
  const s = game(); for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) s.board[y][x] = (Math.floor(x / 2) + y) % 2 + 1;
  s.board[0][0] = s.board[0][1] = 0; s.freezes = [{ x: 0, y: 0, until: 5, who: 1 }];
  s.turn = 1; E.play(s, 1, 0); assert.equal(s.ended, false); assert.equal(s.ply, 5); assert.equal(E.legal(s, 0, 0), true);
});
console.log(`\n${checks} rule checks passed.`);
