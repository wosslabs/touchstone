package example.todo;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

// Architecture rules, checked as an ordinary test. The task list is the business
// rule; it must not know about the web layer or the framework that serves it.
@AnalyzeClasses(packages = "example.todo", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    @ArchTest
    static final ArchRule taskListKnowsNothingOfTheWeb = noClasses()
            .that().haveSimpleName("TaskList")
            .should().dependOnClassesThat().resideInAnyPackage("org.springframework.web..", "jakarta.servlet..", "org.springframework.http..");

    @ArchTest
    static final ArchRule taskListDoesNoIo = noClasses()
            .that().haveSimpleName("TaskList")
            .should().dependOnClassesThat().resideInAnyPackage("java.io..", "java.nio.file..", "java.net..");
}
