import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "ci" / "check_acceptance_guard.py"

EXAMPLE = """Scenario: Declined card
Given the bank declines the card
When the customer confirms payment
Then the customer sees "payment failed"
And the customer is not charged
"""


def git(repo: Path, *args: str) -> None:
    subprocess.run(
        [
            "git",
            "-c",
            "user.email=touchstone@example.com",
            "-c",
            "user.name=Touchstone Test",
            *args,
        ],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
    )


def commit_file(repo: Path, relative: str, content: str, message: str) -> None:
    path = repo / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    git(repo, "add", relative)
    git(repo, "commit", "-m", message)


def run_guard(repo: Path, *extra: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["python3", str(SCRIPT), "--repo", str(repo), *extra],
        cwd=repo,
        capture_output=True,
        text=True,
        check=False,
    )


class AcceptanceGuardTest(unittest.TestCase):
    def setUp(self):
        self.repo = Path(self.id().replace(".", "_"))
        base = Path.cwd() / ".tmp-tests"
        base.mkdir(exist_ok=True)
        self.repo = base / self.repo.name
        if self.repo.exists():
            subprocess.run(["rm", "-rf", str(self.repo)], check=True)
        self.repo.mkdir()
        git(self.repo, "init", "-b", "main")
        commit_file(
            self.repo,
            "acceptance/examples/pay.md",
            EXAMPLE,
            "approve the declined-card sentence",
        )

    def tearDown(self):
        subprocess.run(["rm", "-rf", str(self.repo)], check=True)

    def test_passes_when_sentences_stay(self):
        commit_file(self.repo, "src/Pay.java", "class Pay {}\n", "add code")
        result = run_guard(self.repo, "--base", "HEAD~1")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_fails_when_a_sentence_is_removed(self):
        shortened = "".join(
            line for line in EXAMPLE.splitlines(True) if not line.startswith("And ")
        )
        commit_file(
            self.repo,
            "acceptance/examples/pay.md",
            shortened,
            "drop the charge sentence",
        )
        result = run_guard(self.repo, "--base", "HEAD~1")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("dropped", result.stdout)

    def test_person_can_allow_a_drop(self):
        shortened = "".join(
            line for line in EXAMPLE.splitlines(True) if not line.startswith("And ")
        )
        shortened += "Touchstone-Allow-Drop: the charge sentence moved to another story\n"
        commit_file(
            self.repo,
            "acceptance/examples/pay.md",
            shortened,
            "retire the charge sentence",
        )
        result = run_guard(self.repo, "--base", "HEAD~1")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_fails_when_a_test_is_disabled(self):
        commit_file(
            self.repo,
            "src/PayTest.java",
            "@Disabled\nclass PayTest {}\n",
            "switch a test off",
        )
        result = run_guard(self.repo, "--base", "HEAD~1")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("@Disabled", result.stdout)

    def test_missing_base_fails(self):
        result = run_guard(self.repo, "--base", "does-not-exist")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("not found", result.stderr)


if __name__ == "__main__":
    unittest.main()
