package features

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"testing"

	"github.com/cucumber/godog"

	"example.com/touchstone-golang-todo/server"
	"example.com/touchstone-golang-todo/tasks"
)

type world struct {
	server *httptest.Server
}

type worldKey struct{}

func current(ctx context.Context) *world { return ctx.Value(worldKey{}).(*world) }

// Acceptance steps talk to the running service over HTTP only.
func (w *world) add(title string) error {
	body, _ := json.Marshal(map[string]string{"title": title})
	response, err := http.Post(w.server.URL+"/tasks", "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated {
		return fmt.Errorf("expected 201, got %d", response.StatusCode)
	}
	return nil
}

func (w *world) titles() ([]string, error) {
	response, err := http.Get(w.server.URL + "/tasks")
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("expected 200, got %d", response.StatusCode)
	}
	var titles []string
	return titles, json.NewDecoder(response.Body).Decode(&titles)
}

func (w *world) expectShown(title string) error {
	titles, err := w.titles()
	if err != nil {
		return err
	}
	if !slices.Contains(titles, title) {
		return fmt.Errorf("expected the list to show %q, got %v", title, titles)
	}
	return nil
}

func initializeScenario(sc *godog.ScenarioContext) {
	sc.Before(func(ctx context.Context, _ *godog.Scenario) (context.Context, error) {
		w := &world{server: httptest.NewServer(server.New(&tasks.List{}))}
		return context.WithValue(ctx, worldKey{}, w), nil
	})
	sc.After(func(ctx context.Context, _ *godog.Scenario, _ error) (context.Context, error) {
		current(ctx).server.Close()
		return ctx, nil
	})

	sc.Step(`^the list has no tasks$`, func(ctx context.Context) error {
		titles, err := current(ctx).titles()
		if err != nil {
			return err
		}
		if len(titles) != 0 {
			return fmt.Errorf("expected no tasks, got %v", titles)
		}
		return nil
	})
	sc.Step(`^the list already has "([^"]*)"$`, func(ctx context.Context, title string) error {
		w := current(ctx)
		if err := w.add(title); err != nil {
			return err
		}
		return w.expectShown(title)
	})
	sc.Step(`^the person adds "([^"]*)"$`, func(ctx context.Context, title string) error {
		return current(ctx).add(title)
	})
	sc.Step(`^the list shows "([^"]*)"$`, func(ctx context.Context, title string) error {
		return current(ctx).expectShown(title)
	})
}

func TestFeatures(t *testing.T) {
	format := "pretty"
	if report := os.Getenv("TOUCHSTONE_MESSAGES"); report != "" {
		format = "pretty,cucumber:" + report
	}
	suite := godog.TestSuite{
		ScenarioInitializer: initializeScenario,
		Options: &godog.Options{
			Format:   format,
			Paths:    []string{"."},
			Strict:   true,
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("acceptance scenarios failed")
	}
}
