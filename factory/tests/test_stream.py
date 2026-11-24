import json, os, subprocess, sys, tempfile, unittest

BIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bin")
SAMPLE = "{\"type\":\"system\",\"subtype\":\"init\"}\n{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"tool_use\",\"name\":\"Bash\",\"input\":{\"command\":\"./gradlew test\"}}]}}\n{\"type\":\"user\",\"message\":{\"content\":[{\"type\":\"tool_result\",\"is_error\":true,\"content\":\"denied: not allowed\"}]}}\n{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"Reading the spec now.\"}]}}\n{\"type\":\"result\",\"subtype\":\"success\",\"is_error\":false,\"result\":\"# Title\\nthe answer\",\"num_turns\":3,\"total_cost_usd\":0.1234}\n"


def run(script, path, timeout=10):
    return subprocess.run([sys.executable, os.path.join(BIN, script), path], capture_output=True, text=True, timeout=timeout)


class StreamTest(unittest.TestCase):
    def write(self, text):
        handle = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False)
        handle.write(text)
        handle.close()
        self.addCleanup(os.unlink, handle.name)
        return handle.name

    def test_result_is_the_final_result_text(self):
        done = run("stream-result.py", self.write(SAMPLE))
        self.assertEqual((done.returncode, done.stdout), (0, "# Title\nthe answer\n"))

    def test_no_result_event_is_exit_2(self):
        cut = "".join(SAMPLE.splitlines(True)[:-1])
        done = run("stream-result.py", self.write(cut))
        self.assertEqual(done.returncode, 2)
        self.assertIn("no result event", done.stderr)

    def test_an_error_result_is_exit_2(self):
        bad = SAMPLE.replace('"is_error": false', '"is_error": true') if '"is_error": false' in SAMPLE else SAMPLE.replace('"is_error":false', '"is_error":true')
        done = run("stream-result.py", self.write(bad))
        self.assertEqual(done.returncode, 2)
        self.assertIn("error", done.stderr)

    def test_an_empty_result_is_exit_2(self):
        done = run("stream-result.py", self.write(json.dumps({"type": "result", "is_error": False, "result": "  "}) + "\n"))
        self.assertEqual(done.returncode, 2)

    def test_garbage_lines_are_skipped(self):
        done = run("stream-result.py", self.write("not json\n" + SAMPLE))
        self.assertEqual(done.returncode, 0)

    def test_view_prints_tools_messages_errors_and_the_end(self):
        done = run("stream-view.py", self.write(SAMPLE))
        self.assertEqual(done.returncode, 0)
        lines = done.stdout.splitlines()
        self.assertEqual(lines[0], "▸ Bash ./gradlew test")
        self.assertIn("  ✗ denied: not allowed", lines)
        self.assertIn("· Reading the spec now.", lines)
        self.assertEqual(lines[-1], "■ done, 3 turns, $0.12")

    def test_view_waits_for_a_file_that_appears_later(self):
        path = os.path.join(tempfile.mkdtemp(), "late.jsonl")
        viewer = subprocess.Popen([sys.executable, os.path.join(BIN, "stream-view.py"), path], stdout=subprocess.PIPE, text=True)
        self.addCleanup(viewer.kill)
        with open(path, "w") as stream:
            stream.write(SAMPLE)
        out, _ = viewer.communicate(timeout=10)
        self.assertIn("■ done", out)

    def test_view_survives_a_partial_last_line(self):
        half = SAMPLE.splitlines(True)
        path = self.write("".join(half[:-1]) + half[-1][:20])
        viewer = subprocess.Popen([sys.executable, os.path.join(BIN, "stream-view.py"), path], stdout=subprocess.PIPE, text=True)
        self.addCleanup(viewer.kill)
        with open(path, "a") as stream:
            stream.write(half[-1][20:])
        out, _ = viewer.communicate(timeout=10)
        self.assertIn("■ done", out)


if __name__ == "__main__":
    unittest.main()
