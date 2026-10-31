class TaskList:
    def __init__(self) -> None:
        self._titles: list[str] = []

    def add(self, title: str) -> None:
        if not title.strip():
            raise ValueError("a task needs a title")
        self._titles.append(title)

    def titles(self) -> list[str]:
        return list(self._titles)
