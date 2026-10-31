from std.testing import assert_equal, assert_raises

from tasks import render, validate_title


# Unit tests stay in tests/. Acceptance scenarios live in features/.
def test_renders_titles_in_order() raises:
    var titles = List[String]()
    titles.append("Buy milk")
    titles.append("Walk the dog")
    assert_equal(render(titles), "Buy milk\nWalk the dog\n")


def test_rejects_a_blank_title() raises:
    with assert_raises():
        validate_title("  ")


def main() raises:
    test_renders_titles_in_order()
    test_rejects_a_blank_title()
    print("ok")
