use cucumber::{given, then, when, writer, World, WriterExt};
use touchstone_rust_todo::server::{self, Running};

// Acceptance steps talk to the running service over HTTP only.
#[derive(Default, World)]
#[world(init = Self::new)]
struct TodoWorld {
    running: Option<Running>,
}

impl std::fmt::Debug for TodoWorld {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("TodoWorld")
    }
}

impl TodoWorld {
    fn new() -> Result<Self, std::convert::Infallible> {
        Ok(Self { running: Some(server::start(0)) })
    }

    fn url(&self) -> String {
        format!("http://127.0.0.1:{}/tasks", self.running.as_ref().unwrap().port)
    }

    fn add(&self, title: &str) {
        let response = ureq::post(&self.url())
            .set("Content-Type", "application/json")
            .send_string(&serde_json::json!({ "title": title }).to_string())
            .expect("the task is accepted");
        assert_eq!(response.status(), 201);
    }

    fn titles(&self) -> Vec<String> {
        let response = ureq::get(&self.url()).call().expect("the list is served");
        assert_eq!(response.status(), 200);
        serde_json::from_str(&response.into_string().unwrap()).unwrap()
    }
}

#[given(expr = "the list has no tasks")]
async fn the_list_has_no_tasks(world: &mut TodoWorld) {
    assert_eq!(world.titles(), Vec::<String>::new());
}

#[given(expr = "the list already has {string}")]
async fn the_list_already_has(world: &mut TodoWorld, title: String) {
    world.add(&title);
    assert!(world.titles().contains(&title));
}

#[when(expr = "the person adds {string}")]
async fn the_person_adds(world: &mut TodoWorld, title: String) {
    world.add(&title);
}

#[then(expr = "the list shows {string}")]
async fn the_list_shows(world: &mut TodoWorld, title: String) {
    assert!(world.titles().contains(&title), "expected the list to show {title:?}");
}

#[tokio::main]
async fn main() {
    // With TOUCHSTONE_MESSAGES set, write a Cucumber JSON report there so the
    // red check can tell an assertion failure from a broken test.
    if let Ok(path) = std::env::var("TOUCHSTONE_MESSAGES") {
        let file = std::fs::File::create(path).expect("create the report file");
        TodoWorld::cucumber()
            .max_concurrent_scenarios(1)
            .fail_on_skipped()
            .with_writer(
                writer::Basic::stdout()
                    .tee::<TodoWorld, _>(writer::Json::for_tee(file))
                    .summarized()
                    .normalized(),
            )
            .run_and_exit("features")
            .await;
    }
    TodoWorld::cucumber().fail_on_skipped().run_and_exit("features").await;
}
