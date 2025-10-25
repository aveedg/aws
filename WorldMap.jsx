import React, { useMemo } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

const ALIAS_MAP = {
  'united states': 'united states',
  'united states of america': 'united states',
  usa: 'united states',
  'united kingdom': 'united kingdom',
  'great britain': 'united kingdom',
  britain: 'united kingdom',
  france: 'france',
  germany: 'germany',
  'federal republic of germany': 'germany',
  brazil: 'brazil',
  'federative republic of brazil': 'brazil',
  'south africa': 'south africa',
  'republic of south africa': 'south africa',
  japan: 'japan',
  belize: 'belize',
  'hong kong': 'hong kong',
  'hong kong s.a.r.': 'hong kong',
  'hong kong sar china': 'hong kong'
};

const DISPLAY_NAME_MAP = {
  'united states': 'United States',
  'united kingdom': 'United Kingdom',
  france: 'France',
  germany: 'Germany',
  brazil: 'Brazil',
  'south africa': 'South Africa',
  japan: 'Japan',
  belize: 'Belize',
  'hong kong': 'Hong Kong'
};

export const normalizeCountryName = (name = '') => {
  const key = name.trim().toLowerCase();
  return ALIAS_MAP[key] ?? key;
};

const toDisplayLabel = (name = '') => {
  const normalized = normalizeCountryName(name);
  const mapped = DISPLAY_NAME_MAP[normalized];
  const source = mapped ?? (name.trim() || normalized);
  return source.replace(/\b\w/g, char => char.toUpperCase());
};

const WorldMap = ({
  selectedCountries = [],
  availableCountries,
  onCountryClick,
  selectedColor = '#10B981',
  availableColor = '#e0e3e6c1',
  defaultColor = '#E2E8F0',
  selectedHoverColor,
  availableHoverColor,
  defaultHoverColor
}) => {
  const selectedSet = useMemo(() => {
    return new Set(selectedCountries.map(normalizeCountryName));
  }, [selectedCountries]);

  const availableSet = useMemo(() => {
    const source = availableCountries && availableCountries.length > 0 ? availableCountries : selectedCountries;
    return new Set(source.map(normalizeCountryName));
  }, [availableCountries, selectedCountries]);

  const interactive = typeof onCountryClick === 'function';

  const highlightColor = selectedColor;
  const highlightHover = selectedHoverColor ?? highlightColor;
  const availableFill = availableColor;
  const availableHover = availableHoverColor ?? availableFill;
  const neutralColor = defaultColor;
  const neutralHover = defaultHoverColor ?? neutralColor;

  return (
    <div className="w-full bg-[#1f1f1f] rounded-xl p-6 border border-[#2a2a2a] shadow-lg overflow-hidden text-gray-100">
      <div className="relative w-full aspect-[2/1]">
        <ComposableMap
          projectionConfig={{ scale: 155 }}
          width={800}
          height={400}
          style={{ width: '100%', height: '100%' }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map(geo => {
                const geoName = geo.properties?.NAME || geo.properties?.name || geo.properties?.ADMIN || '';
                const normalizedName = normalizeCountryName(geoName);
                const selected = selectedSet.has(normalizedName);
                const available = availableSet.has(normalizedName);
                const baseFill = selected ? highlightColor : available ? availableFill : neutralColor;
                const hoverFill = selected ? highlightHover : available ? availableHover : neutralHover;
                const pressedFill = selected ? highlightHover : available ? availableHover : neutralHover;
                const isClickable = interactive;
                const clickHandler = isClickable
                  ? () => {
                      const displayName = DISPLAY_NAME_MAP[normalizedName] ?? geoName;
                      onCountryClick(displayName, normalizedName);
                    }
                  : undefined;

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onClick={clickHandler}
                  style={{
                    default: { fill: baseFill, outline: 'none' },
                    hover: {
                      fill: hoverFill,
                      outline: 'none',
                      cursor: isClickable ? 'pointer' : 'default'
                    },
                    pressed: { fill: pressedFill, outline: 'none' }
                  }}
                />
              );
            })
          }
        </Geographies>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map(geo => (
                <Geography
                  key={`${geo.rsmKey}-outline`}
                  geography={geo}
                  fill="none"
                  stroke="rgba(0, 0, 0, 0.45)"
                  strokeWidth={0.6}
                  style={{ pointerEvents: 'none' }}
                />
              ))
            }
          </Geographies>
        </ComposableMap>
      </div>

      <div className="flex items-center justify-center gap-6 mt-4 text-sm text-gray-300">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: selectedColor }} />
          <span>Selected</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-slate-400 rounded" />
          <span>Available</span>
        </div>
      </div>

      {selectedCountries.length > 0 && (
        <div className="mt-4 text-center">
          <p className="text-sm font-medium text-gray-300">
            Selected: {selectedCountries.map(toDisplayLabel).join(', ')}
          </p>
        </div>
      )}
    </div>
  )
}

export default WorldMap
