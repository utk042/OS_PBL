# Research Repository Management System

A small demo app for cataloguing research papers — title, authors, venue, tags,
notes and reading status — with search, filtering and live counts.

Built for an OS PBL demo. **Zero dependencies:** Python 3 standard library only
(`http.server` + `sqlite3`).

## Run

```bash
python3 app.py
```

Then open <http://localhost:8000>. Use `PORT=9000 python3 app.py` for a different port.

The SQLite file `research.db` is created next to `app.py` on first run and seeded
with three sample papers.

## Features

- Add papers with title, authors, year, venue, tags, URL/DOI and notes
- Live search across title, authors, tags and notes
- Filter by reading status
- Click a status pill to advance it: `to-read → reading → read → to-read`
- Delete papers (with confirmation)
- Dashboard counts per status
- Responsive layout, light and dark theme

## API

| Method   | Path                | Purpose                                      |
| -------- | ------------------- | -------------------------------------------- |
| `GET`    | `/`                 | Web UI                                       |
| `GET`    | `/api/papers`       | List papers; `?q=` search, `?status=` filter |
| `POST`   | `/api/papers`       | Create a paper (`title` required)            |
| `PATCH`  | `/api/papers/<id>`  | Update any subset of fields                  |
| `DELETE` | `/api/papers/<id>`  | Delete a paper                               |
| `GET`    | `/api/stats`        | Totals and per-status counts                 |

Example:

```bash
curl -X POST localhost:8000/api/papers -H 'Content-Type: application/json' \
  -d '{"title":"The Google File System","authors":"Ghemawat et al.","year":"2003"}'
```

## Layout

Everything lives in `app.py`: schema and seed data, the SQLite data layer, the
HTTP handler, and the HTML/CSS/JS front end served as one page.
