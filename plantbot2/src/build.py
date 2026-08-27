"""Rebuild PlantBot_Desk_Study.html from the parts in this folder.
Run from anywhere:  python build.py
Writes the HTML one level up (the folder this src/ sits in)."""
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
OUT  = HERE.parent / "index.html"

markup = (HERE / "part_markup.html").read_text(encoding="utf-8")
js = "".join((HERE / f"part{i}.js").read_text(encoding="utf-8") for i in (1, 2, 3))
core = markup + "\n<script>\n" + js + "\n</script>\n"

head, body = core.split('\n<div id="stage">', 1)
OUT.write_text(
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
    + head + '\n</head>\n<body>\n<div id="stage">' + body + '\n</body>\n</html>\n',
    encoding="utf-8")
print(f"wrote {OUT}  ({OUT.stat().st_size} bytes)")
