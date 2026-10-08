// Repository catalogue and its background-job queue, kept in the browser
// (localStorage) so the hosted demo works without a server. Every upload and
// search adds jobs to the queue; the CPU-scheduling page can load that queue.

const KEY = 'drr.papers.v1';
const JOBS = 'drr.jobs.v1';

export const SEED = [
  { title: 'The UNIX Time-Sharing System', authors: 'D. M. Ritchie, K. Thompson', year: 1974, type: 'Paper', dept: 'Reference', pages: 11, scanned: false, tags: 'os, unix, file system', doi: '10.1145/361011.361061' },
  { title: 'Scheduler Activations: Effective Kernel Support for the User-Level Management of Parallelism', authors: 'T. E. Anderson, B. N. Bershad, E. D. Lazowska, H. M. Levy', year: 1992, type: 'Paper', dept: 'Reference', pages: 27, scanned: false, tags: 'threads, kernel', doi: '10.1145/146941.146944' },
  { title: 'Solution of a Problem in Concurrent Programming Control', authors: 'E. W. Dijkstra', year: 1965, type: 'Paper', dept: 'Reference', pages: 1, scanned: true, tags: 'mutual exclusion, concurrency', doi: '10.1145/365559.365617' },
  { title: "A New Solution of Dijkstra's Concurrent Programming Problem", authors: 'L. Lamport', year: 1974, type: 'Paper', dept: 'Reference', pages: 3, scanned: true, tags: 'bakery, mutual exclusion', doi: '10.1145/361082.361093' },
  { title: 'Scheduling Algorithms for Multiprogramming in a Hard-Real-Time Environment', authors: 'C. L. Liu, J. W. Layland', year: 1973, type: 'Paper', dept: 'Reference', pages: 16, scanned: true, tags: 'rtos, rate monotonic, edf', doi: '10.1145/321738.321743' },
  { title: 'System Deadlocks', authors: 'E. G. Coffman, M. Elphick, A. Shoshani', year: 1971, type: 'Paper', dept: 'Reference', pages: 12, scanned: true, tags: 'deadlock', doi: '10.1145/356586.356588' },
  { title: 'Priority Inheritance Protocols: An Approach to Real-Time Synchronization', authors: 'L. Sha, R. Rajkumar, J. P. Lehoczky', year: 1990, type: 'Paper', dept: 'Reference', pages: 11, scanned: false, tags: 'rtos, priority inversion', doi: '10.1109/12.57058' },
  { title: 'Sample: Smart Attendance System using Face Recognition', authors: 'Sample student project', year: 2025, type: 'Project report', dept: 'CSE', pages: 64, scanned: false, tags: 'sample, computer vision', doi: '' },
  { title: 'Sample: Load Balancing in Campus Wi-Fi Networks', authors: 'Sample student thesis', year: 2024, type: 'Thesis', dept: 'CSE', pages: 92, scanned: true, tags: 'sample, networks', doi: '' },
];

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function write(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable: keep in memory only */ }
}

let papers = read(KEY, null);
if (!papers) papers = SEED.map((p, i) => ({ id: i + 1, added: '2026-09-20', ...p }));
let jobs = read(JOBS, []);

export const listPapers = () => papers;
export const listJobs = () => jobs;

export function search(q, type) {
  const s = q.trim().toLowerCase();
  return papers.filter((p) => (!type || p.type === type) && (!s || [p.title, p.authors, p.tags, p.dept, String(p.year)].join(' ').toLowerCase().includes(s)));
}

// The work an upload creates. Bursts are in scheduler time units and grow with document size.
export function jobsForUpload(p) {
  const out = [{ name: `Extract metadata #${p.id}`, burst: 1 + Math.floor(p.pages / 40), priority: 3, queue: 'batch' }];
  if (p.scanned) out.push({ name: `OCR scanned pages #${p.id}`, burst: Math.max(2, Math.ceil(p.pages / 10)), priority: 4, queue: 'batch' });
  out.push({ name: `Update search index #${p.id}`, burst: 2 + Math.floor(p.pages / 30), priority: 3, queue: 'batch' });
  out.push({ name: `Thumbnail #${p.id}`, burst: 1, priority: 4, queue: 'batch' });
  return out;
}

function nextArrival() {
  return jobs.length ? jobs[jobs.length - 1].arrival + 1 : 0;
}
function pushJobs(list) {
  let t = nextArrival();
  for (const j of list) jobs.push({ id: `J${jobs.length + 1}`, arrival: t++, ...j });
  write(JOBS, jobs);
}

export function addPaper(p) {
  const paper = { id: Math.max(0, ...papers.map((x) => x.id)) + 1, added: new Date().toISOString().slice(0, 10), ...p };
  papers = [paper, ...papers];
  write(KEY, papers);
  pushJobs(jobsForUpload(paper));
  return paper;
}

export function recordSearch(q) {
  if (q.trim()) pushJobs([{ name: `Search "${q.trim().slice(0, 18)}"`, burst: 1 + (q.length > 12 ? 1 : 0), priority: 1, queue: 'interactive' }]);
}

export function recordDownload(p) {
  pushJobs([{ name: `Download #${p.id}`, burst: 1, priority: 1, queue: 'interactive' }]);
}

export function removePaper(id) {
  papers = papers.filter((p) => p.id !== id);
  write(KEY, papers);
}

export function clearJobs() {
  jobs = [];
  write(JOBS, jobs);
}

export function resetAll() {
  papers = SEED.map((p, i) => ({ id: i + 1, added: '2026-09-20', ...p }));
  jobs = [];
  write(KEY, papers);
  write(JOBS, jobs);
}
