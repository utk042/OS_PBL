#!/usr/bin/env python3
"""Research Repository Management System - a single-file demo.

No external dependencies: Python stdlib only (http.server + sqlite3).
Run:  python3 app.py    then open http://localhost:8000
"""

import json
import os
import sqlite3
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "research.db")
PORT = int(os.environ.get("PORT", "8000"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS papers (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    title    TEXT NOT NULL,
    authors  TEXT NOT NULL DEFAULT '',
    year     TEXT NOT NULL DEFAULT '',
    venue    TEXT NOT NULL DEFAULT '',
    tags     TEXT NOT NULL DEFAULT '',
    url      TEXT NOT NULL DEFAULT '',
    status   TEXT NOT NULL DEFAULT 'to-read',
    notes    TEXT NOT NULL DEFAULT '',
    added_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

SEED = [
    ("The UNIX Time-Sharing System", "Ritchie, Thompson", "1974", "CACM",
     "os, unix", "https://dl.acm.org/doi/10.1145/361011.361061", "read",
     "Foundational OS paper. Process model and file abstraction."),
    ("A Case for Redundant Arrays of Inexpensive Disks (RAID)", "Patterson, Gibson, Katz",
     "1988", "SIGMOD", "storage, raid", "", "reading",
     "Compare RAID levels for the PBL storage section."),
    ("The Google File System", "Ghemawat, Gobioff, Leung", "2003", "SOSP",
     "distributed, filesystem", "", "to-read", "Relevant to the distributed FS module."),
]

STATUSES = ["to-read", "reading", "read"]
FIELDS = ["title", "authors", "year", "venue", "tags", "url", "status", "notes"]


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    fresh = not os.path.exists(DB_PATH)
    with db() as conn:
        conn.executescript(SCHEMA)
        if fresh:
            conn.executemany(
                "INSERT INTO papers (title,authors,year,venue,tags,url,status,notes)"
                " VALUES (?,?,?,?,?,?,?,?)", SEED)


def list_papers(q="", status=""):
    sql = "SELECT * FROM papers WHERE 1=1"
    args = []
    if q:
        sql += " AND (title LIKE ? OR authors LIKE ? OR tags LIKE ? OR notes LIKE ?)"
        args += ["%" + q + "%"] * 4
    if status in STATUSES:
        sql += " AND status = ?"
        args.append(status)
    sql += " ORDER BY id DESC"
    with db() as conn:
        return [dict(r) for r in conn.execute(sql, args)]


def stats():
    with db() as conn:
        total = conn.execute("SELECT COUNT(*) FROM papers").fetchone()[0]
        by = {s: 0 for s in STATUSES}
        for row in conn.execute("SELECT status, COUNT(*) c FROM papers GROUP BY status"):
            by[row["status"]] = row["c"]
    return {"total": total, "by_status": by}


def create_paper(d):
    if not (d.get("title") or "").strip():
        raise ValueError("title is required")
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO papers (title,authors,year,venue,tags,url,status,notes)"
            " VALUES (?,?,?,?,?,?,?,?)",
            [str(d.get(f, "")).strip() for f in FIELDS[:6]]
            + [d.get("status") if d.get("status") in STATUSES else "to-read",
               str(d.get("notes", "")).strip()])
        return cur.lastrowid


def update_paper(pid, d):
    sets, args = [], []
    for f in FIELDS:
        if f in d:
            if f == "status" and d[f] not in STATUSES:
                continue
            sets.append(f + " = ?")
            args.append(str(d[f]).strip())
    if not sets:
        return 0
    args.append(pid)
    with db() as conn:
        return conn.execute(
            "UPDATE papers SET " + ", ".join(sets) + " WHERE id = ?", args).rowcount


def delete_paper(pid):
    with db() as conn:
        return conn.execute("DELETE FROM papers WHERE id = ?", (pid,)).rowcount


PAGE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Research Repository</title>
<style>
  :root{
    --bg:#f6f7f9; --card:#fff; --text:#16181d; --muted:#6b7280;
    --line:#e3e6ea; --accent:#3257d5; --accent-soft:#eaeffd;
    --toread:#8b5cf6; --reading:#d97706; --read:#059669;
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --bg:#14161a; --card:#1c1f25; --text:#e8eaed; --muted:#9aa2ae;
      --line:#2c3138; --accent:#7d9bff; --accent-soft:#232a3d;
    }
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);
    font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
  .wrap{max-width:1000px;margin:0 auto;padding:28px 16px 64px}
  header h1{margin:0;font-size:24px;letter-spacing:-.02em}
  header p{margin:4px 0 0;color:var(--muted);font-size:14px}
  .stats{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:10px;
    padding:10px 14px;min-width:88px}
  .stat b{display:block;font-size:20px;line-height:1.2}
  .stat span{font-size:12px;color:var(--muted)}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;
    padding:16px;margin-bottom:16px}
  h2{margin:0 0 12px;font-size:15px;text-transform:uppercase;letter-spacing:.06em;
    color:var(--muted)}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
  input,select,textarea,button{font:inherit;color:var(--text)}
  input,select,textarea{width:100%;padding:8px 10px;border:1px solid var(--line);
    border-radius:8px;background:var(--bg)}
  textarea{min-height:60px;resize:vertical}
  button{cursor:pointer;border:1px solid var(--line);background:var(--card);
    padding:8px 14px;border-radius:8px}
  button.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .row .grow{flex:1;min-width:160px}
  table{width:100%;border-collapse:collapse}
  th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.05em;
    color:var(--muted);padding:8px;border-bottom:1px solid var(--line)}
  td{padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top}
  tr:last-child td{border-bottom:0}
  .t{font-weight:600}
  .meta{font-size:13px;color:var(--muted)}
  .tags{margin-top:4px;display:flex;gap:4px;flex-wrap:wrap}
  .tag{font-size:11px;background:var(--accent-soft);color:var(--accent);
    padding:2px 7px;border-radius:99px}
  .pill{font-size:11px;font-weight:600;padding:3px 9px;border-radius:99px;color:#fff;
    white-space:nowrap;border:0;cursor:pointer}
  .s-to-read{background:var(--toread)} .s-reading{background:var(--reading)}
  .s-read{background:var(--read)}
  .x{background:none;border:0;color:var(--muted);font-size:16px;padding:2px 6px}
  .x:hover{color:#dc2626}
  .empty{text-align:center;color:var(--muted);padding:28px 0}
  a{color:var(--accent)}
  @media(max-width:620px){ .hide-sm{display:none} }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Research Repository</h1>
    <p>Track papers, notes and reading status &mdash; OS PBL demo</p>
  </header>

  <div class="stats" id="stats"></div>

  <div class="card">
    <h2>Add a paper</h2>
    <form id="add">
      <div class="grid">
        <input name="title" placeholder="Title *" required>
        <input name="authors" placeholder="Authors">
        <input name="year" placeholder="Year">
        <input name="venue" placeholder="Venue / journal">
        <input name="tags" placeholder="Tags (comma separated)">
        <input name="url" placeholder="URL / DOI">
        <select name="status">
          <option value="to-read">to-read</option>
          <option value="reading">reading</option>
          <option value="read">read</option>
        </select>
      </div>
      <div style="margin-top:10px"><textarea name="notes" placeholder="Notes"></textarea></div>
      <div style="margin-top:10px"><button class="primary" type="submit">Add paper</button></div>
    </form>
  </div>

  <div class="card">
    <div class="row" style="margin-bottom:12px">
      <input class="grow" id="q" placeholder="Search title, author, tag, notes&hellip;">
      <select id="status" style="width:auto">
        <option value="">All statuses</option>
        <option value="to-read">to-read</option>
        <option value="reading">reading</option>
        <option value="read">read</option>
      </select>
    </div>
    <table>
      <thead><tr>
        <th>Paper</th><th class="hide-sm">Year</th><th>Status</th><th></th>
      </tr></thead>
      <tbody id="rows"></tbody>
    </table>
    <div class="empty" id="empty" hidden>No papers match.</div>
  </div>
</div>

<script>
const esc = s => (s??"").toString().replace(/[&<>"]/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const NEXT = {"to-read":"reading","reading":"read","read":"to-read"};

async function load(){
  const q = document.getElementById("q").value;
  const st = document.getElementById("status").value;
  const [papers, s] = await Promise.all([
    fetch(`/api/papers?q=${encodeURIComponent(q)}&status=${st}`).then(r=>r.json()),
    fetch("/api/stats").then(r=>r.json())
  ]);
  document.getElementById("stats").innerHTML = `
    <div class="stat"><b>${s.total}</b><span>total</span></div>
    <div class="stat"><b>${s.by_status["to-read"]}</b><span>to-read</span></div>
    <div class="stat"><b>${s.by_status["reading"]}</b><span>reading</span></div>
    <div class="stat"><b>${s.by_status["read"]}</b><span>read</span></div>`;

  document.getElementById("empty").hidden = papers.length > 0;
  document.getElementById("rows").innerHTML = papers.map(p => {
    const title = p.url
      ? `<a class="t" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>`
      : `<span class="t">${esc(p.title)}</span>`;
    const meta = [p.authors, p.venue].filter(Boolean).map(esc).join(" &middot; ");
    const tags = (p.tags||"").split(",").map(t=>t.trim()).filter(Boolean)
      .map(t=>`<span class="tag">${esc(t)}</span>`).join("");
    return `<tr>
      <td>${title}
        ${meta ? `<div class="meta">${meta}</div>` : ""}
        ${p.notes ? `<div class="meta">${esc(p.notes)}</div>` : ""}
        ${tags ? `<div class="tags">${tags}</div>` : ""}</td>
      <td class="hide-sm meta">${esc(p.year)}</td>
      <td><button class="pill s-${p.status}" title="click to advance"
            onclick="cycle(${p.id},'${p.status}')">${p.status}</button></td>
      <td><button class="x" title="delete" onclick="del(${p.id})">&times;</button></td>
    </tr>`;
  }).join("");
}

async function cycle(id, cur){
  await fetch("/api/papers/"+id, {method:"PATCH",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({status: NEXT[cur]})});
  load();
}
async function del(id){
  if(!confirm("Delete this paper?")) return;
  await fetch("/api/papers/"+id, {method:"DELETE"});
  load();
}
document.getElementById("add").addEventListener("submit", async e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const r = await fetch("/api/papers", {method:"POST",
    headers:{"Content-Type":"application/json"}, body: JSON.stringify(d)});
  if(!r.ok){ alert("Could not add: " + (await r.json()).error); return; }
  e.target.reset();
  load();
});
document.getElementById("q").addEventListener("input", load);
document.getElementById("status").addEventListener("change", load);
load();
</script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    server_version = "ResearchRepo/1.0"

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))

    def _send(self, code, body, ctype="application/json"):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj), "application/json")

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError:
            return {}

    def _pid(self, path):
        try:
            return int(path.rsplit("/", 1)[1])
        except (ValueError, IndexError):
            return None

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path in ("/", "/index.html"):
            return self._send(200, PAGE, "text/html; charset=utf-8")
        if u.path == "/api/papers":
            qs = urllib.parse.parse_qs(u.query)
            return self._json(200, list_papers(
                qs.get("q", [""])[0], qs.get("status", [""])[0]))
        if u.path == "/api/stats":
            return self._json(200, stats())
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if urllib.parse.urlparse(self.path).path != "/api/papers":
            return self._json(404, {"error": "not found"})
        try:
            pid = create_paper(self._body())
        except ValueError as e:
            return self._json(400, {"error": str(e)})
        self._json(201, {"id": pid})

    def do_PATCH(self):
        path = urllib.parse.urlparse(self.path).path
        if not path.startswith("/api/papers/"):
            return self._json(404, {"error": "not found"})
        pid = self._pid(path)
        if pid is None:
            return self._json(400, {"error": "bad id"})
        if not update_paper(pid, self._body()):
            return self._json(404, {"error": "no such paper"})
        self._json(200, {"ok": True})

    def do_DELETE(self):
        path = urllib.parse.urlparse(self.path).path
        if not path.startswith("/api/papers/"):
            return self._json(404, {"error": "not found"})
        pid = self._pid(path)
        if pid is None:
            return self._json(400, {"error": "bad id"})
        if not delete_paper(pid):
            return self._json(404, {"error": "no such paper"})
        self._json(200, {"ok": True})


def main():
    init_db()
    print("Research Repository running at http://localhost:%d  (Ctrl-C to stop)" % PORT)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
