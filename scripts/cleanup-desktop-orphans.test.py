import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "cleanup", Path(__file__).with_name("cleanup-desktop-orphans.py")
)
cleanup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleanup)


class CleanupTests(unittest.TestCase):
    def test_only_orphaned_exact_watchers_qualify(self):
        self.assertTrue(cleanup.is_watcher((1, "start", "node scripts/dev-electron.mjs")))
        for parent, command in [
            (42, "node scripts/dev-electron.mjs"),
            (1, "node scripts/dev-electron.mjs --something"),
            (1, "sh -c 'node scripts/dev-electron.mjs'"),
            (1, "node /another/worktree/scripts/dev-electron.mjs"),
        ]:
            self.assertFalse(cleanup.is_watcher((parent, "start", command)))

    def test_descendants_exclude_healthy_sibling_tree(self):
        processes = {
            10: (1, "start", "watcher"),
            11: (10, "start", "electron"),
            12: (11, "start", "backend"),
            20: (1, "start", "healthy watcher"),
            21: (20, "start", "healthy electron"),
        }
        self.assertEqual(cleanup.descendants(processes, 10), [11, 12])

    def test_reused_pid_is_not_signaled(self):
        with patch.object(cleanup, "snapshot", return_value={10: (1, "new start", "node")}), \
                patch.object(cleanup.os, "kill") as kill:
            cleanup.send(10, (1, "old start", "node"), cleanup.signal.SIGKILL)
            kill.assert_not_called()

    def test_reparented_captured_child_is_signaled(self):
        with patch.object(cleanup, "snapshot", return_value={10: (1, "start", "electron")}), \
                patch.object(cleanup.os, "kill") as kill:
            cleanup.send(10, (42, "start", "electron"), cleanup.signal.SIGTERM)
            kill.assert_called_once_with(10, cleanup.signal.SIGTERM)


if __name__ == "__main__":
    unittest.main()
