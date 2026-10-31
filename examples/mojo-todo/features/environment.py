import os
import tempfile


def before_scenario(context, scenario):
    context.directory = tempfile.TemporaryDirectory()
    context.todo_file = os.path.join(context.directory.name, "tasks.txt")
    context.binary = os.environ.get("TODO_BIN", os.path.abspath("build/todo"))


def after_scenario(context, scenario):
    context.directory.cleanup()
