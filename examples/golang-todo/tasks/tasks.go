// Package tasks holds the domain rules for the todo list.
package tasks

import (
	"errors"
	"strings"
	"sync"
)

// ErrBlankTitle is returned when a task has no title.
var ErrBlankTitle = errors.New("a task needs a title")

// List is a thread-safe, ordered list of task titles.
type List struct {
	mu     sync.Mutex
	titles []string
}

// Add appends a task. It rejects a blank title.
func (l *List) Add(title string) error {
	if strings.TrimSpace(title) == "" {
		return ErrBlankTitle
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.titles = append(l.titles, title)
	return nil
}

// Titles returns a copy of the titles in the order they were added.
func (l *List) Titles() []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return append([]string{}, l.titles...)
}
