import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, compareAll, REPOSITORY_WORKLOAD, roundRobin, fcfs, srtf, mlfq } from '../assets/js/os/scheduling.js';

// Textbook example (Silberschatz): P1=24, P2=3, P3=3 all at t=0.
const TEXTBOOK = [
  { id: 'P1', arrival: 0, burst: 24, priority: 1 },
  { id: 'P2', arrival: 0, burst: 3, priority: 1 },
  { id: 'P3', arrival: 0, burst: 3, priority: 1 },
];

test('FCFS textbook average waiting time is 17', () => {
  assert.equal(schedule('fcfs', TEXTBOOK).avgWaiting, 17);
});

test('SJF textbook average waiting time is 3', () => {
  assert.equal(schedule('sjf', TEXTBOOK).avgWaiting, 3);
});

test('Round Robin q=4 textbook average waiting time is 17/3', () => {
  assert.ok(Math.abs(schedule('rr', TEXTBOOK, { quantum: 4 }).avgWaiting - 17 / 3) < 1e-9);
});

test('SRTF textbook example (arrivals 0,1,2,3) gives average waiting 6.5', () => {
  const jobs = [
    { id: 'P1', arrival: 0, burst: 8 }, { id: 'P2', arrival: 1, burst: 4 },
    { id: 'P3', arrival: 2, burst: 9 }, { id: 'P4', arrival: 3, burst: 5 },
  ];
  assert.equal(schedule('srtf', jobs).avgWaiting, 6.5);
});

test('every algorithm runs each job for exactly its burst and never before arrival', () => {
  for (const r of compareAll(REPOSITORY_WORKLOAD)) {
    for (const j of REPOSITORY_WORKLOAD) {
      const row = r.rows.find((x) => x.id === j.id);
      assert.ok(row.start >= j.arrival, `${r.key} ${j.id}`);
      assert.equal(row.turnaround - row.waiting, j.burst);
    }
    const busy = r.segments.filter((s) => s.id).reduce((s, x) => s + x.end - x.start, 0);
    assert.equal(busy, REPOSITORY_WORKLOAD.reduce((s, j) => s + j.burst, 0));
  }
});

test('idle CPU is recorded when nothing has arrived', () => {
  const t = fcfs([{ id: 'A', arrival: 3, burst: 2 }]);
  assert.deepEqual(t, [null, null, null, 'A', 'A']);
});

test('MLQ gives interactive jobs a lower response time than FCFS', () => {
  const m = schedule('mlq', REPOSITORY_WORKLOAD);
  const f = schedule('fcfs', REPOSITORY_WORKLOAD);
  assert.ok(m.interactiveResponse < f.interactiveResponse);
});

test('MLFQ demotes a long job and keeps short jobs in the top queue', () => {
  const t = mlfq([{ id: 'L', arrival: 0, burst: 10 }, { id: 'S', arrival: 1, burst: 1 }], { quanta: [2, 4, Infinity] });
  assert.equal(t.levels[t.indexOf('S')], 0);
  assert.equal(Math.max(...t.levels.filter((_, i) => t[i] === 'L')), 2);
});

test('SRTF and RR are pre-emptive', () => {
  assert.notEqual(srtf(TEXTBOOK.map((j, i) => ({ ...j, arrival: i }))).join(), fcfs(TEXTBOOK.map((j, i) => ({ ...j, arrival: i }))).join());
  assert.ok(roundRobin(TEXTBOOK, 4).slice(0, 4).every((x) => x === 'P1'));
});
