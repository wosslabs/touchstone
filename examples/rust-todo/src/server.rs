use std::io::Read;
use std::sync::Arc;
use std::thread::{self, JoinHandle};

use tiny_http::{Header, Method, Response, Server};

use crate::tasks::List;

/// A running todo server. Dropping it stops the server.
pub struct Running {
    server: Arc<Server>,
    worker: Option<JoinHandle<()>>,
    pub port: u16,
}

impl Drop for Running {
    fn drop(&mut self) {
        self.server.unblock();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

pub fn start(port: u16) -> Running {
    let server = Arc::new(Server::http(("127.0.0.1", port)).expect("bind the todo server"));
    let port = server.server_addr().to_ip().expect("an ip address").port();
    let list = List::default();
    let serving = Arc::clone(&server);
    let worker = thread::spawn(move || {
        for mut request in serving.incoming_requests() {
            let reply = match (request.method().clone(), request.url()) {
                (Method::Get, "/tasks") => {
                    let json = Header::from_bytes("Content-Type", "application/json").unwrap();
                    Response::from_string(serde_json::to_string(&list.titles()).unwrap())
                        .with_header(json)
                        .boxed()
                }
                (Method::Post, "/tasks") => {
                    let mut body = String::new();
                    let _ = request.as_reader().read_to_string(&mut body);
                    let title = serde_json::from_str::<serde_json::Value>(&body)
                        .ok()
                        .and_then(|value| value["title"].as_str().map(str::to_string));
                    match title.as_deref().map(|title| list.add(title)) {
                        Some(Ok(())) => Response::empty(201).boxed(),
                        _ => Response::from_string("a task needs a title").with_status_code(400).boxed(),
                    }
                }
                _ => Response::empty(404).boxed(),
            };
            let _ = request.respond(reply);
        }
    });
    Running { server, worker: Some(worker), port }
}
