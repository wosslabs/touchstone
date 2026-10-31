// Package server exposes the todo list over HTTP.
package server

import (
	"encoding/json"
	"errors"
	"net/http"

	"example.com/touchstone-golang-todo/tasks"
)

// New returns a handler for GET and POST /tasks backed by list.
func New(list *tasks.List) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /tasks", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(list.Titles())
	})
	mux.HandleFunc("POST /tasks", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Title string `json:"title"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := list.Add(body.Title); err != nil {
			status := http.StatusInternalServerError
			if errors.Is(err, tasks.ErrBlankTitle) {
				status = http.StatusBadRequest
			}
			http.Error(w, err.Error(), status)
			return
		}
		w.WriteHeader(http.StatusCreated)
	})
	return mux
}
