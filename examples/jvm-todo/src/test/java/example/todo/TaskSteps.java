package example.todo;

import static org.assertj.core.api.Assertions.assertThat;

import io.cucumber.java.Before;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import io.cucumber.spring.CucumberContextConfiguration;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;

@CucumberContextConfiguration
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public class TaskSteps {

    private final HttpClient client = HttpClient.newHttpClient();

    @Autowired
    private Environment environment;

    @Autowired
    private TaskList tasks;

    @Before
    public void emptyTheList() {
        tasks.clear();
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
        return URI.create("http://127.0.0.1:" + environment.getProperty("local.server.port") + "/tasks");
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
