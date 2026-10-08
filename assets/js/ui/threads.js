import { fmt, pageHead, table, bars, $, readForm } from './dom.js';
import { compareThreadModels, makeRequests } from '../os/threads.js';

export function render(root) {
  root.innerHTML = `
  ${pageHead('Unit 2 · Threads', 'Serving concurrent requests: processes vs threads', 'The repository server receives a burst of download requests. Each one parses the request (CPU), reads the file from disk (I/O) and builds the response (CPU). The same requests are run under each threading model so the effect of blocking I/O, creation cost and Hyper-Threading can be compared.')}
  <div class="card">
    <div class="controls" id="f">
      <label class="field">Requests<input data-k="n" type="number" min="1" max="64" value="12"></label>
      <label class="field">CPU cores<input data-k="cores" type="number" min="1" max="16" value="4"></label>
      <label class="field">Kernel threads in pool (M:M)<input data-k="pool" type="number" min="1" max="32" value="4"></label>
      <label class="field">CPU before I/O<input data-k="cpu1" type="number" min="1" max="20" value="2"></label>
      <label class="field">Disk I/O<input data-k="io" type="number" min="0" max="50" value="6"></label>
      <label class="field">CPU after I/O<input data-k="cpu2" type="number" min="0" max="20" value="1"></label>
      <label class="field" style="flex-direction:row;align-items:center;gap:8px"><input data-k="ht" type="checkbox"> Hyper-Threading (2 logical CPUs per core)</label>
    </div>
  </div>
  <div class="card" id="out"></div>
  <div class="grid2">
    <div class="card"><h2>Processes vs threads</h2>
      <div class="table-wrap"><table>
        <tr><th></th><th>Process</th><th>Thread</th></tr>
        <tr><td>Address space</td><td>Own</td><td>Shared with the other threads of the process</td></tr>
        <tr><td>Creation / switch cost</td><td>High (page tables, PCB)</td><td>Low (stack + registers, TCB)</td></tr>
        <tr><td>Communication</td><td>IPC: pipes, sockets, shared memory</td><td>Direct, through shared variables (needs synchronisation)</td></tr>
        <tr><td>Fault isolation</td><td>A crash stays inside one process</td><td>A crash takes the whole process down</td></tr>
        <tr><td>Use in the repository</td><td>Isolated helper for untrusted PDF parsing</td><td>Request handling with a shared in-memory search index</td></tr>
      </table></div>
    </div>
    <div class="card"><h2>Thread states and types</h2>
      <p class="sub">New → Ready → Running → Waiting (blocked on I/O or a lock) → Ready … → Terminated.</p>
      <p class="sub"><b>User-level threads</b> are managed by a library, so switching is cheap, but the kernel sees one entity: one blocking call stops them all. <b>Kernel-level threads</b> are scheduled by the OS, can run on different cores and block independently.</p>
      <p class="sub"><b>Hyper-Threading</b> (simultaneous multithreading) exposes two logical CPUs per core that share its execution units. It helps when one thread stalls, but two busy threads on one core each run slower, modelled here as 0.65× speed each (1.3× per core).</p>
      <p class="sub">The many-to-many model here gives a blocked user thread’s kernel thread back to the pool, the idea behind scheduler activations (Anderson et al., 1992).</p>
    </div>
  </div>`;

  const run = () => {
    const f = readForm($(root, '#f'));
    const requests = makeRequests(Math.max(1, f.n), { cpu1: f.cpu1, io: f.io, cpu2: f.cpu2 });
    const rows = compareThreadModels({ requests, cores: Math.max(1, f.cores), hyperThreading: f.ht, poolSize: Math.max(1, f.pool) });
    const best = rows.reduce((b, x, i) => (x.makespan < rows[b].makespan ? i : b), 0);
    $(root, '#out').innerHTML = `
      <h2>Time to serve all ${f.n} requests</h2>
      <p class="sub">Lower is better. Single-threaded and many-to-one take the same time: one blocking disk read stops every request.</p>
      ${bars(rows, { label: (d) => d.label, value: (d) => d.makespan, format: (v) => fmt(v, 1) })}
      <h3>Table</h3>
      ${table([
        { key: 'label', label: 'Model' },
        { key: 'makespan', label: 'All done at', num: true },
        { key: 'avgResponse', label: 'Avg response', num: true },
        { key: 'kernelEntities', label: 'Kernel-scheduled entities', num: true },
        { label: 'Kernel memory', num: true, render: (r) => `${r.memoryKB.toLocaleString()} KB` },
      ], rows, { bestIndex: best })}
      <p class="note">Memory model: each process needs ≈1 MB of kernel state (page tables, PCB); each kernel thread ≈16 KB (TCB, kernel stack). Creation cost: process 1.5 units, kernel thread 0.2 units.</p>`;
  };
  $(root, '#f').addEventListener('input', run);
  run();
}
