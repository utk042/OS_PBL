import { esc, fmt, pageHead, table, tiles, $, segmented, onSegment, readForm, badge, bars } from './dom.js';
import { boundedBuffer, diningPhilosophers, readersWriters, sleepingBarber, manySeeds } from '../os/problems.js';

let tab = 'buffer';

const TABS = {
  buffer: {
    title: 'Bounded buffer: the upload queue',
    intro: 'Uploader threads (producers) put documents into a fixed-size queue; indexer threads (consumers) take them out. Semaphores <code>empty</code>, <code>full</code> and <code>mutex</code>, or a monitor with condition variables <code>notFull</code>/<code>notEmpty</code>, keep the queue consistent. The unsynchronised version busy-waits on a shared count that is updated with separate read and write steps.',
    fields: [['producers', 'Uploaders', 3], ['consumers', 'Indexers', 2], ['size', 'Queue size', 3], ['itemsEach', 'Docs per uploader', 4]],
    variants: [['semaphore', 'Semaphores'], ['monitor', 'Monitor'], ['unsynchronized', 'No synchronisation']],
    key: 'impl',
    run: (o) => boundedBuffer(o),
    summary: (r) => tiles([[r.produced, 'documents uploaded'], [r.consumed, 'documents indexed'], [r.lost, 'lost (never indexed)'], [r.duplicates + r.emptyReads, 'duplicate / empty reads'], [r.maxOccupancy, 'max items in queue'], [r.finished ? 'yes' : 'no (hung)', 'all threads finished']]) + badge(r.correct, 'Every document indexed exactly once', 'Queue corrupted: documents lost or the run hung'),
    batch: (rs) => ({ 'runs with an error': rs.filter((r) => !r.correct).length, 'documents lost (total)': rs.reduce((s, r) => s + r.lost, 0), 'runs that hung': rs.filter((r) => !r.finished).length }),
  },
  rw: {
    title: 'Readers–writers: searches and index updates',
    intro: 'Many search threads may read the search index together, but an index update needs it alone. Readers preference lets new readers keep entering while a writer waits; writers preference blocks new readers once a writer is waiting; the fair version makes everyone pass one FIFO turnstile.',
    fields: [['readers', 'Search threads', 6], ['writers', 'Index writers', 2], ['opsEach', 'Operations each', 4]],
    variants: [['readers', 'Readers preference'], ['writers', 'Writers preference'], ['fair', 'Fair (FIFO)']],
    key: 'variant',
    run: (o) => readersWriters(o),
    summary: (r) => tiles([[r.reads, 'searches'], [r.writes, 'index updates'], [fmt(r.readerAvgWait, 1), 'avg search wait'], [fmt(r.writerAvgWait, 1), 'avg update wait'], [r.writerMaxWait, 'max update wait'], [r.violations, 'exclusion violations']]),
    batch: (rs) => ({ 'avg search wait': avg(rs, 'readerAvgWait'), 'avg update wait': avg(rs, 'writerAvgWait'), 'worst update wait (mean of runs)': avg(rs, 'writerMaxWait'), 'exclusion violations': rs.reduce((s, r) => s + r.violations, 0) }),
  },
  dining: {
    title: 'Dining philosophers: index-merge workers',
    intro: 'Five merge workers sit in a ring; each merge needs the two adjacent index shards locked. If every worker locks its left shard first, all can hold one shard and wait for the next: a circular wait. Three fixes: lock the lower-numbered shard first (resource ordering), let at most four workers try at once (a waiter semaphore), or make odd workers pick right first (asymmetry).',
    fields: [['n', 'Workers', 5], ['meals', 'Merges each', 3]],
    variants: [['naive', 'Left then right'], ['ordered', 'Resource ordering'], ['waiter', 'Waiter (n−1)'], ['asymmetric', 'Asymmetric']],
    key: 'strategy',
    run: (o) => diningPhilosophers(o),
    summary: (r) => tiles([[r.meals, 'merges completed'], [r.concurrentMax, 'max merges at once'], [r.steps, 'scheduler steps']]) + badge(!r.deadlock, 'No deadlock', `Deadlock: ${r.deadlock ? r.deadlock.map((d) => `${d.proc} waits for ${d.waitingFor}`).join(', ') : ''}`),
    batch: (rs) => ({ 'runs that deadlocked': rs.filter((r) => r.deadlock).length, 'avg merges completed': avg(rs, 'meals') }),
  },
  barber: {
    title: 'Sleeping barber: the PDF-conversion worker',
    intro: 'One conversion worker serves jobs from a waiting area with a few slots. With nothing to do it sleeps on the <code>customers</code> semaphore; an arriving job wakes it, or is rejected if every slot is taken.',
    fields: [['chairs', 'Waiting slots', 3], ['customers', 'Jobs arriving', 12], ['serviceTime', 'Conversion time', 2], ['meanGap', 'Mean gap between jobs', 10]],
    variants: [],
    key: null,
    run: (o) => sleepingBarber(o),
    summary: (r) => tiles([[r.served, 'jobs converted'], [r.turnedAway, 'rejected (queue full)'], [r.barberSleeps, 'times the worker slept'], [fmt(r.avgWait, 1), 'avg wait for the worker']]) + badge(!r.deadlock, 'No deadlock', 'Deadlock'),
    batch: (rs) => ({ 'avg converted': avg(rs, 'served'), 'avg rejected': avg(rs, 'turnedAway'), 'avg wait': avg(rs, 'avgWait') }),
  },
};

const avg = (rs, k) => fmt(rs.reduce((s, r) => s + r[k], 0) / rs.length, 1);
const variantOf = {};

export function render(root) {
  root.innerHTML = `
  ${pageHead('Unit 3 · Synchronisation', 'Classical problems of synchronisation', 'Each problem runs on a small concurrency runtime: threads are generators, every <code>yield</code> is a point where a seeded scheduler may switch threads, and semaphores and monitors block and wake threads as the OS would. The same seed always gives the same interleaving; “Run 200 seeds” tries 200 different interleavings.')}
  <div class="card">${segmented('tab', [['buffer', 'Bounded buffer'], ['rw', 'Readers–writers'], ['dining', 'Dining philosophers'], ['barber', 'Sleeping barber']], tab)}</div>
  <div id="body"></div>`;
  onSegment(root, 'tab', (v) => { tab = v; draw(root); });
  draw(root);
}

function draw(root) {
  const T = TABS[tab];
  variantOf[tab] = variantOf[tab] || (T.variants[0] && T.variants[0][0]);
  $(root, '#body').innerHTML = `
    <div class="card">
      <h2>${T.title}</h2><p class="sub">${T.intro}</p>
      ${T.variants.length ? `<div class="controls"><div class="field">Solution ${segmented('variant', T.variants, variantOf[tab])}</div></div>` : ''}
      <div class="controls" id="f">
        ${T.fields.map(([k, l, v]) => `<label class="field">${l}<input data-k="${k}" type="number" min="1" max="20" value="${v}"></label>`).join('')}
        <label class="field">Seed<input data-k="seed" type="number" min="1" value="1"></label>
        <button id="many">Run 200 seeds</button>
      </div>
      <div id="res"></div>
    </div>
    <div class="card" id="batch"></div>
    <div class="card"><h2>Event trace</h2><p class="sub">Clock tick, thread and what it did: blocking on a semaphore, waking another thread, waiting on a condition.</p><div class="trace" id="trace"></div></div>`;

  const opts = () => ({ ...readForm($(root, '#f')), ...(T.key ? { [T.key]: variantOf[tab] } : {}) });
  const run = () => {
    const r = T.run(opts());
    $(root, '#res').innerHTML = T.summary(r);
    const ev = r.trace.slice(0, 400);
    $(root, '#trace').innerHTML = table([{ key: 't', label: 'Tick', num: true }, { key: 'proc', label: 'Thread' }, { key: 'kind', label: 'Event' }, { key: 'detail', label: 'Detail' }], ev)
      + (r.trace.length > ev.length ? `<p class="note">Showing the first ${ev.length} of ${r.trace.length} events.</p>` : '');
  };
  const many = () => {
    const variants = T.variants.length ? T.variants : [[null, 'Classic solution']];
    const rows = variants.map(([v, label]) => {
      const rs = manySeeds(T.run, { ...opts(), ...(T.key ? { [T.key]: v } : {}) }, 200);
      return { label, ...T.batch(rs) };
    });
    const cols = Object.keys(rows[0]).filter((k) => k !== 'label');
    const first = cols[0];
    $(root, '#batch').innerHTML = `<h2>200 interleavings of each solution</h2>
      ${bars(rows, { value: (d) => Number(d[first]), format: (v) => fmt(v, 1) })}
      <p class="sub" style="margin-top:6px">Bars: ${esc(first)}.</p>
      ${table([{ key: 'label', label: 'Solution' }, ...cols.map((c) => ({ key: c, label: c, num: true }))], rows)}`;
  };
  if (T.variants.length) onSegment(root, 'variant', (v) => { variantOf[tab] = v; run(); });
  $(root, '#f').addEventListener('input', run);
  $(root, '#many').addEventListener('click', many);
  run();
  many();
}
