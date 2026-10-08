# Digital Research Repository — Operating Systems PBL

A central web platform where students and faculty upload, search and download
research papers, theses and project reports, together with working
implementations of the operating-system mechanisms the platform depends on.

**Live app:** https://utk042.github.io/OS_PBL/

Course: Operating Systems (CCSE0303A) · Group 87 · SDG 4 Quality Education

## What is in the app

| Page | Syllabus | What it does |
| --- | --- | --- |
| Repository | — | Search, upload and download documents. Every action creates background jobs (metadata, OCR, indexing, thumbnails) in a job queue. |
| Admin shell scripts | Unit 1 | Backup, log rotation, bulk re-indexing with parallel background processes, health check; scheduled with cron. |
| CPU scheduling | Unit 2 | FCFS, SJF, SRTF, Priority (NP/P), Round Robin, Multilevel Queue and Multilevel Feedback Queue on the repository's job queue, with Gantt charts and metrics. |
| Threads & models | Unit 2 | Single-threaded, process-per-request, many-to-one, one-to-one and many-to-many models serving the same requests; Hyper-Threading. |
| Case study: RTOS | Unit 2 | Rate Monotonic vs EDF for the scanning-kiosk controller, Liu–Layland bound, response-time analysis, priority inversion and inheritance. |
| Critical section | Unit 3 | Race condition, lock variable, strict alternation, Peterson, Lamport's Bakery, TSL and semaphores, each checked over every interleaving. |
| Classical problems | Unit 3 | Bounded buffer (semaphores and monitor), readers–writers (3 variants), dining philosophers (4 strategies), sleeping barber. |
| Deadlock & Banker's | Unit 3 | Banker's safety and request algorithms, detection, recovery, resource-allocation graph, Coffman conditions. |
| Case study: DB deadlocks | Unit 3 | Strict 2PL transactions under InnoDB- and Oracle-style detection, lock-wait timeout, wait-die, wound-wait and ordered locking. |

## Run locally

```bash
python3 -m http.server 8000      # then open http://localhost:8000
npm test                         # 28 unit tests for the simulation core (Node 18+)
```

`app.py` is the server prototype (Python standard library: `ThreadingHTTPServer` + SQLite):
`python3 app.py`, then open <http://localhost:8000>.

The admin scripts take their paths from the environment, e.g.

```bash
DRR_ROOT=/tmp/drr scripts/reindex.sh --jobs 4
DRY_RUN=1 DRR_ROOT=/tmp/drr scripts/backup.sh --keep 7
```

## Layout

```
index.html               single-page app shell
assets/css/app.css       styles (light and dark)
assets/js/os/            simulation core, no UI code: scheduling, threads, rtos,
                         mutex (state-space checker), runtime + problems
                         (semaphores/monitors), deadlock, dbcase
assets/js/ui/            one module per page
assets/js/repo/store.js  catalogue and job queue (browser storage)
scripts/                 Bash admin scripts (Unit 1)
tests/                   node:test unit tests
app.py                   Python server prototype
```

## Deployment

`.github/workflows/pages.yml` runs the tests and publishes the site to GitHub Pages
on every push to `main`. In the repository settings, set **Pages → Source** to
**GitHub Actions** once.
