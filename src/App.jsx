import React, { useEffect, useState } from 'react';
import { useStore } from './store';
import { shallow } from 'zustand/shallow';
import ModeToggle from './components/ModeToggle.jsx';
import Legend from './components/Legend.jsx';
import FranceMap from './components/FranceMap.jsx';

function App() {
  const {
    fetchData,
    mode,
    assignees,
    selectedDepartments: selected,
    assignments,
    setHighlightedDepartments: setHighlighted,
    clearSelected,
    saveAssignments,
    setMode,
    // Recherche
    searchQuery,
    setSearchQuery,
    getSearchResults,
    isSearchOpen,
    openSearch,
    closeSearch,
    activeSearchCode,
    setActiveSearchCode,
    addAssignee,
    removeAssignee,
    updateAssignee,
  } = useStore(
    (state) => ({
      fetchData: state.fetchData,
      mode: state.mode,
      assignees: state.assignees,
      selectedDepartments: state.selectedDepartments,
      assignments: state.assignments,
      setHighlightedDepartments: state.setHighlightedDepartments,
      clearSelected: state.clearSelected,
      saveAssignments: state.saveAssignments,
      setMode: state.setMode,
      // recherche
      searchQuery: state.searchQuery,
      setSearchQuery: state.setSearchQuery,
      getSearchResults: state.getSearchResults,
      isSearchOpen: state.isSearchOpen,
      openSearch: state.openSearch,
      closeSearch: state.closeSearch,
      activeSearchCode: state.activeSearchCode,
      setActiveSearchCode: state.setActiveSearchCode,
      addAssignee: state.addAssignee,
      removeAssignee: state.removeAssignee,
      updateAssignee: state.updateAssignee,
    }),
    shallow
  );

  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [newAssigneeName, setNewAssigneeName] = useState('');
  const [newAssigneeColor, setNewAssigneeColor] = useState('#10b981');

  const [editAssigneeName, setEditAssigneeName] = useState('');
  const [editAssigneeColor, setEditAssigneeColor] = useState('#10b981');

  useEffect(() => {
    fetchData?.();
  }, [fetchData]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') closeSearch?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeSearch]);

  useEffect(() => {
    if (!selectedAssignee) {
      setEditAssigneeName('');
      setEditAssigneeColor('#10b981');
      return;
    }
    const a = (assignees || []).find((x) => x.id === selectedAssignee);
    if (a) {
      setEditAssigneeName(a.name || '');
      setEditAssigneeColor(a.color || '#10b981');
    }
  }, [selectedAssignee, assignees]);

  const handleAssign = async () => {
    if (!selectedAssignee || selected.length === 0) return;
    const next = { ...assignments };
    selected.forEach((code) => {
      const k = String(code);
      next[k] = selectedAssignee;
    });
    await saveAssignments(next);
    setSelectedAssignee('');
    clearSelected();
  };

  const handleRemove = async () => {
    if (selected.length === 0) return;
    const next = { ...assignments };
    selected.forEach((code) => {
      const k = String(code);
      if (k in next) delete next[k];
    });
    await saveAssignments(next);
    clearSelected();
  };

  const results = getSearchResults ? getSearchResults() : [];

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[1fr_320px] gap-4 p-4">
      <div className="flex flex-col items-stretch relative">
        <h1 className="text-2xl font-bold mb-4">Carte des départements de France</h1>
        <ModeToggle mode={mode} setMode={setMode} />

        <div className="mb-4 w-full max-w-xl">
          <input
            type="text"
            value={searchQuery || ''}
            onChange={(e) => {
              const v = e.target.value;
              setSearchQuery?.(v);
              if (v && v.length >= 2) openSearch?.(); else closeSearch?.();
            }}
            placeholder="Rechercher par code, nom ou chargé d'affaires..."
            className="w-full border rounded px-2 py-1"
            onFocus={() => { if ((searchQuery || '').length >= 2) openSearch?.(); }}
          />
        </div>

        {isSearchOpen && (
          <>
            {/* Click-catcher to close when clicking outside */}
            <div className="absolute inset-0 z-10" onClick={() => closeSearch?.()} />

            {/* Results panel (floating) */}
            <div className="absolute z-20 left-0 right-0 top-20 mx-auto max-w-xl">
              <div className="border rounded bg-white shadow-md max-h-[60vh] overflow-auto divide-y">
                {results.length === 0 && (
                  <div className="p-2 text-sm text-gray-500">Aucun résultat</div>
                )}
                {results.map((r) => (
                  <div key={r.code} className="p-2 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{r.code} — {r.name}</div>
                      <div className="text-xs text-gray-600">Chargé d'affaires : {r.assigneeName || '—'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-sm px-2 py-1 border rounded"
                        onClick={() => {
                          setHighlighted([r.code]);
                          setActiveSearchCode?.(r.code);
                          closeSearch?.();
                        }}
                      >
                        Voir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {mode === 'edit' && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select
              className="border rounded px-2 py-1"
              value={selectedAssignee}
              onChange={(e) => setSelectedAssignee(e.target.value)}
            >
              <option value="">Choisir un chargé d'affaires</option>
              {assignees?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleAssign}
              disabled={!selectedAssignee || selected.length === 0}
              className="px-4 py-1 bg-blue-600 text-white rounded disabled:bg-gray-300"
            >
              Attribuer
            </button>
            <button
              onClick={handleRemove}
              disabled={selected.length === 0}
              className="px-4 py-1 bg-red-600 text-white rounded disabled:bg-gray-300"
            >
              Retirer
            </button>
          <div className="text-sm text-gray-600">{selected.length} département(s) sélectionné(s)</div>

          {/* --- Gestion des chargés d'affaires --- */}
          <div className="w-full mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
            {/* A) Créer un chargé d'affaires */}
            {!selectedAssignee && (
              <>
                <input
                  type="text"
                  className="border rounded px-2 py-1"
                  placeholder="Nom du chargé d'affaires"
                  value={newAssigneeName}
                  onChange={(e) => setNewAssigneeName(e.target.value)}
                />
                <input
                  type="color"
                  className="border rounded w-10 h-8 p-0"
                  value={newAssigneeColor}
                  onChange={(e) => setNewAssigneeColor(e.target.value)}
                  title="Couleur"
                />
                <button
                  className="px-3 py-1 border rounded"
                  onClick={() => {
                    const name = newAssigneeName.trim();
                    if (!name) return;
                    const color = newAssigneeColor || '#10b981';
                    addAssignee && addAssignee(name, color);
                    setNewAssigneeName('');
                  }}
                >
                  Ajouter un chargé
                </button>
              </>
            )}

            {/* B) Modifier le chargé sélectionné (même UX que création) */}
            {selectedAssignee && (
              <>
                <input
                  type="text"
                  className="border rounded px-2 py-1"
                  placeholder="Nouveau nom"
                  value={editAssigneeName}
                  onChange={(e) => setEditAssigneeName(e.target.value)}
                />
                <input
                  type="color"
                  className="border rounded w-10 h-8 p-0"
                  value={editAssigneeColor}
                  onChange={(e) => setEditAssigneeColor(e.target.value)}
                  title="Nouvelle couleur"
                />
                <button
                  className="px-3 py-1 border rounded"
                  onClick={async () => {
                    const name = editAssigneeName.trim();
                    const patch = {};
                    if (name) patch.name = name;
                    if (editAssigneeColor) patch.color = editAssigneeColor;
                    if (Object.keys(patch).length > 0) {
                      await updateAssignee?.(selectedAssignee, patch);
                    }
                  }}
                >
                  Mettre à jour
                </button>
              </>
            )}

            {/* B) Supprimer le chargé sélectionné (désassigne automatiquement ses départements) */}
            <button
              className="ml-auto px-3 py-1 border rounded text-red-700 border-red-300 disabled:opacity-50"
              disabled={!selectedAssignee}
              onClick={() => {
                if (!selectedAssignee) return;
                removeAssignee && removeAssignee(selectedAssignee);
                if (selected.includes(selectedAssignee)) clearSelected();
                setSelectedAssignee('');
              }}
            >
              Supprimer ce chargé
            </button>
          </div>
        </div>
        )}

        <div className="w-full h-[min(78vh,calc(100vh-220px))]">
          <FranceMap />
        </div>
      </div>

      <aside className="md:sticky md:top-4">
        <Legend />
      </aside>
    </div>
  );
}

export default App;
