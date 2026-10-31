fn main() {
    let running = touchstone_rust_todo::server::start(8080);
    println!("listening on {}", running.port);
    loop {
        std::thread::park();
    }
}
