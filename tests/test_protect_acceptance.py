import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "hooks" / "protect-acceptance.py"


def decide(payload: dict) -> dict:
    result = subprocess.run(
        ["python3", str(SCRIPT)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


class ProtectAcceptanceTest(unittest.TestCase):
    def test_denies_write_to_approved_example(self):
        decision = decide(
            {
                "tool_name": "Write",
                "tool_input": {"file_path": "acceptance/examples/pay.md"},
            }
        )
        self.assertEqual(decision["permission"], "deny")

    def test_allows_read_of_approved_example(self):
        decision = decide(
            {
                "tool_name": "Read",
                "tool_input": {"path": "acceptance/examples/pay.md"},
            }
        )
        self.assertEqual(decision["permission"], "allow")

    def test_allows_running_the_scenario(self):
        decision = decide(
            {"command": "pytest acceptance/examples/pay.md -q"}
        )
        self.assertEqual(decision["permission"], "allow")

    def test_denies_redirect_into_approved_example(self):
        decision = decide(
            {"command": "echo hello > acceptance/examples/pay.md"}
        )
        self.assertEqual(decision["permission"], "deny")

    def test_denies_write_hidden_after_a_test_command(self):
        decision = decide(
            {
                "command": (
                    "pytest -q; "
                    "python3 -c \"open('acceptance/examples/pay.md','w').write('x')\""
                )
            }
        )
        self.assertEqual(decision["permission"], "deny")

    def test_denies_write_to_the_guard_script(self):
        decision = decide(
            {
                "tool_name": "Edit",
                "tool_input": {"path": "ci/check_acceptance_guard.py"},
            }
        )
        self.assertEqual(decision["permission"], "deny")

    def test_allows_a_draft(self):
        decision = decide(
            {
                "tool_name": "Write",
                "tool_input": {"path": "acceptance/drafts/pay.md"},
            }
        )
        self.assertEqual(decision["permission"], "allow")

    def test_claude_payload_includes_both_decision_shapes(self):
        decision = decide(
            {
                "hook_event_name": "PreToolUse",
                "tool_name": "Bash",
                "tool_input": {
                    "command": "rm -rf acceptance/examples",
                },
            }
        )
        self.assertEqual(decision["permission"], "deny")
        self.assertEqual(
            decision["hookSpecificOutput"]["permissionDecision"],
            "deny",
        )

    def test_unknown_payload_is_allowed(self):
        decision = decide({"unrelated": True})
        self.assertEqual(decision["permission"], "allow")


if __name__ == "__main__":
    unittest.main()
