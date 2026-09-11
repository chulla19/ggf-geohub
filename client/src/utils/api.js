// Unified API layer: handles both Node.js Express backend and 100% serverless static hosting (Netlify, Vercel, GitHub Pages)

const getBaseUrl = () => {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : base + '/';
};

export async function fetchLayersData() {
  const base = getBaseUrl();
  // Try static first for instant 24/7 reliability, fallback to API
  try {
    const res = await fetch(`${base}data/layers.json`);
    if (res.ok) return await res.json();
  } catch (e) {}

  try {
    const res = await fetch('/api/layers');
    if (res.ok) return await res.json();
  } catch (e) {}

  return { success: false, layers: [] };
}

export async function fetchGeoJsonData(layerId) {
  const base = getBaseUrl();
  try {
    const res = await fetch(`${base}data/geojson/${layerId}.json`);
    if (res.ok) return await res.json();
  } catch (e) {}

  try {
    const res = await fetch(`/api/layers/${layerId}/geojson`);
    if (res.ok) return await res.json();
  } catch (e) {}

  throw new Error(`Failed to load GeoJSON for ${layerId}`);
}

export async function fetchRecordsData(layerId) {
  const base = getBaseUrl();
  try {
    const res = await fetch(`${base}data/records/${layerId}.json`);
    if (res.ok) return await res.json();
  } catch (e) {}

  try {
    const res = await fetch(`/api/layers/${layerId}/records`);
    if (res.ok) return await res.json();
  } catch (e) {}

  return { success: false, records: [] };
}

export function getDownloadUrl(layerId, format = 'shp') {
  const base = getBaseUrl();
  const fmt = format.toLowerCase();
  if (fmt === 'shp') {
    return `${base}data/downloads/${layerId}_SHP.zip`;
  }
  if (fmt === 'geojson') {
    return `${base}data/downloads/${layerId}.geojson`;
  }
  if (fmt === 'csv') {
    return `${base}data/downloads/${layerId}_atributos.csv`;
  }
  return `${base}data/downloads/${layerId}_SHP.zip`;
}

export function getAbsoluteDownloadUrl(layerId, format = 'shp') {
  const rel = getDownloadUrl(layerId, format);
  try {
    return new URL(rel, window.location.href).href;
  } catch (e) {
    return rel;
  }
}

