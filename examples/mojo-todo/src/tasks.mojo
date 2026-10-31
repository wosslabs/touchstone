"""Domain rules for the todo list, free of file and process concerns."""


def validate_title(title: String) raises:
    if title.strip().byte_length() == 0:
        raise Error("a task needs a title")


def render(titles: List[String]) -> String:
    var out = String()
    for title in titles:
        out += title + "\n"
    return out
