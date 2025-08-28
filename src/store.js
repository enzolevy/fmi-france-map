import { create } from 'zustand';
import axios from 'axios';
import { updateAssignee as apiUpdateAssignee, deleteAssignee as apiDeleteAssignee } from './lib/api';

const useStore = create((set, get) => ({
  mode: 'view',
  assignees: [],
  assignments: {},
  selectedDepartments: [],
  highlightedDepartments: [],
  // --- Recherche & métadonnées ---
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q ?? '' }),
  departmentsMeta: [], // [{ code, name, regionCode }]
  setDepartmentsMeta: (list) => set({ departmentsMeta: Array.isArray(list) ? list : [] }),

  // --- UI Recherche (overlay) ---
  isSearchOpen: false,
  openSearch: () => set({ isSearchOpen: true }),
  closeSearch: () => set({ isSearchOpen: false }),
  activeSearchCode: null,
  setActiveSearchCode: (code) => set({ activeSearchCode: code ?? null }),
  setMode: (mode) => set({ mode }),
  setHighlightedDepartments: (codes) => set({ highlightedDepartments: codes }),
  clearHighlighted: () => set({ highlightedDepartments: [] }),
  clearSelected: () => set({ selectedDepartments: [] }),
  fetchData: async () => {
    const [assigneesRes, assignmentsRes] = await Promise.allSettled([
      axios.get('/api/assignees'),
      axios.get('/api/assignments'),
    ]);

    const next = {};

    // Assignees
    if (assigneesRes.status === 'fulfilled' && Array.isArray(assigneesRes.value?.data)) {
      next.assignees = assigneesRes.value.data;
    } else {
      // Fallback per-resource en dev uniquement
      try {
        const fallback = (await import('../data/assignees.json')).default;
        if (Array.isArray(fallback)) next.assignees = fallback;
      } catch (e) {
        console.warn('Assignees fetch failed', assigneesRes.reason || e);
      }
    }

    // Assignments
    if (assignmentsRes.status === 'fulfilled' && assignmentsRes.value?.data) {
      next.assignments = assignmentsRes.value.data;
    } else {
      try {
        const fallback = (await import('../data/assignments.json')).default;
        if (fallback) next.assignments = fallback;
      } catch (e) {
        console.warn('Assignments fetch failed', assignmentsRes.reason || e);
      }
    }

    set(next);
  },
  selectDepartment: (code) => {
    const { selectedDepartments } = get();
    if (selectedDepartments.includes(code)) {
      set({ selectedDepartments: selectedDepartments.filter((c) => c !== code) });
    } else {
      set({ selectedDepartments: [...selectedDepartments, code] });
    }
  },

  // --- Affectations par département ---
  setAssigneeForDepartment: (code, assigneeId) => {
    const { assignments } = get();
    const next = { ...assignments, [code]: assigneeId };
    set({ assignments: next });
  },
  clearAssignee: (code) => {
    const { assignments } = get();
    const { [code]: _removed, ...rest } = assignments || {};
    set({ assignments: rest });
  },

  // --- Highlight/consultation ---
  highlightByAssignee: (assigneeId) => {
    const { assignments } = get();
    const codes = Object.keys(assignments || {}).filter((c) => assignments[c] === assigneeId);
    set({ highlightedDepartments: codes });
    return codes;
  },

  // --- Sélecteurs utilitaires ---
  getDepartmentsByAssignee: (assigneeId) => {
    const { assignments, departmentsMeta } = get();
    const codes = Object.keys(assignments || {}).filter((c) => assignments[c] === assigneeId);
    const byCode = new Map(departmentsMeta.map((d) => [d.code, d]));
    return codes
      .map((c) => ({ code: c, name: byCode.get(c)?.name || '' }))
      .sort((a, b) => a.code.localeCompare(b.code));
  },
  getSearchResults: () => {
    const { searchQuery, departmentsMeta, assignments, assignees } = get();
    const q = (searchQuery || '').trim().toLowerCase();
    const byAssignee = new Map((assignees || []).map((a) => [a.id, a]));
    const base = (departmentsMeta || []).map((d) => {
      const aid = assignments?.[d.code];
      const a = aid ? byAssignee.get(aid) : null;
      return {
        code: d.code,
        name: d.name || '',
        assigneeId: aid || null,
        assigneeName: a?.name || null,
      };
    });
    if (!q) return base.sort((x, y) => x.code.localeCompare(y.code));
    return base
      .filter((row) =>
        row.code.toLowerCase().includes(q) ||
        (row.name || '').toLowerCase().includes(q) ||
        (row.assigneeName || '').toLowerCase().includes(q)
      )
      .sort((x, y) => x.code.localeCompare(y.code));
  },
  getDeptDetail: (code) => {
    if (!code) return null;
    const { departmentsMeta, assignments, assignees } = get();
    const byCode = new Map((departmentsMeta || []).map((d) => [String(d.code), d]));
    const byAssignee = new Map((assignees || []).map((a) => [a.id, a]));
    const meta = byCode.get(String(code));
    if (!meta) return null;
    const assigneeId = assignments?.[meta.code] ?? null;
    const assigneeName = assigneeId ? (byAssignee.get(assigneeId)?.name || null) : null;
    return { code: meta.code, name: meta.name || '', assigneeId, assigneeName };
  },

  // --- Gestion des chargés d'affaires ---
  addAssignee: async (name, color) => {
    const cleanName = String(name || '').trim();
    const cleanColor = String(color || '#10b981');
    if (!cleanName) return null;
    try {
      const res = await axios.post('/api/assignees', { name: cleanName, color: cleanColor });
      const created = res?.data || null; // { id, name, color }
      if (created && created.id) {
        set((s) => ({ assignees: [...(s.assignees || []), created] }));
        try { await get().fetchData(); } catch (_) {}
        return created;
      }
    } catch (e) {
      // Fallback local: créer un id éphémère côté client
      const created = { id: `ca_${Date.now()}`, name: cleanName, color: cleanColor };
      set((s) => ({ assignees: [...(s.assignees || []), created] }));
      try { await get().fetchData(); } catch (_) {}
      console.warn('POST /api/assignees failed, used local fallback', e);
      return created;
    }
    return null;
  },
  updateAssignee: async (id, partial) => {
    const clean = {};
    if (partial && typeof partial.name !== 'undefined') {
      const n = String(partial.name).trim();
      if (n) clean.name = n;
    }
    if (partial && typeof partial.color !== 'undefined') {
      clean.color = String(partial.color);
    }
    if (Object.keys(clean).length === 0) return null;
    try {
      const updated = await apiUpdateAssignee(id, clean);
      if (updated && updated.id) {
        set((s) => ({
          assignees: (s.assignees || []).map((a) => (a.id === id ? { ...a, ...updated } : a)),
        }));
        try { await get().fetchData(); } catch (_) {}
        return updated;
      }
    } catch (e) {
      console.warn('PATCH /api/assignees failed', e);
    }
    return null;
  },
  removeAssignee: async (assigneeId) => {
    const id = String(assigneeId || '');
    if (!id) return;
    try {
      await apiDeleteAssignee(id);
    } catch (e) {
      console.warn('deleteAssignee fallback failed', e);
    }
    // Mettre l'état local en cohérence
    set((s) => ({
      assignees: (s.assignees || []).filter((a) => a.id !== id),
      assignments: Object.fromEntries(Object.entries(s.assignments || {}).filter(([_, v]) => v !== id)),
      highlightedDepartments: [],
    }));
    try { await get().fetchData(); } catch (_) {}
  },

  saveAssignments: async (newAssignments) => {
    const prev = get().assignments || {};
    // Normaliser les clés en string
    const next = Object.fromEntries(Object.entries(newAssignments || {}).map(([k, v]) => [String(k), v]));

    // Construire un diff minimal POUR LE SERVEUR
    const updates = {};
    // 1) Ajouts/modifications
    for (const [code, val] of Object.entries(next)) {
      const p = prev[String(code)];
      if (p !== val) {
        updates[String(code)] = val; // assigneeId (string) ou null
      }
    }
    // 2) Suppressions (codes présents avant mais absents maintenant)
    for (const code of Object.keys(prev)) {
      if (!(code in next)) {
        updates[String(code)] = null; // convention: null = désassigner côté serveur
      }
    }

    try {
      // On envoie seulement le diff; le serveur doit interpréter `null` comme suppression
      await axios.post('/api/assignments', updates);
      set({ assignments: next, selectedDepartments: [] });
    } catch (err) {
      // fallback: on applique localement quand même
      set({ assignments: next, selectedDepartments: [] });
      console.error('Failed to save assignments (posting diff)', err);
    }
  },
}));

export { useStore };
