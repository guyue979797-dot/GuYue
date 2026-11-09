/**
 * 用户管理数据 hook。
 */
import { useEffect, useState } from "../../lib/react.js";
import { listUsers } from "../../api/users.js";

export function useUsers() {
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await listUsers();
      setUsers(data.items || []);
      setStatus(null);
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  return { users, status, loading, loadUsers };
}

export default useUsers;
