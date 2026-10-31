"""Command line todo list: `todo add <title>` and `todo list`.

The tasks live in the file named by TODO_FILE, one title per line.
"""
from std.os import getenv
from std.pathlib import Path
from std.sys import argv

from tasks import render, validate_title


def read_titles(path: Path) raises -> List[String]:
    var titles = List[String]()
    if not path.exists():
        return titles^
    for line in path.read_text().splitlines():
        titles.append(String(line))
    return titles^


def main() raises:
    var args = argv()
    var file = getenv("TODO_FILE", "tasks.txt")
    var path = Path(file)
    if len(args) < 2:
        raise Error("usage: todo add <title> | todo list")
    var command = String(args[1])
    if command == "add":
        if len(args) < 3:
            raise Error("a task needs a title")
        var title = String(args[2])
        validate_title(title)
        var titles = read_titles(path)
        titles.append(title)
        path.write_text(render(titles))
    elif command == "list":
        print(render(read_titles(path)), end="")
    else:
        raise Error("unknown command: " + command)
