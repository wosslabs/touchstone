export class TaskList {
  private readonly titles: string[] = [];

  add(title: string): void {
    if (title.trim() === "") {
      throw new RangeError("a task needs a title");
    }
    this.titles.push(title);
  }

  list(): readonly string[] {
    return [...this.titles];
  }
}
