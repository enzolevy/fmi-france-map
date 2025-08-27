import React from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { useStore } from '../store';

const geoUrl = 'https://cdn.jsdelivr.net/npm/france-geojson@3.0.0/dist/france-departements.json';

export default function FranceMap() {
  const mode = useStore((state) => state.mode);
  const assignments = useStore((state) => state.assignments);
  const selected = useStore((state) => state.selectedDepartments);
  const highlighted = useStore((state) => state.highlightedDepartments);
  const assignees = useStore((state) => state.assignees);
  const selectDepartment = useStore((state) => state.selectDepartment);

  const getColor = (deptCode) => {
    const assigneeId = assignments[deptCode];
    const assignee = assignees.find((a) => a.id === assigneeId);
    return assignee?.color || '#E5E7EB';
  };

  return (
    <ComposableMap projection="geoMercator" width={800} height={800} projectionConfig={{ center: [2.454071, 46.279229], scale: 2000 }}>
      <Geographies geography={geoUrl}>
        {({ geographies }) =>
          geographies.map((geo) => {
            const code =
              geo.properties.code ||
              geo.properties.CODE_DEPT ||
              geo.id;
            const isSelected = selected.includes(code);
            const isHighlighted = highlighted.includes(code);
            const fillColor = isSelected
              ? '#2563eb'
              : isHighlighted
              ? '#93c5fd'
              : getColor(code);

            return (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill={fillColor}
                stroke="#ffffff"
                strokeWidth={0.5}
                onClick={() => {
                  if (mode === 'edit') {
                    selectDepartment(code);
                  }
                }}
                style={{
                  default: { outline: 'none' },
                  hover: { outline: 'none', cursor: mode === 'edit' ? 'pointer' : 'default' },
                  pressed: { outline: 'none' },
                }}
              />
            );
          })
        }
      </Geographies>
    </ComposableMap>
  );
}
