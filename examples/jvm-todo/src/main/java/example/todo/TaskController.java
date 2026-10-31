package example.todo;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TaskController {

    public record NewTask(String title) {}

    private final TaskList tasks;

    public TaskController(TaskList tasks) {
        this.tasks = tasks;
    }

    @GetMapping("/tasks")
    public List<String> list() {
        return tasks.titles();
    }

    @PostMapping("/tasks")
    @ResponseStatus(HttpStatus.CREATED)
    public void add(@RequestBody NewTask task) {
        tasks.add(task.title());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public String invalid(IllegalArgumentException error) {
        return error.getMessage();
    }
}
