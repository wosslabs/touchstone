import threading

from todo.server import create_server


def before_scenario(context, scenario):
    context.server = create_server(0)
    context.base = f"http://127.0.0.1:{context.server.server_address[1]}/tasks"
    context.thread = threading.Thread(target=context.server.serve_forever, daemon=True)
    context.thread.start()


def after_scenario(context, scenario):
    context.server.shutdown()
    context.server.server_close()
