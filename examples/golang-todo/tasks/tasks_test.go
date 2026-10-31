package tasks

import (
	"errors"
	"slices"
	"testing"
)

// Unit tests stay next to the code. Acceptance scenarios live in features/.
func TestKeepsTasksInOrder(t *testing.T) {
	var list List
	_ = list.Add("Buy milk")
	_ = list.Add("Walk the dog")
	if got := list.Titles(); !slices.Equal(got, []string{"Buy milk", "Walk the dog"}) {
		t.Fatalf("got %v", got)
	}
}

func TestRejectsABlankTitle(t *testing.T) {
	var list List
	if err := list.Add("  "); !errors.Is(err, ErrBlankTitle) {
		t.Fatalf("got %v", err)
	}
}
