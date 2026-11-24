"""extract.py: duplicate, differing, zero and misordered blocks (criteria 4 to 6)."""
import os, subprocess, sys, tempfile, unittest

EXTRACT = os.path.join(os.path.dirname(__file__), "..", "bin", "extract.py")
PASS = "VERDICT: PASS\nall good"
CHANGES = "VERDICT: CHANGES\n1. broken"


def block(body, mark="REVIEW"):
    return f"<<<{mark}>>>\n{body}\n<<<END>>>\n"


def run(text, *args):
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
        f.write(text)
    try:
        p = subprocess.run([sys.executable, EXTRACT, f.name, "REVIEW", *args], capture_output=True, text=True)
    finally:
        os.unlink(f.name)
    return p.returncode, p.stdout


class Extract(unittest.TestCase):
    def test_one_block(self):
        self.assertEqual(run("chatter\n" + block(PASS)), (0, PASS + "\n"))

    def test_identical_duplicate_prints_once(self):
        self.assertEqual(run(block(PASS) + "footer\n" + block(PASS)), (0, PASS + "\n"))

    def test_identical_duplicate_with_last_prints_once(self):
        self.assertEqual(run(block(PASS) + block(PASS), "--last"), (0, PASS + "\n"))

    def test_differing_blocks_exit_2_without_last(self):
        self.assertEqual(run(block(CHANGES) + block(PASS))[0], 2)
        self.assertEqual(run(block(PASS) + block(CHANGES))[0], 2)

    def test_differing_blocks_with_last_take_the_last(self):
        self.assertEqual(run(block(CHANGES) + block(PASS), "--last"), (0, PASS + "\n"))
        self.assertEqual(run(block(PASS) + block(CHANGES), "--last"), (0, CHANGES + "\n"))

    def test_first_check_applies_to_the_chosen_block(self):
        rx = ["--first", r"^VERDICT: (PASS|CHANGES)$"]
        self.assertEqual(run(block("nope") + block(PASS), "--last", *rx), (0, PASS + "\n"))
        self.assertEqual(run(block(PASS) + block("nope"), "--last", *rx)[0], 2)

    def test_copilot_share_escapes(self):
        text = "\\<\\<\\<REVIEW\\>\\>\\>\n" + PASS + "\n\\<\\<\\<END\\>\\>\\>\n"
        self.assertEqual(run(text, "--last"), (0, PASS + "\n"))

    def test_zero_blocks(self):
        self.assertEqual(run("nothing here\n")[0], 2)
        self.assertEqual(run("nothing here\n", "--last")[0], 2)

    def test_start_without_end(self):
        self.assertEqual(run("<<<REVIEW>>>\n" + PASS + "\n")[0], 2)
        self.assertEqual(run("<<<REVIEW>>>\n" + PASS + "\n", "--last")[0], 2)

    def test_second_start_without_end(self):
        self.assertEqual(run(block(PASS) + "<<<REVIEW>>>\nmore\n", "--last")[0], 2)

    def test_end_before_start(self):
        self.assertEqual(run("<<<END>>>\n<<<REVIEW>>>\n" + PASS + "\n")[0], 2)
        self.assertEqual(run("<<<END>>>\n" + block(PASS), "--last")[0], 2)

    def test_inline_marker_mentions_are_ignored(self):
        prompt = "Print between <<<REVIEW>>> and <<<END>>> a verdict.\n"
        self.assertEqual(run(prompt + block(PASS)), (0, PASS + "\n"))

    def test_bob_tui_decoration(self):
        text = "│ • <<<REVIEW>>>      │\n│   VERDICT: PASS     │\n│   fine              │\n│ <<<END>>>           │\n"
        self.assertEqual(run(text), (0, "VERDICT: PASS\nfine\n"))


if __name__ == "__main__":
    unittest.main()
