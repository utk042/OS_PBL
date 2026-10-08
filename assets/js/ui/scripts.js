import { esc, pageHead } from './dom.js';

const SCRIPTS = [
  ['backup.sh', 'Nightly backup', 'Archives the uploads folder and database into a dated tar.gz, verifies the archive and deletes backups older than the retention period.'],
  ['rotate_logs.sh', 'Log rotation', 'Compresses server logs larger than a size limit and keeps a fixed number of old copies.'],
  ['reindex.sh', 'Bulk ingestion and re-indexing', 'Finds new PDFs in an inbox folder, extracts their text in parallel background processes (bounded with wait -n) and rebuilds the keyword index.'],
  ['health_check.sh', 'Health check', 'Reports disk usage, load average, memory and the top processes, and exits non-zero when a threshold is crossed so cron can alert.'],
];

export function render(root) {
  root.innerHTML = `
  ${pageHead('Unit 1 · Shell scripting', 'Automating repository administration', 'Planned in Review 1 and written this month. The scripts use variables, functions, conditionals, loops, exit codes and background processes. They run on the Linux server and are scheduled with cron. Every script supports <code>--help</code> and a <code>DRY_RUN=1</code> mode.')}
  <div class="card">
    <h2>Cron schedule</h2>
    <pre class="code"># m  h  dom mon dow  command
  30 1   *   *   *   /opt/drr/scripts/backup.sh       >> /var/log/drr/cron.log 2>&1
  0  2   *   *   *   /opt/drr/scripts/rotate_logs.sh  >> /var/log/drr/cron.log 2>&1
 */15 *  *   *   *   /opt/drr/scripts/reindex.sh      >> /var/log/drr/cron.log 2>&1
 */5  *  *   *   *   /opt/drr/scripts/health_check.sh || mail -s "DRR alert" admin@example.edu</pre>
  </div>
  ${SCRIPTS.map(([file, title, desc]) => `<div class="card"><h2>${esc(title)} <code>scripts/${file}</code></h2><p class="sub">${esc(desc)}</p><pre class="code" data-file="${file}">Loading…</pre></div>`).join('')}`;

  for (const el of root.querySelectorAll('[data-file]')) {
    fetch(`scripts/${el.dataset.file}`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status))))
      .then((t) => { el.textContent = t; })
      .catch(() => { el.innerHTML = `Open it on <a href="https://github.com/utk042/OS_PBL/blob/main/scripts/${esc(el.dataset.file)}" target="_blank" rel="noopener">GitHub</a>.`; });
  }
}
