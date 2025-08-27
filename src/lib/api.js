import axios from 'axios';

// API calls for assignees, assignments
export async function getAssignees() {
  const response = await axios.get('/api/assignees');
  return response.data;
}

export async function getAssignments() {
  const response = await axios.get('/api/assignments');
  return response.data;
}

export async function saveAssignments(assignments) {
  // expects an object { departmentCode: assigneeId }
  const response = await axios.post('/api/assignments', { assignments });
  return response.data;
}
