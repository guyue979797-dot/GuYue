"""Observe commits through dedicated SQLite connections, including WAL and other processes."""
import sqlite3
from threading import RLock


class SQLiteRevisions:
    def __init__(self, paths):
        self.paths = paths
        self.connections = {}
        self.lock = RLock()

    def read(self):
        with self.lock:
            revisions = []
            for path in self.paths:
                identity = (path.stat().st_dev, path.stat().st_ino)
                previous = self.connections.get(path)
                if previous is None or previous[0] != identity:
                    if previous:
                        previous[1].close()
                    connection = sqlite3.connect(str(path), check_same_thread=False)
                    connection.execute('PRAGMA query_only=ON')
                    self.connections[path] = (identity, connection)
                connection = self.connections[path][1]
                revisions.append((identity, connection.execute('PRAGMA data_version').fetchone()[0]))
            return tuple(revisions)

    def close(self):
        with self.lock:
            for _, connection in self.connections.values():
                connection.close()
            self.connections.clear()

    def __del__(self):
        self.close()
