package example.todo;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.stereotype.Component;

@Component
public class TaskList {

    private final List<String> titles = new CopyOnWriteArrayList<>();

    public void add(String title) {
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("a task needs a title");
        }
        titles.add(title);
    }

    public List<String> titles() {
        return List.copyOf(titles);
    }

    public void clear() {
        titles.clear();
    }
}
