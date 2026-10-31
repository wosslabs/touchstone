package example.todo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

// Unit tests stay in src/test. Acceptance scenarios live in src/acceptanceTest.
class TaskListTest {

    @Test
    void keepsTasksInTheOrderTheyWereAdded() {
        TaskList list = new TaskList();
        list.add("Buy milk");
        list.add("Walk the dog");
        assertThat(list.titles()).containsExactly("Buy milk", "Walk the dog");
    }

    @Test
    void rejectsABlankTitle() {
        assertThatThrownBy(() -> new TaskList().add(" ")).isInstanceOf(IllegalArgumentException.class);
    }
}
