package example.todo;

import static org.assertj.core.api.Assertions.assertThat;

import io.cucumber.java.After;
import io.cucumber.java.Before;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;

// Acceptance steps talk to the running application over HTTP only. They never
// touch a production class except the entry point, so a pull request can swap
// in these steps on top of the base commit without recompiling anything else.
public class TaskSteps {

    private final HttpClient client = HttpClient.newHttpClient();

    private ConfigurableApplicationContext application;

    @Before
    public void startTheApplication() {
        application = SpringApplication.run(TodoApplication.class, "--server.port=0", "--spring.main.banner-mode=off");
    }

    @After
    public void stopTheApplication() {
        application.close();
    }

    @Given("the list has no tasks")
    public void theListHasNoTasks() throws Exception {
        assertThat(body()).isEqualTo("[]");
    }

    @Given("the list already has {string}")
    public void theListAlreadyHas(String title) throws Exception {
        add(title);
        assertThat(body()).contains(quoted(title));
    }

    @When("the person adds {string}")
    public void thePersonAdds(String title) throws Exception {
        add(title);
    }

    @Then("the list shows {string}")
    public void theListShows(String title) throws Exception {
        assertThat(body()).contains(quoted(title));
    }

    private URI uri() {
        return URI.create("http://127.0.0.1:" + application.getEnvironment().getProperty("local.server.port") + "/tasks");
    }

    private void add(String title) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(uri())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"title\":" + quoted(title) + "}"))
                .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(201);
    }

    private String body() throws Exception {
        HttpResponse<String> response = client.send(HttpRequest.newBuilder(uri()).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        return response.body();
    }

    private static String quoted(String text) {
        return "\"" + text.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
}
