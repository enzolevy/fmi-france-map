import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { geoMercator, geoCentroid, geoPath } from 'd3-geo';
import { useStore } from '../store';

// Sources GeoJSON
const DEPTS_URL = 'https://france-geojson.gregoiredavid.fr/repo/departements.geojson';
const REGIONS_URL = 'https://france-geojson.gregoiredavid.fr/repo/regions.geojson';

const IDF_DEPTS = new Set(['75', '77', '78', '91', '92', '93', '94', '95']);
const getDeptCodeFromProps = (props, fallbackId) => {
  const raw = (props && (props.code ?? props.CODE_DEPT)) ?? fallbackId;
  return String(raw ?? '');
};

export default function FranceMap() {
  // Store
  const mode = useStore((state) => state.mode);
  const assignments = useStore((state) => state.assignments);
  const selected = useStore((state) => state.selectedDepartments);
  const highlighted = useStore((state) => state.highlightedDepartments);
  const assignees = useStore((state) => state.assignees);
  const selectDepartment = useStore((state) => state.selectDepartment);
  const setDepartmentsMeta = useStore((state) => state.setDepartmentsMeta);

  const departmentsMeta = useStore((state) => state.departmentsMeta);

  const metaByCode = useMemo(() => new Map((departmentsMeta || []).map((d) => [String(d.code), d])), [departmentsMeta]);
  const assigneeById = useMemo(() => new Map((assignees || []).map((a) => [a.id, a])), [assignees]);

  // Container size (responsive)
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 800, height: 800 });

  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, code: '', name: '', assigneeName: '' });
  const hoverTimerRef = useRef(null);

  const getLocalCoords = (evt) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  };

  const composeTooltip = (code) => {
    const name = metaByCode.get(String(code))?.name || '';
    const aid = assignments?.[code];
    const a = aid ? assigneeById.get(aid) : null;
    return { code: String(code), name, assigneeName: a?.name || '—' };
  };

  const handleEnter = (evt, code) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    const { x, y } = getLocalCoords(evt);
    hoverTimerRef.current = setTimeout(() => {
      const info = composeTooltip(code);
      setTooltip({ show: true, x, y, ...info });
    }, 250);
  };

  const handleMove = (evt) => {
    if (!tooltip.show) return;
    const { x, y } = getLocalCoords(evt);
    setTooltip((t) => ({ ...t, x, y }));
  };

  const handleLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setTooltip((t) => ({ ...t, show: false }));
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      // width/height from parent CSS (e.g., h-[min(78vh,...)])
      setSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // GeoJSON data
  const [depts, setDepts] = useState(null);
  const [regions, setRegions] = useState(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [dRes, rRes] = await Promise.all([
          fetch(DEPTS_URL),
          fetch(REGIONS_URL),
        ]);
        const [dJson, rJson] = await Promise.all([dRes.json(), rRes.json()]);
        if (isMounted) {
          setDepts(dJson);
          setRegions(rJson);
          // Alimenter les métadonnées pour la recherche/consultation
          try {
            const meta = (dJson?.features || []).map((f) => {
              const p = f.properties || {};
              const code = p.code || p.CODE_DEPT || f.id;
              const name = p.nom || p.NOM_DEPT || p.NOM || p.name || '';
              const regionCode = p.code_region || p.CODE_REGION || p.REGION || p.region || '';
              return { code, name, regionCode };
            });
            setDepartmentsMeta(meta);
          } catch (e) {
            console.warn('Departement meta extraction failed', e);
          }
        }
      } catch (e) {
        // en cas d'erreur réseau, on laisse la carte dans son état par défaut
        console.error('Erreur chargement GeoJSON', e);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  // Projection Mercator ajustée automatiquement à la France (fitExtent)
  const projection = useMemo(() => {
    if (!depts || !size.width || !size.height) {
      return geoMercator().center([2.454071, 46.279229]).scale(2000);
    }
    const pad = Math.min(size.width, size.height) * 0.02; // 2% padding visuel
    return geoMercator().fitExtent(
      [[pad, pad], [size.width - pad, size.height - pad]],
      depts
    );
  }, [depts, size.width, size.height]);

  // Couleur de remplissage selon l'assignation
  const getColor = (deptCode) => {
    const assigneeId = assignments[deptCode];
    const assignee = assignees.find((a) => a.id === assigneeId);
    return assignee?.color || '#E5E7EB';
  };

  // Helper pour reconnaître un DÉPARTEMENT d'Île‑de‑France (liste de codes)
  const isIDFDept = (props, fallbackId) => IDF_DEPTS.has(getDeptCodeFromProps(props, fallbackId));

  // Font label dynamique (limites raisonnables)
  const labelFontPx = Math.max(9, Math.min(12, Math.round(size.width / 70)));

  // Inset Île‑de‑France (box + transform around region center)
  const padPx = Math.min(size.width, size.height) * 0.02;
  const inset = useMemo(() => {
    const w = Math.min(220, size.width * 0.28);
    const h = Math.min(180, size.height * 0.28);
    const x = padPx; // bas-gauche (peut être déplacé)
    const y = Math.max(padPx, size.height - h - padPx);
    return { x, y, w, h };
  }, [size.width, size.height, padPx]);

  // Sous-ensemble des départements IDF (pour calculer un fit exact dans l'inset)
  const idfFeatures = useMemo(() => {
    if (!depts || !depts.features) return [];
    return depts.features.filter((f) => {
      const p = f.properties || {};
      const code = p.code || p.CODE_DEPT || f.id;
      return IDF_DEPTS.has(String(code));
    });
  }, [depts]);


  // Projection dédiée à l'inset IDF (fit exact dans le cadre)
  const idfInsetProjection = useMemo(() => {
    if (!idfFeatures.length || !inset) return null;
    const pad = 8;
    return geoMercator().fitExtent(
      [[inset.x + pad, inset.y + pad], [inset.x + inset.w - pad, inset.y + inset.h - pad]],
      { type: 'FeatureCollection', features: idfFeatures }
    );
  }, [idfFeatures, inset]);

  const idfPath = useMemo(() => (idfInsetProjection ? geoPath(idfInsetProjection) : null), [idfInsetProjection]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <ComposableMap
        projection={projection}
        width={size.width}
        height={size.height}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Départements interactifs (couleur d'assignation) */}
        {depts && (
          <Geographies geography={depts}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const props = geo.properties || {};
                const code = props.code || props.CODE_DEPT || geo.id;
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
                    vectorEffect="non-scaling-stroke"
                    onClick={() => {
                      if (mode === 'edit') {
                        selectDepartment(code);
                      }
                    }}
                    onMouseEnter={(e) => handleEnter(e, code)}
                    onMouseMove={handleMove}
                    onMouseLeave={handleLeave}
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
        )}

        {/* Contours de régions (au-dessus, non interactifs) */}
        {regions && (
          <g pointerEvents="none">
            <Geographies geography={regions}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography
                    key={`region-${geo.rsmKey}`}
                    geography={geo}
                    fill="none"
                    stroke="#374151"
                    strokeWidth={2.5}
                    vectorEffect="non-scaling-stroke"
                    style={{ default: { outline: 'none' }, hover: { outline: 'none' }, pressed: { outline: 'none' } }}
                  />
                ))
              }
            </Geographies>
          </g>
        )}

        {/* Labels: numéro de département (sauf IDF, gérée via inset à part) */}
        {depts && (
          <Geographies geography={depts}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const props = geo.properties || {};
                if (isIDFDept(props, geo.id)) return null; // on masque IDF sur la carte principale
                const code = props.code || props.CODE_DEPT || geo.id;
                const [lon, lat] = geoCentroid(geo);
                if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
                const [x, y] = projection([lon, lat]);
                if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                return (
                  <text
                    key={`label-${code}`}
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{
                      fontSize: `${labelFontPx}px`,
                      fill: '#374151',
                      userSelect: 'none',
                      pointerEvents: 'none',
                    }}
                  >
                    {code}
                  </text>
                );
              })
            }
          </Geographies>
        )}

        {/* Inset Île‑de‑France (agrandi dans un encadré) */}
        {idfInsetProjection && depts && (
          <g>
            {/* Cadre de l'inset */}
            <rect x={inset.x} y={inset.y} width={inset.w} height={inset.h} fill="#ffffff" stroke="#111827" strokeWidth={1} />

            {/* Départements IDF dessinés avec la projection dédiée */}
            {idfFeatures.map((f) => {
              const p = f.properties || {};
              const code = p.code || p.CODE_DEPT || f.id;
              const isSelected = selected.includes(code);
              const isHighlighted = highlighted.includes(code);
              const fillColor = isSelected
                ? '#2563eb'
                : isHighlighted
                ? '#93c5fd'
                : getColor(code);
              return (
                <path
                  key={`idf-${code}`}
                  d={idfPath(f)}
                  fill={fillColor}
                  stroke="#ffffff"
                  strokeWidth={0.5}
                  vectorEffect="non-scaling-stroke"
                  onClick={() => {
                    if (mode === 'edit') selectDepartment(code);
                  }}
                  onMouseEnter={(e) => handleEnter(e, code)}
                  onMouseMove={handleMove}
                  onMouseLeave={handleLeave}
                />
              );
            })}

            {/* Labels IDF avec projection dédiée */}
            {idfFeatures.map((f) => {
              const p = f.properties || {};
              const code = p.code || p.CODE_DEPT || f.id;
              const [lon, lat] = geoCentroid(f);
              const pt = idfInsetProjection([lon, lat]);
              if (!pt) return null;
              const [x, y] = pt;
              return (
                <text
                  key={`idf-label-${code}`}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ fontSize: `${labelFontPx}px`, fill: '#111827', userSelect: 'none', pointerEvents: 'none' }}
                >
                  {code}
                </text>
              );
            })}

            {/* Légende de l'inset */}
            <text x={inset.x + 8} y={inset.y + 16} style={{ fontSize: '10px', fill: '#111827' }}>Île‑de‑France</text>
          </g>
        )}
      </ComposableMap>
      {tooltip.show && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x + 12,
            top: tooltip.y + 12,
            pointerEvents: 'none',
            maxWidth: 240,
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            boxShadow: '0 4px 10px rgba(0,0,0,0.08)',
            borderRadius: 6,
            padding: '6px 8px',
            fontSize: 12,
            lineHeight: 1.2,
            color: '#111827',
            zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 600 }}>{tooltip.code} — {tooltip.name}</div>
          <div style={{ color: '#4b5563' }}>{tooltip.assigneeName}</div>
        </div>
      )}
    </div>
  );
}
