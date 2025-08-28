import React, { useState } from 'react';
import { useStore } from '../store';

export default function Legend() {
  const assignees = useStore((s) => s.assignees);
  const highlightByAssignee = useStore((s) => s.highlightByAssignee);
  const getDepartmentsByAssignee = useStore((s) => s.getDepartmentsByAssignee);
  const setHighlightedDepartments = useStore((s) => s.setHighlightedDepartments);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const openSearch = useStore((s) => s.openSearch);
  const activeSearchCode = useStore((s) => s.activeSearchCode);
  const getDeptDetail = useStore((s) => s.getDeptDetail);
  const setActiveSearchCode = useStore((s) => s.setActiveSearchCode);

  const [openId, setOpenId] = useState(null);
  const detail = activeSearchCode ? getDeptDetail(activeSearchCode) : null;

  return (
    <div className="border rounded p-3 bg-white">
      <h2 className="font-semibold mb-2">Chargés d'affaires</h2>
      <ul className="space-y-2">
        {assignees.map((a) => {
          const list = getDepartmentsByAssignee(a.id);
          return (
            <li key={a.id}>
              <button
                className="flex items-center gap-2 hover:underline"
                onClick={() => {
                  const isOpen = openId === a.id;
                  if (isOpen) {
                    // Toggle OFF: fermer panneau + retirer le surlignage
                    setOpenId(null);
                    setHighlightedDepartments([]);
                    setSearchQuery('');
                  } else {
                    // Toggle ON: surligner + ouvrir + afficher la même liste que la recherche (overlay)
                    highlightByAssignee(a.id);
                    setOpenId(a.id);
                    setSearchQuery(a.name || '');
                    openSearch();
                  }
                }}
              >
                <span className="inline-block w-3 h-3 rounded" style={{ background: a.color }} />
                <span>{a.name}</span>
                <span className="text-xs text-gray-500">({list.length})</span>
              </button>
              {openId === a.id && list.length > 0 && (
                <div className="mt-1 pl-5 text-sm text-gray-700">
                  <div className="flex flex-wrap gap-1">
                    {list.map((d) => (
                      <button
                        key={d.code}
                        className="px-1 py-0.5 bg-gray-100 rounded hover:bg-gray-200"
                        title={d.name}
                        onClick={() => {
                          setHighlightedDepartments([d.code]);
                          setActiveSearchCode(d.code);
                        }}
                      >
                        {d.code}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {detail && (
        <div className="mt-4 border rounded p-3 bg-white">
          <div className="font-semibold">{detail.code} — {detail.name}</div>
          <div className="text-sm text-gray-700">Chargé d'affaires : {detail.assigneeName || '—'}</div>
          <div className="mt-2 flex gap-2">
            <button
              className="px-2 py-1 border rounded"
              onClick={() => setHighlightedDepartments([detail.code])}
            >
              Voir sur la carte
            </button>
            <button
              className="px-2 py-1 border rounded"
              onClick={() => setActiveSearchCode(null)}
            >
              Effacer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
