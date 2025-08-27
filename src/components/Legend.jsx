import React from 'react';

export default function Legend({ assignees = [] }) {
  return (
    <div className="flex flex-wrap items-center mb-4">
      {assignees.map((a) => (
        <div key={a.id} className="flex items-center mr-4 mb-2">
          <span
            className="inline-block w-4 h-4 mr-1 rounded"
            style={{ backgroundColor: a.color }}
          />
          <span className="text-sm">{a.name}</span>
        </div>
      ))}
    </div>
  );
}
