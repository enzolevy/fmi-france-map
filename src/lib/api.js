import axios from 'axios';

// --- Assignees ---
export async function getAssignees() {
  const response = await axios.get('/api/assignees');
  return response.data;
}

export async function createAssignee(name, color) {
  const payload = { name, color };
  const response = await axios.post('/api/assignees', payload);
  return response.data; // { id, name, color }
}

export async function updateAssignee(id, patch) {
  let targetId = id;
  try {
    // If the provided value isn't a known id, attempt to resolve by name
    const list = await getAssignees();
    const foundById = Array.isArray(list) ? list.find((a) => a && String(a.id) === String(id)) : null;
    if (!foundById) {
      const byName = Array.isArray(list) ? list.find((a) => a && String(a.name) === String(id)) : null;
      if (byName) targetId = byName.id;
    }
  } catch (_) {
    // Non-fatal: if fetching assignees fails, we just try the original id
  }
  const response = await axios.patch(`/api/assignees/${targetId}`, patch || {});
  return response.data; // { id, name, color }
}

export async function deleteAssignee(id) {
  // Fallback compatible with environments that block HTTP DELETE
  const response = await axios.post('/api/assignees', { _delete: true, id });
  return response.data;
}

// --- Assignments ---
export async function getAssignments() {
  const response = await axios.get('/api/assignments');
  return response.data; // { [code]: assigneeId }
}

/**
 * Save assignments using a DIFF-like payload.
 * Expects a plain object mapping department codes to assigneeId or null, e.g.:
 *   { "33": "ca_123", "75": null }
 * Backward-compat: if you pass { assignments: {...} }, we unwrap it.
 */
export async function saveAssignments(updates) {
  const body = (updates && updates.assignments) ? updates.assignments : (updates || {});
  const response = await axios.post('/api/assignments', body);
  return response.data;
}

// Alias for clarity
export const saveAssignmentsDiff = saveAssignments;
