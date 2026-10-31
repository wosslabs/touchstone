import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from todo.tasks import TaskList  # noqa: E402


# Unit tests stay in tests/. Acceptance scenarios live in features/.
class TaskListTest(unittest.TestCase):
    def test_keeps_tasks_in_order(self):
        tasks = TaskList()
        tasks.add("Buy milk")
        tasks.add("Walk the dog")
        self.assertEqual(tasks.titles(), ["Buy milk", "Walk the dog"])

    def test_rejects_a_blank_title(self):
        with self.assertRaises(ValueError):
            TaskList().add("  ")


if __name__ == "__main__":
    unittest.main()
