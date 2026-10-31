import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from todo.tasks import TaskList


def create_server(port: int = 0, tasks: TaskList | None = None) -> ThreadingHTTPServer:
    store = tasks if tasks is not None else TaskList()

    class Handler(BaseHTTPRequestHandler):
        def _reply(self, status: int, body: str = "") -> None:
            payload = body.encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self) -> None:
            if self.path != "/tasks":
                self._reply(404)
                return
            self._reply(200, json.dumps(store.titles()))

        def do_POST(self) -> None:
            if self.path != "/tasks":
                self._reply(404)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                title = json.loads(self.rfile.read(length)).get("title", "")
                store.add(title if isinstance(title, str) else "")
            except (ValueError, AttributeError) as error:
                self._reply(400, str(error))
                return
            self._reply(201)

        def log_message(self, format: str, *args: object) -> None:
            pass

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


if __name__ == "__main__":
    create_server(8080).serve_forever()
