import { esc, fmt, pageHead, table, bars, tiles, $, readForm } from './dom.js';
import { STRATEGIES, makeWorkload, simulateTransactions, compareStrategies } from '../os/dbcase.js';

export function render(root) {
  root.innerHTML = `
  ${pageHead('Unit 3 · Case study', 'Deadlock handling in database transaction managers', 'The repository keeps its metadata in a relational database. Approving a submission locks the paper row and then the author row, while editing an author profile locks them in the opposite order, a classic deadlock. This page replays the same transactions under strict two-phase locking with the strategies used by MySQL InnoDB and Oracle and with the textbook timestamp schemes.')}
  <div class="card">
    <div class="controls" id="f">
      <label class="field">Transactions<input data-k="count" type="number" min="5" max="200" value="40"></label>
      <label class="field">Arrivals per tick<input data-k="perTick" type="number" min="1" max="6" value="2"></label>
      <label class="field">Hot papers<input data-k="hotPapers" type="number" min="1" max="20" value="3"></label>
      <label class="field">Authors<input data-k="authors" type="number" min="1" max="20" value="3"></label>
      <label class="field">Lock wait timeout<input data-k="timeout" type="number" min="1" max="50" value="6"></label>
      <label class="field">Seed<input data-k="seed" type="number" min="1" value="7"></label>
      <label class="field">Log for<select data-k="strategy">${Object.entries(STRATEGIES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
    </div>
  </div>
  <div class="card" id="cmp"></div>
  <div class="card" id="avg"></div>
  <div class="card" id="log"></div>
  <div class="card">
    <h2>What the real systems do</h2>
    <div class="table-wrap"><table>
      <tr><th>System</th><th>Mechanism</th><th>Victim / result</th></tr>
      <tr><td>MySQL InnoDB</td><td>Wait-for graph checked when a lock wait starts (<code>innodb_deadlock_detect</code>); <code>innodb_lock_wait_timeout</code> (default 50 s) as a fallback.</td><td>Rolls back the “smallest” transaction (fewest rows locked or changed) with ERROR 1213; the application retries.</td></tr>
      <tr><td>Oracle Database</td><td>Detects deadlocks automatically.</td><td>Raises ORA-00060 for one waiting statement and rolls back that statement; the application must roll back or retry.</td></tr>
      <tr><td>Wait-die / wound-wait</td><td>Avoidance with transaction timestamps; used in distributed databases.</td><td>Always aborts the younger transaction, which restarts with its original timestamp so it cannot starve.</td></tr>
      <tr><td>Ordered locking</td><td>Prevention: every transaction locks rows in one global order.</td><td>No deadlock is possible, but the order must be known in advance.</td></tr>
    </table></div>
    <p class="note" style="margin-top:12px">Banker’s algorithm is not used by databases: transactions do not declare their maximum needs in advance and there are millions of lockable rows. Databases accept that deadlocks happen and make them cheap to detect and recover from.</p>
  </div>`;

  const run = () => {
    const f = readForm($(root, '#f'));
    const w = makeWorkload({ count: f.count, perTick: f.perTick, hotPapers: f.hotPapers, authors: f.authors, seed: f.seed });
    const rows = compareStrategies(w, { timeout: f.timeout });
    const best = rows.reduce((b, x, i) => (x.makespan < rows[b].makespan ? i : b), 0);
    $(root, '#cmp').innerHTML = `<h2>This workload (seed ${f.seed})</h2>
      <p class="sub">${w.length} transactions. Time in lock-manager ticks; “wasted operations” are lock acquisitions thrown away by rollbacks.</p>
      <div class="grid2">
        <div><h3>Rollbacks</h3>${bars(rows, { value: (d) => d.aborts, format: (v) => fmt(v, 0) })}</div>
        <div><h3>Time until every transaction has committed</h3>${bars(rows, { value: (d) => d.makespan, format: (v) => fmt(v, 0), color: 'var(--s3)' })}</div>
      </div>
      <h3>Table</h3>
      ${table([
        { key: 'label', label: 'Strategy' }, { label: 'Committed', num: true, render: (r) => `${r.committed}/${r.total}` },
        { key: 'deadlocks', label: 'Deadlocks found', num: true }, { key: 'aborts', label: 'Rollbacks', num: true },
        { key: 'wastedOps', label: 'Wasted ops', num: true }, { key: 'avgLatency', label: 'Avg latency', num: true },
        { key: 'maxLatency', label: 'Max latency', num: true }, { key: 'makespan', label: 'All committed at', num: true },
      ], rows, { bestIndex: best })}`;

    const agg = {};
    for (let s = 1; s <= 50; s++) {
      for (const r of compareStrategies(makeWorkload({ count: f.count, perTick: f.perTick, hotPapers: f.hotPapers, authors: f.authors, seed: s }), { timeout: f.timeout })) {
        const a = (agg[r.strategy] ||= { label: r.label, deadlocks: 0, aborts: 0, wastedOps: 0, avgLatency: 0, makespan: 0 });
        for (const k of ['deadlocks', 'aborts', 'wastedOps', 'avgLatency', 'makespan']) a[k] += r[k] / 50;
      }
    }
    const avgRows = Object.values(agg);
    $(root, '#avg').innerHTML = `<h2>Average over 50 random workloads</h2>
      ${table([{ key: 'label', label: 'Strategy' }, { key: 'deadlocks', label: 'Deadlocks', num: true }, { key: 'aborts', label: 'Rollbacks', num: true }, { key: 'wastedOps', label: 'Wasted ops', num: true }, { key: 'avgLatency', label: 'Avg latency', num: true }, { key: 'makespan', label: 'All committed at', num: true }], avgRows)}`;

    const one = simulateTransactions(w, { strategy: f.strategy, timeout: f.timeout });
    const events = one.log.filter((e) => e.event !== 'commit');
    $(root, '#log').innerHTML = `<h2>Lock-manager log: ${esc(STRATEGIES[f.strategy])}</h2>
      ${tiles([[one.deadlocks, 'deadlocks detected'], [one.aborts, 'rollbacks'], [one.committed, 'committed']])}
      ${events.length ? `<div class="trace">${table([{ key: 't', label: 'Tick', num: true }, { key: 'txn', label: 'Txn' }, { key: 'event', label: 'Event' }, { key: 'detail', label: 'Detail' }], events)}</div>` : '<p class="note">No conflicts needed a rollback.</p>'}`;
  };
  $(root, '#f').addEventListener('change', run);
  run();
}
