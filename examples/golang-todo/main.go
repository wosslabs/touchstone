package main

import (
	"log"
	"net/http"

	"example.com/touchstone-golang-todo/server"
	"example.com/touchstone-golang-todo/tasks"
)

func main() {
	log.Fatal(http.ListenAndServe(":8080", server.New(&tasks.List{})))
}
