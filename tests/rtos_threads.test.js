import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KIOSK_TASKS, OVERLOADED_TASKS, simulateRT, utilization, liuLaylandBound, responseTimeAnalysis, simulateInversion } from '../assets/js/os/rtos.js';
import { simulateThreads, makeRequests } from '../assets/js/os/threads.js';

test('Liu-Layland bound for n=3 is about 0.780', () => {
  assert.ok(Math.abs(liuLaylandBound(3) - 0.7798) < 1e-3);
});

test('kiosk task set: RM and EDF meet every deadline', () => {
  assert.equal(simulateRT(KIOSK_TASKS, 'rm').misses.length, 0);
  assert.equal(simulateRT(KIOSK_TASKS, 'edf').misses.length, 0);
  assert.ok(responseTimeAnalysis(KIOSK_TASKS).every((r) => r.ok));
});

test('overloaded set (U<=1): RM misses deadlines, EDF does not', () => {
  assert.ok(utilization(OVERLOADED_TASKS) <= 1);
  assert.ok(simulateRT(OVERLOADED_TASKS, 'rm').misses.length > 0);
  assert.equal(simulateRT(OVERLOADED_TASKS, 'edf').misses.length, 0);
  assert.ok(responseTimeAnalysis(OVERLOADED_TASKS).some((r) => !r.ok));
});

test('priority inheritance shortens the high-priority task response', () => {
  const none = simulateInversion(undefined, 'none').result.H.finish;
  const inh = simulateInversion(undefined, 'inherit').result.H.finish;
  assert.ok(inh < none);
});

test('single-threaded server takes the sum of all phases', () => {
  const r = simulateThreads('single', { requests: makeRequests(4, { cpu1: 2, io: 6, cpu2: 1 }) });
  assert.equal(r.makespan, 36);
});

test('many-to-one blocks like a single thread; one-to-one overlaps I/O', () => {
  const opts = { requests: makeRequests(8), cores: 4 };
  assert.equal(simulateThreads('manyToOne', opts).makespan, simulateThreads('single', opts).makespan);
  assert.ok(simulateThreads('oneToOne', opts).makespan < simulateThreads('single', opts).makespan / 3);
  assert.ok(simulateThreads('process', opts).makespan > simulateThreads('oneToOne', opts).makespan);
});
