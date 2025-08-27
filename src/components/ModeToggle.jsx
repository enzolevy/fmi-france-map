import React from 'react';

export default function ModeToggle({ mode, setMode }) {
  const modes = [
    { value: 'view', label: 'Consultation' },
    { value: 'search', label: 'Recherche' },
    { value: 'edit', label: 'Édition' },
  ];
  return (
    <div className="flex space-x-2 mb-4">
      {modes.map((m) => (
        <button
          key={m.value}
          onClick={() => setMode(m.value)}
          className={`px-3 py-1 rounded ${
            mode === m.value
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-800'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
