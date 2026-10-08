import { installTooltip } from './ui/dom.js';
import * as overview from './ui/overview.js';
import * as repository from './ui/repository.js';
import * as scripts from './ui/scripts.js';
import * as scheduling from './ui/scheduling.js';
import * as threads from './ui/threads.js';
import * as rtos from './ui/rtos.js';
import * as sync from './ui/sync.js';
import * as problems from './ui/problems.js';
import * as deadlock from './ui/deadlock.js';
import * as database from './ui/database.js';

const routes = { '': overview, repository, scripts, scheduling, threads, rtos, sync, problems, deadlock, database };
const view = document.getElementById('view');
const side = document.getElementById('side');

function route() {
  const name = location.hash.replace(/^#\/?/, '').split('?')[0];
  const page = routes[name] || overview;
  view.innerHTML = '';
  page.render(view);
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#/${name}`));
  side.classList.remove('open');
  window.scrollTo(0, 0);
}

function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t;
}
try { applyTheme(localStorage.getItem('theme')); } catch { /* storage unavailable */ }
document.getElementById('theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('theme', next); } catch { /* ignore */ }
});
document.getElementById('menu').addEventListener('click', () => side.classList.toggle('open'));
side.addEventListener('click', (e) => { if (e.target === side) side.classList.remove('open'); });

installTooltip();
window.addEventListener('hashchange', route);
route();
