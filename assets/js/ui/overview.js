import { esc, pageHead } from './dom.js';

const COVERAGE = [
  ['Unit 1', 'Linux CLI and shell scripting: variables, control structures, functions', 'scripts', 'Admin shell scripts', 'Backup, log rotation, bulk re-indexing and health check, scheduled with cron.'],
  ['Unit 2', 'FCFS, SJF, SRTF, Priority, Round Robin, Multilevel Queue, Multilevel Feedback Queue', 'scheduling', 'CPU scheduling', 'All eight algorithms scheduling the repository’s background-job queue, with Gantt charts and metrics.'],
  ['Unit 2', 'Processes vs threads, thread states and types, multithreading models, Hyper-Threading', 'threads', 'Threads & models', 'The same burst of download requests served under five process/thread models.'],
  ['Unit 2', 'Case study: CPU scheduling in real-time embedded systems and RTOS', 'rtos', 'Case study: RTOS', 'Rate Monotonic vs EDF on the scanning kiosk controller, response-time analysis, priority inversion.'],
  ['Unit 3', 'Race condition, critical section, lock variable, strict alternation, Peterson, Bakery, TSL, semaphores', 'sync', 'Critical section', 'Each solution checked over every possible interleaving of two upload threads.'],
  ['Unit 3', 'Producer–consumer, bounded buffer, readers–writers, dining philosophers, sleeping barber, monitors, IPC', 'problems', 'Classical problems', 'Each problem mapped to a part of the repository and run on a semaphore/monitor runtime.'],
  ['Unit 3', 'Deadlock characterisation, prevention, avoidance (Banker’s), detection, recovery', 'deadlock', 'Deadlock & Banker’s', 'Editable Banker’s algorithm, detection with a resource-allocation graph, recovery by victim selection.'],
  ['Unit 3', 'Case study: deadlock avoidance in database transaction management (Oracle, MySQL)', 'database', 'Case study: DB deadlocks', 'Two-phase locking with InnoDB- and Oracle-style detection, timeouts, wait-die, wound-wait and ordered locking.'],
];

export function render(root) {
  root.innerHTML = `
  ${pageHead('Operating Systems PBL · CCSE0303A · SDG 4 Quality Education', 'Digital Research Repository', 'A central place where students and faculty upload, search and download research papers, theses and project reports. Behind it sit the operating-system mechanisms that keep it responsive: shell scripts for administration, CPU scheduling of background jobs, threads for concurrent requests, synchronisation of shared data and deadlock handling for its database. Each of these is implemented here and can be run in the browser.')}
  <div class="grid3">
    <div class="card"><h2>Use the repository</h2><p class="sub">Search, upload and download. Uploads create background jobs.</p><a href="#/repository">Open the repository →</a></div>
    <div class="card"><h2>Schedule its jobs</h2><p class="sub">Run the job queue through eight CPU-scheduling algorithms.</p><a href="#/scheduling">Open CPU scheduling →</a></div>
    <div class="card"><h2>Keep it consistent</h2><p class="sub">Critical sections, classical problems and deadlocks.</p><a href="#/sync">Open concurrency →</a></div>
  </div>
  <div class="card" style="margin-top:18px">
    <h2>Syllabus coverage</h2>
    <p class="sub">Topics covered up to Review 2 and where each is implemented in this app.</p>
    ${COVERAGE.map(([unit, topic, href, page, what]) => `<div class="cover-row"><div><span class="badge info">${esc(unit)}</span> <b>${esc(topic)}</b><small>${esc(what)}</small></div><div><a href="#/${href}">${esc(page)} →</a></div></div>`).join('')}
  </div>
  <div class="grid2">
    <div class="card">
      <h2>Architecture</h2>
      <p class="sub"><b>Web app</b> (this site): HTML, CSS and JavaScript modules, no build step, hosted on GitHub Pages. The catalogue is kept in the browser so the demo works without a server.</p>
      <p class="sub"><b>Server prototype</b> (<code>app.py</code>): Python standard library only, a <code>ThreadingHTTPServer</code> (one thread per request) over SQLite.</p>
      <p class="sub"><b>Simulation core</b> (<code>assets/js/os/</code>): plain functions with no UI code, covered by automated tests (<code>npm test</code>).</p>
      <p class="sub"><b>Admin scripts</b> (<code>scripts/</code>): Bash, run by cron on the Linux server.</p>
    </div>
    <div class="card">
      <h2>Progress</h2>
      <div class="progress" aria-label="50 percent complete"><div style="width:50%"></div></div>
      <p class="sub" style="margin-top:8px"><b>50%</b> at Review 2: Units 1–3 implemented. Unit 4 (memory management, virtual memory, file and disk management) is planned for the final review.</p>
      <p class="sub">Team (Group 87): Utkarsh Raj Shukla, Vivek Kumar, Vishal Gupta, Yash Srivastava, Nishant Kumar Mahto.</p>
      <p class="sub">Faculty: Dr. Neeti Taneja.</p>
    </div>
  </div>`;
}
