import { esc, pageHead, table, $, readForm } from './dom.js';
import * as store from '../repo/store.js';

const TYPES = ['Paper', 'Thesis', 'Project report'];

export function render(root) {
  root.innerHTML = `
  ${pageHead('The product', 'Repository', 'Upload, search and open departmental research. Every upload and search also creates background work (metadata extraction, OCR, indexing, thumbnails) that joins the job queue. That queue is the workload the CPU-scheduling page schedules.')}
  <div class="grid2">
    <div class="card">
      <h2>Search the collection</h2>
      <p class="sub">Searches run as short interactive jobs.</p>
      <form class="controls" id="sf">
        <label class="field grow">Keywords<input id="q" placeholder="title, author, tag, year…"></label>
        <label class="field">Type<select id="type"><option value="">All</option>${TYPES.map((t) => `<option>${t}</option>`).join('')}</select></label>
        <button class="primary" type="submit">Search</button>
      </form>
      <div id="results"></div>
    </div>
    <div class="card">
      <h2>Upload a document</h2>
      <p class="sub">Only the metadata is kept in this demo; the PDF itself is not uploaded anywhere.</p>
      <form id="up">
        <div class="form-grid">
          <label class="field">Title *<input data-k="title" required></label>
          <label class="field">Authors<input data-k="authors"></label>
          <label class="field">Type<select data-k="type">${TYPES.map((t) => `<option>${t}</option>`).join('')}</select></label>
          <label class="field">Year<input data-k="year" type="number" value="2026"></label>
          <label class="field">Department<input data-k="dept" value="CSE"></label>
          <label class="field">Pages<input data-k="pages" type="number" value="40" min="1"></label>
          <label class="field">Tags<input data-k="tags" placeholder="comma separated"></label>
          <label class="field">PDF file (optional)<input type="file" id="file" accept="application/pdf"></label>
          <label class="field" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" data-k="scanned"> Scanned (needs OCR)</label>
        </div>
        <div style="margin-top:12px"><button class="primary" type="submit">Upload</button></div>
      </form>
      <div id="upmsg"></div>
    </div>
  </div>
  <div class="card">
    <h2>Background job queue</h2>
    <p class="sub">Jobs created by this session's uploads, searches and downloads. Open <a href="#/scheduling">CPU scheduling</a> and choose “Repository queue” to schedule them.</p>
    <div id="jobs"></div>
    <div class="controls" style="margin-top:12px;margin-bottom:0">
      <button id="clear" class="small">Clear queue</button>
      <button id="reset" class="small">Reset demo data</button>
    </div>
  </div>`;

  const showResults = (list) => {
    $(root, '#results').innerHTML = list.length
      ? list.map((p) => `<div class="paper"><div><div class="t">${esc(p.title)}</div>
          <div class="meta">${esc(p.authors)} · ${esc(p.year)} · ${esc(p.type)} · ${esc(p.dept)} · ${esc(p.pages)} pages${p.scanned ? ' · scanned' : ''}</div>
          <div class="tags">${String(p.tags || '').split(',').map((t) => t.trim()).filter(Boolean).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div></div>
          <div>${p.doi ? `<a href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener" data-dl="${p.id}">Open</a>` : `<button class="small" data-dl="${p.id}">Download</button>`}</div></div>`).join('')
      : '<p class="note">Nothing matches.</p>';
  };
  const showJobs = () => {
    const jobs = store.listJobs();
    $(root, '#jobs').innerHTML = jobs.length
      ? table([
        { key: 'id', label: 'Job' }, { key: 'name', label: 'Work' }, { key: 'queue', label: 'Queue' },
        { key: 'arrival', label: 'Arrival', num: true }, { key: 'burst', label: 'CPU burst', num: true }, { key: 'priority', label: 'Priority', num: true },
      ], jobs)
      : '<p class="note">The queue is empty. Upload a document or run a search to create jobs.</p>';
  };

  showResults(store.search('', ''));
  showJobs();

  $(root, '#sf').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $(root, '#q').value;
    store.recordSearch(q);
    showResults(store.search(q, $(root, '#type').value));
    showJobs();
  });
  $(root, '#results').addEventListener('click', (e) => {
    const el = e.target.closest('[data-dl]');
    if (!el) return;
    const p = store.listPapers().find((x) => x.id === Number(el.dataset.dl));
    if (p) { store.recordDownload(p); showJobs(); }
  });
  $(root, '#file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    const title = $(root, '[data-k="title"]');
    if (f && !title.value) title.value = f.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
    if (f) $(root, '[data-k="pages"]').value = Math.max(1, Math.round(f.size / 60000));
  });
  $(root, '#up').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = readForm($(root, '#up'));
    const p = store.addPaper({ ...d, title: d.title.trim(), pages: Math.max(1, d.pages || 1) });
    $(root, '#upmsg').innerHTML = `<div class="callout good">Uploaded “${esc(p.title)}”. ${store.jobsForUpload(p).length} background jobs were added to the queue.</div>`;
    e.target.reset();
    showResults(store.search('', ''));
    showJobs();
  });
  $(root, '#clear').addEventListener('click', () => { store.clearJobs(); showJobs(); });
  $(root, '#reset').addEventListener('click', () => { store.resetAll(); showResults(store.search('', '')); showJobs(); });
}
