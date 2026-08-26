import pathlib
b = pathlib.Path("/root/plantbot/build")
markup = (b/"part_markup.html").read_text()
js = "".join((b/f"part{i}.js").read_text() for i in (1,2,3))
core = markup + "\n<script>\n" + js + "\n</script>\n"
(pathlib.Path("/root/plantbot/plantbot_artifact.html")).write_text(core)
title = "PlantBot Desk Study"
full = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n"
        + core.split("\n<div id=\"stage\">")[0] +
        "\n</head>\n<body>\n<div id=\"stage\">" + core.split("\n<div id=\"stage\">")[1] + "\n</body>\n</html>\n")
(pathlib.Path("/root/plantbot/PlantBot_Desk_Study.html")).write_text(full)
print("artifact:", len(core), "bytes | standalone:", len(full), "bytes")
