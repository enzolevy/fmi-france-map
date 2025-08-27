import React, { useEffect, useState } from 'react';
import { useStore } from './store';
import ModeToggle from './components/ModeToggle.jsx';
import Legend from './components/Legend.jsx';
import FranceMap from './components/FranceMap.jsx';

function App() {
  const fetchData = useStore((state) => state.fetchData);
  const mode = useStore((state) => state.mode);
  const assignees = useStore((state) => state.assignees);
  const selected = useStore((state) => state.selectedDepartments);
  const assignments = useStore((state) => state.assignments);
  const setHighlighted = useStore((state) => state.setHighlightedDepartments);
  const clearSelected = useStore((state) => state.clearSelected);
  const saveAssignments = useStore((state) => state.saveAssignments);

  const [selectedAssignee, setSelectedAssignee] = useState('');

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!selectedAssignee || selected.length === 0) return;
    const newAssignments = { ...assignments };
    selected.forEach((code) => {
      newAssignments[code] = selectedAssignee;
    });
    await saveAssignments(newAssignments);
    setSelectedAssignee('');
    clearSelected();
  };

  const handleSearchChange = (e) => {
    const query = e.target.value.trim();
    if (!query) {
      setHighlighted([]);
      return;
    }
    // Search by department code
    setHighlighted([query]);
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      <h1 className="text-2xl font-bold mb-4">Carte des départements de France</h1>
      <ModeToggle />
      {mode === 'search' && (
        <div className="mb-4 w-full max-w-sm">
          <input
            type="text"
            onChange={handleSearchChange}
            placeholder="Entrez le code du département..."
            className="w-full border rounded px-2 py-1"
          />
        </div>
      )}
      {mode === 'edit' && (
        <div className="mb-4 flex items-center space-x-2">
          <select
            className="border rounded px-2 py-1"
            value={selectedAssignee}
            onChange={(e) => setSelectedAssignee(e.target.value)}
          >
            <option value="">Choisir un chargé d'affaires</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleSave}
            disabled={!selectedAssignee || selected.length === 0}
            className="px-4 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300"
          >
            Enregistrer
          </button>
        </div>
      )}
      <div className="w-full" style={{ height: '70vh' }}>
        <FranceMap />
      </div>
      <Legend />
    </div>
  );
}

export default App;
