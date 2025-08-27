import create from 'zustand';
import axios from 'axios';

const useStore = create((set, get) => ({
  mode: 'view',
  assignees: [],
  assignments: {},
  selectedDepartments: [],
  highlightedDepartments: [],
  setMode: (mode) => set({ mode }),
  setHighlightedDepartments: (codes) => set({ highlightedDepartments: codes }),
  clearHighlighted: () => set({ highlightedDepartments: [] }),
  clearSelected: () => set({ selectedDepartments: [] }),
  fetchData: async () => {
    try {
      const [assRes, assignRes] = await Promise.all([
        axios.get('/api/assignees'),
        axios.get('/api/assignments'),
      ]);
      set({ assignees: assRes.data, assignments: assignRes.data });
    } catch (err) {
      // fallback to local JSON during dev
      try {
        const assignees = (await import('../data/assignees.json')).default;
        const assignments = (await import('../data/assignments.json')).default;
        set({ assignees, assignments });
      } catch (e) {
        console.error('Failed to load local data', e);
      }
    }
  },
  selectDepartment: (code) => {
    const { selectedDepartments } = get();
    if (selectedDepartments.includes(code)) {
      set({ selectedDepartments: selectedDepartments.filter((c) => c !== code) });
    } else {
      set({ selectedDepartments: [...selectedDepartments, code] });
    }
  },
  saveAssignments: async (newAssignments) => {
    try {
      await axios.post('/api/assignments', newAssignments);
      set({ assignments: newAssignments, selectedDepartments: [] });
    } catch (err) {
      // fallback: update local state
      set({ assignments: newAssignments, selectedDepartments: [] });
      console.error('Failed to save assignments', err);
    }
  },
}));

export { useStore };
