import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import proj4 from 'proj4';
import {
  Layers,
  Eye,
  EyeOff,
  MapPin,
  Maximize2,
  Minimize2,
  Compass,
  Palette,
  Sliders,
  Radio,
  Search,
  Crosshair,
  Info,
  ChevronRight,
  X,
  Ruler,
  RotateCcw,
  Check,
  Copy,
  Download,
  Share2,
  Map as MapIcon,
  Trees,
  ExternalLink,
  ShieldCheck,
  Building,
  FileText
} from 'lucide-react';

import { fetchGeoJsonData, getDownloadUrl, getAbsoluteDownloadUrl } from '../utils/api';
import ggfLogoOrange from '../assets/logos/ggf-logo-orange.png';

// Proj4 definitions for UTM Zone 18S & WGS84
const utm18sDef = "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs";
const wgs84Def = "+proj=longlat +datum=WGS84 +no_defs";

function toUTM(lat, lon) {
  try {
    const [x, y] = proj4(wgs84Def, utm18sDef, [lon, lat]);
    return { x: Math.round(x), y: Math.round(y) };
  } catch (e) {
    return null;
  }
}

// Geodesic distance calculation between points in meters
function calculateDistance(latlngs) {
  let dist = 0;
  for (let i = 0; i < latlngs.length - 1; i++) {
    dist += latlngs[i].distanceTo(latlngs[i + 1]);
  }
  return dist;
}

// Geodesic spherical polygon area calculation in square meters
function calculatePolygonArea(latlngs) {
  if (latlngs.length < 3) return 0;
  const rad = Math.PI / 180;
  const radius = 6378137;
  let area = 0;
  for (let i = 0; i < latlngs.length; i++) {
    const p1 = latlngs[i];
    const p2 = latlngs[(i + 1) % latlngs.length];
    area += (p2.lng - p1.lng) * rad * (2 + Math.sin(p1.lat * rad) + Math.sin(p2.lat * rad));
  }
  area = Math.abs((area * radius * radius) / 2.0);
  return area;
}

// Basemap Tile Providers (Only Satelital HD & Calles/Ríos)
const BASEMAP_URLS = {
  satellite: {
    name: 'Satelital HD',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri World Imagery &bull; Maxar, Earthstar Geographics',
    maxZoom: 18
  },
  streets: {
    name: 'Calles & Ríos',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }
};

// Official GGF Layer Colors
const OFFICIAL_LAYER_COLORS = {
  'Conseciones_unidos': '#C27107',                   // Naranja GGF
  'Area_Proyecto_Oct2022': '#FFB300',               // Amarillo Sol GGL1
  'Area_Proyecto_GGL2_SinB10K120925': '#A5C639',    // Verde Lima GGL2
  'CampamentosGGF': '#EF4444'                       // Rojo táctico Campamentos
};

function isLayerActiveInFilter(layerId, filter) {
  if (!filter || filter === 'ALL') return true;
  if (filter === 'Concesiones GGF') return layerId === 'Conseciones_unidos';
  if (filter === 'Proyecto GGL1') return layerId === 'Area_Proyecto_Oct2022';
  if (filter === 'Proyecto GGL2') return layerId === 'Area_Proyecto_GGL2_SinB10K120925';
  if (filter === 'Campamentos GGF') return layerId === 'CampamentosGGF';
  return true;
}

export default function MapViewer({ layers, initialFocusLayerId }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const basemapLayerRef = useRef(null);
  const geojsonLayersRef = useRef({});
  const measurementLayerGroupRef = useRef(null);

  // States
  const [activeBasemap, setActiveBasemap] = useState('satellite');
  const [layerVisibility, setLayerVisibility] = useState({});
  const [layerOpacities, setLayerOpacities] = useState({
    Conseciones_unidos: 0.45,
    Area_Proyecto_Oct2022: 0.35,
    Area_Proyecto_GGL2_SinB10K120925: 0.35,
    CampamentosGGF: 1.0
  });
  const [soloLayerId, setSoloLayerId] = useState(null);
  const [loadingLayers, setLoadingLayers] = useState({});
  const [colorMode, setColorMode] = useState('official'); // 'official' | 'project' | 'camps'
  const [activeProjectFilter, setActiveProjectFilter] = useState('ALL');
  const [hoveredFeature, setHoveredFeature] = useState(null);
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [allSearchItems, setAllSearchItems] = useState([]);
  const [visibleHectares, setVisibleHectares] = useState(394880);

  // Measurement State
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState([]);
  const [measureStats, setMeasureStats] = useState({ distanceM: 0, areaM2: 0 });

  // Map HUD stats
  const [mouseCoords, setMouseCoords] = useState({ lat: -3.000, lng: -73.500, utmX: 666000, utmY: 9668000 });
  const [currentZoom, setCurrentZoom] = useState(8);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLegendOpen, setIsLegendOpen] = useState(true);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [isDownloadHubOpen, setIsDownloadHubOpen] = useState(false);
  const [copiedDownloadId, setCopiedDownloadId] = useState(null);

  // Copy direct download URL to clipboard
  const handleCopyDirectLink = (layerId) => {
    const url = getAbsoluteDownloadUrl(layerId, 'shp');
    navigator.clipboard.writeText(url);
    setCopiedDownloadId(layerId);
    setTimeout(() => setCopiedDownloadId(null), 2500);
  };

  // Dynamic visible hectares calculation
  useEffect(() => {
    if (activeProjectFilter === 'ALL' || activeProjectFilter === 'Concesiones GGF') {
      setVisibleHectares(394880.03);
    } else if (activeProjectFilter === 'Proyecto GGL1') {
      setVisibleHectares(183445.53);
    } else if (activeProjectFilter === 'Proyecto GGL2') {
      setVisibleHectares(106575.87);
    } else if (activeProjectFilter === 'Campamentos GGF') {
      setVisibleHectares(0);
    }
  }, [activeProjectFilter]);

  // Initialize visibility and opacities
  useEffect(() => {
    if (layers && layers.length > 0) {
      setLayerVisibility(prev => {
        const next = { ...prev };
        layers.forEach(l => {
          if (next[l.id] === undefined) {
            next[l.id] = true;
          }
        });
        return next;
      });

      setLayerOpacities(prev => {
        const next = { ...prev };
        layers.forEach(l => {
          if (next[l.id] === undefined) {
            next[l.id] = OFFICIAL_LAYER_COLORS[l.id] ? 0.40 : 0.35;
          }
        });
        return next;
      });
    }
  }, [layers]);

  // Determine feature color (Official GGF Colors)
  const getFeatureColor = useCallback((feature, layerId) => {
    return OFFICIAL_LAYER_COLORS[layerId] || '#C27107';
  }, []);

  // Red Pulsing Radar Icon for Camps
  const createRadarIcon = (campName) => {
    return L.divIcon({
      className: 'custom-radar-icon',
      html: `
        <div class="radar-marker-container" title="${campName}">
          <div class="radar-marker-ring"></div>
          <div class="radar-marker-dot"></div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [-2.9, -73.8],
      zoom: 8,
      zoomControl: false,
      attributionControl: true
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const baseCfg = BASEMAP_URLS[activeBasemap];
    const tileLayer = L.tileLayer(baseCfg.url, {
      attribution: baseCfg.attribution,
      maxZoom: baseCfg.maxZoom
    }).addTo(map);

    basemapLayerRef.current = tileLayer;

    // Measurement Layer Group
    const measureGroup = L.layerGroup().addTo(map);
    measurementLayerGroupRef.current = measureGroup;

    // Mouse coordinates tracker
    map.on('mousemove', e => {
      const lat = Number(e.latlng.lat.toFixed(5));
      const lng = Number(e.latlng.lng.toFixed(5));
      const utm = toUTM(lat, lng);
      setMouseCoords({
        lat,
        lng,
        utmX: utm ? utm.x : null,
        utmY: utm ? utm.y : null
      });
    });

    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle Basemap changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (basemapLayerRef.current) {
      mapInstanceRef.current.removeLayer(basemapLayerRef.current);
    }
    const baseCfg = BASEMAP_URLS[activeBasemap] || BASEMAP_URLS.satellite;
    const newTileLayer = L.tileLayer(baseCfg.url, {
      attribution: baseCfg.attribution,
      maxZoom: baseCfg.maxZoom
    }).addTo(mapInstanceRef.current);

    newTileLayer.bringToBack();
    basemapLayerRef.current = newTileLayer;
  }, [activeBasemap]);

  // Handle project filter with exclusive layer rendering and auto-fit bounds
  const handleFilterChange = (filter) => {
    setActiveProjectFilter(filter);
    const map = mapInstanceRef.current;
    if (!map) return;

    setTimeout(() => {
      let combinedBounds = null;
      layers.forEach(layer => {
        if (isLayerActiveInFilter(layer.id, filter) && geojsonLayersRef.current[layer.id]) {
          const lyr = geojsonLayersRef.current[layer.id];
          if (lyr) {
            if (lyr.getBounds && lyr.getBounds().isValid && lyr.getBounds().isValid()) {
              if (!combinedBounds) {
                combinedBounds = L.latLngBounds(lyr.getBounds().getSouthWest(), lyr.getBounds().getNorthEast());
              } else {
                combinedBounds.extend(lyr.getBounds());
              }
            } else if (lyr.eachLayer) {
              lyr.eachLayer(m => {
                if (m.getLatLng) {
                  if (!combinedBounds) {
                    combinedBounds = L.latLngBounds([m.getLatLng()]);
                  } else {
                    combinedBounds.extend(m.getLatLng());
                  }
                }
              });
            }
          }
        }
      });

      if (combinedBounds && combinedBounds.isValid()) {
        map.fitBounds(combinedBounds, { padding: [50, 50], maxZoom: 13, animate: true });
      }
    }, 150);
  };

  // Load and style GeoJSON layers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !layers || layers.length === 0) return;

    const collectedSearchItems = [];

    layers.forEach(layer => {
      const isFilterMatch = isLayerActiveInFilter(layer.id, activeProjectFilter);
      const isVisible = (soloLayerId
        ? layer.id === soloLayerId
        : layerVisibility[layer.id] !== false) && isFilterMatch;

      const layerOpacity = layerOpacities[layer.id] ?? 0.40;

      // If already created, adjust visibility and dynamic styles
      if (geojsonLayersRef.current[layer.id]) {
        const leafletLayer = geojsonLayersRef.current[layer.id];

        if (!isVisible) {
          if (map.hasLayer(leafletLayer)) map.removeLayer(leafletLayer);
        } else {
          if (!map.hasLayer(leafletLayer)) map.addLayer(leafletLayer);

          // Update styles
          leafletLayer.eachLayer(subLayer => {
            const feat = subLayer.feature;
            if (!feat) return;

            const col = getFeatureColor(feat, layer.id);
            if (subLayer.setStyle && feat.geometry.type !== 'Point') {
              subLayer.setStyle({
                color: col,
                fillColor: col,
                fillOpacity: layerOpacity,
                opacity: 0.9,
                weight: 2
              });
            }
          });

          // Ensure camps remain on top of polygons
          if (layer.id === 'CampamentosGGF' && leafletLayer.bringToFront) {
            leafletLayer.bringToFront();
          }
        }
        return;
      }

      // Fetch if visible and not cached
      if (isVisible && !geojsonLayersRef.current[layer.id] && !loadingLayers[layer.id]) {
        setLoadingLayers(prev => ({ ...prev, [layer.id]: true }));

        fetchGeoJsonData(layer.id)
          .then(geojson => {
            // Index items for smart search
            geojson.features.forEach((f, idx) => {
              const p = f.properties || {};
              const title = p.nombre || p.Campamento || p.Proyecto || p.Nombre || `${layer.name} #${idx + 1}`;
              const ha = p.HA || p.Ha || p.Superficie || null;
              collectedSearchItems.push({
                id: `${layer.id}_${idx}`,
                title,
                layerId: layer.id,
                layerName: layer.name,
                ha,
                feature: f,
                geometryType: f.geometry?.type
              });
            });

            setAllSearchItems(prev => {
              const existingIds = new Set(prev.map(i => i.id));
              const newItems = collectedSearchItems.filter(i => !existingIds.has(i.id));
              return [...prev, ...newItems];
            });

            const leafletGeoJson = L.geoJSON(geojson, {
              style: feature => {
                const col = getFeatureColor(feature, layer.id);
                return {
                  color: col,
                  weight: 2,
                  opacity: 0.9,
                  fillColor: col,
                  fillOpacity: layerOpacity
                };
              },
              pointToLayer: (feature, latlng) => {
                const p = feature.properties || {};
                const campName = p.Campamento || p.camp || p.nombre || 'Campamento GGF';
                const marker = L.marker(latlng, { icon: createRadarIcon(campName), zIndexOffset: 2000 });
                marker.bindTooltip(`<b>📍 Campamento GGF</b><br/>${campName}`, {
                  direction: 'top',
                  offset: [0, -10],
                  className: 'camp-custom-tooltip'
                });
                return marker;
              },
              onEachFeature: (feature, l) => {
                const p = feature.properties || {};
                const title = p.nombre || p.Campamento || p.Proyecto || p.Nombre || layer.name;

                // Mouse hover events
                l.on('mouseover', () => {
                  setHoveredFeature({
                    layerName: layer.name,
                    layerId: layer.id,
                    properties: p,
                    geometryType: feature.geometry.type,
                    title
                  });

                  if (l.setStyle && feature.geometry.type !== 'Point') {
                    l.setStyle({
                      weight: 3.5,
                      color: '#ffffff',
                      fillOpacity: Math.min(layerOpacity + 0.35, 0.9)
                    });
                    l.bringToFront();
                  }
                });

                l.on('mouseout', () => {
                  setHoveredFeature(null);
                  if (l.setStyle && feature.geometry.type !== 'Point') {
                    const col = getFeatureColor(feature, layer.id);
                    l.setStyle({
                      weight: 2,
                      color: col,
                      fillColor: col,
                      fillOpacity: layerOpacity
                    });
                  }
                });

                // Click opens Side Drawer
                l.on('click', e => {
                  setSelectedFeature({
                    layerName: layer.name,
                    layerId: layer.id,
                    properties: p,
                    geometryType: feature.geometry.type,
                    title,
                    feature
                  });
                  L.DomEvent.stopPropagation(e);
                });
              }
            });

            geojsonLayersRef.current[layer.id] = leafletGeoJson;
            map.addLayer(leafletGeoJson);

            // Keep camp markers on top
            if (layer.id === 'CampamentosGGF') {
              leafletGeoJson.bringToFront();
            }

            // Auto fit initial focus
            if (layer.id === initialFocusLayerId || (!initialFocusLayerId && layer.id === 'Conseciones_unidos')) {
              try {
                map.fitBounds(leafletGeoJson.getBounds(), { padding: [35, 35] });
              } catch (e) {}
            }
          })
          .catch(err => console.error(`Error loading layer ${layer.id}:`, err))
          .finally(() => {
            setLoadingLayers(prev => ({ ...prev, [layer.id]: false }));
          });
      }
    });
  }, [layers, layerVisibility, layerOpacities, soloLayerId, colorMode, activeProjectFilter, initialFocusLayerId, getFeatureColor]);

  // Recalculate live visible hectares
  useEffect(() => {
    let sum = 0;
    layers.forEach(l => {
      const isVisible = soloLayerId ? l.id === soloLayerId : layerVisibility[l.id] !== false;
      if (isVisible && l.totalHectares) {
        if (l.id === 'Conseciones_unidos') {
          if (activeProjectFilter === 'ALL' || activeProjectFilter === 'Concesiones GGF') {
            sum += l.totalHectares;
          } else if (activeProjectFilter === 'Proyecto GGL1') {
            sum += 236235.90;
          } else if (activeProjectFilter === 'Proyecto GGL2') {
            sum += 158644.13;
          }
        } else if (l.id === 'Area_Proyecto_GGL2_SinB10K120925' && (activeProjectFilter === 'ALL' || activeProjectFilter === 'Proyecto GGL2')) {
          sum += l.totalHectares;
        }
      }
    });
    setVisibleHectares(sum);
  }, [layers, layerVisibility, soloLayerId, activeProjectFilter]);

  // Independent Opacity Slider Handler
  const handleOpacityChange = (layerId, newOpacity) => {
    setLayerOpacities(prev => ({ ...prev, [layerId]: newOpacity }));
    const leafletLayer = geojsonLayersRef.current[layerId];
    if (leafletLayer) {
      leafletLayer.eachLayer(subLayer => {
        if (subLayer.setStyle && subLayer.feature?.geometry?.type !== 'Point') {
          subLayer.setStyle({ fillOpacity: newOpacity });
        }
      });
    }
  };

  // Solo Layer Toggle
  const handleToggleSolo = layerId => {
    if (soloLayerId === layerId) {
      setSoloLayerId(null);
    } else {
      setSoloLayerId(layerId);
    }
  };

  // Zoom to single layer
  const handleZoomToLayer = layerId => {
    const l = geojsonLayersRef.current[layerId];
    if (l && mapInstanceRef.current) {
      try {
        mapInstanceRef.current.fitBounds(l.getBounds(), { padding: [40, 40] });
      } catch (e) {}
    }
  };

  // Fit all layers (Extent)
  const handleFitAllLayers = () => {
    if (!mapInstanceRef.current) return;
    const group = L.featureGroup(Object.values(geojsonLayersRef.current));
    try {
      mapInstanceRef.current.fitBounds(group.getBounds(), { padding: [40, 40] });
    } catch (e) {}
  };

  // Smart Search logic
  const handleSearchChange = text => {
    setSearchQuery(text);
    if (!text.trim()) {
      setSearchResults([]);
      return;
    }
    const q = text.toLowerCase();
    const matches = allSearchItems.filter(item => {
      const p = item.feature?.properties || {};
      return (
        item.title.toLowerCase().includes(q) ||
        (p.TITULAR_1 && p.TITULAR_1.toLowerCase().includes(q)) ||
        (p.CONTRATO_1 && p.CONTRATO_1.toLowerCase().includes(q)) ||
        (p.DISTRITO && p.DISTRITO.toLowerCase().includes(q)) ||
        item.layerName.toLowerCase().includes(q)
      );
    }).slice(0, 8);
    setSearchResults(matches);
  };

  // Fly to search selection
  const handleSelectSearchItem = item => {
    setSearchQuery('');
    setSearchResults([]);
    if (!mapInstanceRef.current || !item.feature) return;

    const geom = item.feature.geometry;
    if (geom.type === 'Point') {
      const [lon, lat] = geom.coordinates;
      mapInstanceRef.current.flyTo([lat, lon], 14, { duration: 1.5 });
    } else {
      const tempLayer = L.geoJSON(item.feature);
      mapInstanceRef.current.flyToBounds(tempLayer.getBounds(), {
        padding: [60, 60],
        duration: 1.5
      });
    }

    setSelectedFeature({
      layerName: item.layerName,
      layerId: item.layerId,
      properties: item.feature.properties,
      title: item.title,
      geometryType: geom.type,
      feature: item.feature
    });
  };

  // Measurement Tool Click Handler
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!isMeasuring) {
      if (measurementLayerGroupRef.current) {
        measurementLayerGroupRef.current.clearLayers();
      }
      setMeasurePoints([]);
      setMeasureStats({ distanceM: 0, areaM2: 0 });
      map.getContainer().style.cursor = '';
      return;
    }

    map.getContainer().style.cursor = 'crosshair';

    const onMapClick = e => {
      const newPt = e.latlng;
      setMeasurePoints(prev => {
        const next = [...prev, newPt];
        updateMeasurementVisuals(next);
        return next;
      });
    };

    map.on('click', onMapClick);

    return () => {
      map.off('click', onMapClick);
    };
  }, [isMeasuring]);

  const updateMeasurementVisuals = points => {
    const group = measurementLayerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    if (points.length === 0) return;

    // Draw vertex markers
    points.forEach((pt, idx) => {
      const marker = L.circleMarker(pt, {
        radius: 5,
        color: '#f59e0b',
        fillColor: '#ffffff',
        fillOpacity: 1,
        weight: 2
      });
      group.addLayer(marker);
    });

    // Draw lines
    if (points.length >= 2) {
      const line = L.polyline(points, {
        color: '#f59e0b',
        weight: 3,
        dashArray: '6, 8',
        opacity: 0.9
      });
      group.addLayer(line);
      const dist = calculateDistance(points);
      setMeasureStats(prev => ({ ...prev, distanceM: dist }));
    }

    // Draw polygon if 3+ points
    if (points.length >= 3) {
      const poly = L.polygon(points, {
        color: '#f59e0b',
        weight: 2,
        fillColor: '#f59e0b',
        fillOpacity: 0.25
      });
      group.addLayer(poly);
      const area = calculatePolygonArea(points);
      setMeasureStats(prev => ({ ...prev, areaM2: area }));
    }
  };

  const handleClearMeasurement = () => {
    if (measurementLayerGroupRef.current) {
      measurementLayerGroupRef.current.clearLayers();
    }
    setMeasurePoints([]);
    setMeasureStats({ distanceM: 0, areaM2: 0 });
  };

  // Fullscreen Toggle
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      mapRef.current?.parentElement?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  // Copy feature details
  const handleCopyFeatureDetails = () => {
    if (!selectedFeature) return;
    const p = selectedFeature.properties || {};
    const text = `
=== FICHA TÉCNICA GGF ===
Entidad: ${selectedFeature.title}
Capa: ${selectedFeature.layerName}
Superficie: ${p.HA ? Number(p.HA).toLocaleString() + ' ha' : 'N/A'}
Titular: ${p.TITULAR_1 || p.comprado || 'GGF'}
Contrato: ${p.CONTRATO_1 || 'N/A'}
Distrito: ${p.DISTRITO || 'N/A'}
Provincia: ${p.PROVINCIA || 'N/A'}
Situación: ${p.SITUA_OPER || 'Activa'}
=========================
    `.trim();
    navigator.clipboard.writeText(text);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2500);
  };

  return (
    <div className="map-layout">
      {/* Sidebar Controls */}
      <div className="map-sidebar">
        {/* Dynamic Project Filter Pills */}
        <div>
          <div className="map-sidebar-title" style={{ marginBottom: '0.45rem' }}>
            <Sliders size={17} color="var(--primary)" />
            <span>Filtrar Territorio Activo</span>
          </div>
          <div className="map-filter-pills">
            {[
              { id: 'ALL', label: 'Todo' },
              { id: 'Concesiones GGF', label: '🌲 Concesiones' },
              { id: 'Proyecto GGL1', label: '🌳 Proyecto GGL1' },
              { id: 'Proyecto GGL2', label: '🍃 Proyecto GGL2' },
              { id: 'Campamentos GGF', label: '📍 Campamentos' }
            ].map(item => (
              <button
                key={item.id}
                className={`filter-pill-btn ${activeProjectFilter === item.id ? 'active' : ''}`}
                onClick={() => handleFilterChange(item.id)}
                title={`Mostrar únicamente ${item.label} en el mapa`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Independent Layer Cards List */}
        <div>
          <div className="map-sidebar-title" style={{ marginBottom: '0.6rem' }}>
            <Layers size={17} color="var(--primary)" />
            <span>Control de Capas ({layers.length})</span>
          </div>

          <div className="layers-cards-container">
            {layers.map(layer => {
              const isVisible = soloLayerId ? layer.id === soloLayerId : layerVisibility[layer.id] !== false;
              const isSolo = soloLayerId === layer.id;
              const currentOpacity = layerOpacities[layer.id] ?? 0.40;
              const officialColor = OFFICIAL_LAYER_COLORS[layer.id] || layer.color;

              return (
                <div key={layer.id} className="layer-item-card">
                  <div className="layer-header-row">
                    <div
                      className="layer-title-group"
                      onClick={() =>
                        setLayerVisibility(prev => ({
                          ...prev,
                          [layer.id]: !prev[layer.id]
                        }))
                      }
                    >
                      <input
                        type="checkbox"
                        checked={isVisible}
                        onChange={() => {}}
                        style={{ accentColor: officialColor, cursor: 'pointer' }}
                      />
                      <span
                        className="layer-color-dot"
                        style={{ background: officialColor }}
                      />
                      <span style={{ fontSize: '0.825rem', fontWeight: 600, color: isVisible ? '#fff' : 'var(--text-muted)' }}>
                        {layer.name}
                      </span>
                    </div>

                    <div className="layer-actions-group">
                      <a
                        href={getDownloadUrl(layer.id, 'shp')}
                        download={`${layer.id}_SHP.zip`}
                        className="btn-layer-action btn-layer-download"
                        title={`Descarga directa del Shapefile ZIP de ${layer.name}`}
                      >
                        <Download size={13} />
                        <span>ZIP</span>
                      </a>
                      <button
                        className={`btn-layer-action ${isSolo ? 'active-solo' : ''}`}
                        title={isSolo ? "Desactivar modo Solo" : "Aislar esta capa (Solo)"}
                        onClick={() => handleToggleSolo(layer.id)}
                      >
                        Solo
                      </button>
                      <button
                        className="btn-layer-action"
                        title="Enfocar extensión de esta capa"
                        onClick={() => handleZoomToLayer(layer.id)}
                      >
                        <Maximize2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Independent Opacity Slider */}
                  {layer.id !== 'CampamentosGGF' && (
                    <div className="layer-opacity-row">
                      <span>Opacidad:</span>
                      <input
                        type="range"
                        min="0.05"
                        max="0.95"
                        step="0.05"
                        value={currentOpacity}
                        onChange={e => handleOpacityChange(layer.id, parseFloat(e.target.value))}
                        className="layer-opacity-slider"
                      />
                      <span style={{ width: '28px', textAlign: 'right', fontWeight: 600 }}>
                        {Math.round(currentOpacity * 100)}%
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    <span>{layer.recordsCount} registros</span>
                    {layer.totalHectares && (
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {layer.totalHectares.toLocaleString()} ha
                      </span>
                    )}
                  </div>

                  {/* Direct Download Format Pills */}
                  <div className="layer-quick-downloads">
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Descargar:</span>
                    <div className="quick-dl-pills-wrap">
                      <a
                        href={getDownloadUrl(layer.id, 'shp')}
                        download={`${layer.id}_SHP.zip`}
                        className="quick-dl-pill shp"
                        title="Descarga directa Shapefile ZIP (.shp, .dbf, .prj, .shx)"
                      >
                        <Download size={10} /> SHP
                      </a>
                      <a
                        href={getDownloadUrl(layer.id, 'geojson')}
                        download={`${layer.id}.geojson`}
                        className="quick-dl-pill geojson"
                        title="Descarga directa GeoJSON WGS84"
                      >
                        GeoJSON
                      </a>
                      <a
                        href={getDownloadUrl(layer.id, 'csv')}
                        download={`${layer.id}_atributos.csv`}
                        className="quick-dl-pill csv"
                        title="Descarga directa Atributos en CSV para Excel"
                      >
                        CSV
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Interactive Map Canvas Container */}
      <div className="map-canvas-container">
        <div id="gis-map" ref={mapRef} />

        {/* Floating GGF Institutional Badge on Map */}
        <div className="map-ggf-watermark">
          <img
            src={ggfLogoOrange}
            alt="GGF Group"
            className="map-watermark-logo"
          />
          <div className="map-watermark-text">
            <span className="map-watermark-title">GREEN GOLD FORESTRY</span>
            <span className="map-watermark-sub">SIG Loreto &bull; UTM 18S</span>
          </div>
        </div>

        {/* Floating GIS Toolbar (Top Right) */}
        <div className="gis-floating-toolbar">
          {/* Smart Search Bar */}
          <div className="gis-smart-search">
            <div className="gis-search-input-wrap">
              <Search size={15} color="var(--primary-light)" />
              <input
                type="text"
                placeholder="Buscar concesión o campamento..."
                value={searchQuery}
                onChange={e => handleSearchChange(e.target.value)}
                className="gis-search-input"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {searchResults.length > 0 && (
              <div className="gis-search-results-dropdown">
                {searchResults.map(item => (
                  <div
                    key={item.id}
                    className="gis-search-result-item"
                    onClick={() => handleSelectSearchItem(item)}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: '#fff' }}>{item.title}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.layerName}</div>
                    </div>
                    {item.ha && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--primary-light)', fontWeight: 600 }}>
                        {Number(item.ha).toLocaleString()} ha
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Measurement Tool Button */}
          <button
            className={`gis-tool-btn ${isMeasuring ? 'active' : ''}`}
            onClick={() => setIsMeasuring(!isMeasuring)}
            title="Herramienta de Medición (Distancia y Área)"
          >
            <Ruler size={16} />
          </button>

          {/* Direct Download Hub Button */}
          <button
            className={`gis-tool-btn ${isDownloadHubOpen ? 'active' : ''}`}
            onClick={() => {
              setIsDownloadHubOpen(!isDownloadHubOpen);
              if (isMeasuring) setIsMeasuring(false);
            }}
            title="Centro de Descargas Directas de Capas (SHP, GeoJSON, CSV)"
          >
            <Download size={16} />
          </button>

          {/* Fit Extent Button */}
          <button
            className="gis-tool-btn"
            onClick={handleFitAllLayers}
            title="Reencuadrar todo el territorio (Fit Extent)"
          >
            <Compass size={16} />
          </button>

          {/* Basemap Switcher Dropdown */}
          <div style={{ position: 'relative' }}>
            <select
              className="basemap-dropdown-select"
              value={activeBasemap}
              onChange={e => setActiveBasemap(e.target.value)}
              style={{
                background: 'var(--bg-glass)',
                backdropFilter: 'blur(12px)',
                border: '1px solid var(--border-subtle)',
                color: '#fff',
                padding: '0.45rem 0.65rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              {Object.entries(BASEMAP_URLS).map(([key, cfg]) => (
                <option key={key} value={key} style={{ background: '#0f172a' }}>
                  🗺️ {cfg.name}
                </option>
              ))}
            </select>
          </div>

          {/* Fullscreen Button */}
          <button
            className="gis-tool-btn"
            onClick={handleToggleFullscreen}
            title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>

        {/* Measurement Active Banner */}
        {isMeasuring && (
          <div className="gis-measure-banner">
            <div className="gis-measure-header">
              <span>📏 Medición de Terreno</span>
              <button
                onClick={handleClearMeasurement}
                title="Reiniciar trazo"
                style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer' }}
              >
                <RotateCcw size={14} />
              </button>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Haz clic en el mapa para añadir vértices.
            </div>
            <div className="gis-measure-stats">
              <span>Distancia:</span>
              <span className="gis-measure-val">
                {measureStats.distanceM > 1000
                  ? `${(measureStats.distanceM / 1000).toFixed(2)} km`
                  : `${Math.round(measureStats.distanceM)} m`}
              </span>
            </div>
            {measurePoints.length >= 3 && (
              <div className="gis-measure-stats">
                <span>Superficie:</span>
                <span className="gis-measure-val" style={{ color: 'var(--primary-light)' }}>
                  {(measureStats.areaM2 / 10000).toFixed(2)} ha
                </span>
              </div>
            )}
          </div>
        )}

        {/* Floating GIS Direct Download Panel */}
        {isDownloadHubOpen && (
          <div className="gis-download-panel">
            <div className="gis-download-header">
              <div className="gis-download-title">
                <Download size={18} color="var(--primary-light)" />
                <span>Centro de Descargas Directas</span>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setIsDownloadHubOpen(false)}
                title="Cerrar panel de descargas"
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: 1.4 }}>
              Haz clic directamente en cualquier formato para iniciar la descarga instantánea de la capa oficial:
            </p>

            <div className="gis-download-list">
              {layers.map(layer => {
                const officialColor = OFFICIAL_LAYER_COLORS[layer.id] || layer.color;
                const isCopied = copiedDownloadId === layer.id;

                return (
                  <div key={layer.id} className="gis-download-item">
                    <div className="gis-download-item-title">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span className="layer-color-dot" style={{ background: officialColor }} />
                        <span>{layer.name}</span>
                      </div>
                      <button
                        onClick={() => handleCopyDirectLink(layer.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: isCopied ? 'var(--primary-light)' : 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontSize: '0.7rem'
                        }}
                        title="Copiar enlace de descarga directa para compartir"
                      >
                        {isCopied ? <Check size={12} color="#10b981" /> : <Share2 size={12} />}
                        <span>{isCopied ? '¡Copiado!' : 'Copiar Link'}</span>
                      </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      <span>{layer.recordsCount} registros &bull; UTM 18S</span>
                      {layer.totalHectares && (
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                          {layer.totalHectares.toLocaleString()} ha
                        </span>
                      )}
                    </div>

                    <div className="gis-download-btn-row">
                      <a
                        href={getDownloadUrl(layer.id, 'shp')}
                        download={`${layer.id}_SHP.zip`}
                        className="btn-gis-dl-main"
                        title={`Descargar ${layer.name} en Shapefile ZIP (.shp, .dbf, .prj, .shx)`}
                      >
                        <Download size={13} />
                        <span>SHP (.zip)</span>
                      </a>
                      <a
                        href={getDownloadUrl(layer.id, 'geojson')}
                        download={`${layer.id}.geojson`}
                        className="btn-gis-dl-sub"
                        title="Descargar en formato GeoJSON WGS84"
                      >
                        GeoJSON
                      </a>
                      <a
                        href={getDownloadUrl(layer.id, 'csv')}
                        download={`${layer.id}_atributos.csv`}
                        className="btn-gis-dl-sub"
                        title="Descargar tabla de atributos en CSV para Excel"
                      >
                        CSV
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Hover Quick HUD */}
        {hoveredFeature && !selectedFeature && (
          <div className="map-hud-overlay">
            <div className="map-hud-header">
              <div className="map-hud-title">
                {hoveredFeature.geometryType === 'Point' ? '📍' : '🌲'}
                <span>{hoveredFeature.title}</span>
              </div>
              <span className="map-hud-tag" style={{ background: OFFICIAL_LAYER_COLORS[hoveredFeature.layerId] || 'var(--primary)', color: '#000', fontWeight: 700 }}>
                {hoveredFeature.layerName}
              </span>
            </div>

            {hoveredFeature.properties.HA && (
              <div className="map-hud-row">
                <span className="map-hud-label">Superficie:</span>
                <span className="map-hud-val" style={{ color: 'var(--primary-light)', fontSize: '0.85rem' }}>
                  {Number(hoveredFeature.properties.HA).toLocaleString()} ha
                </span>
              </div>
            )}

            {hoveredFeature.properties.TITULAR_1 && (
              <div className="map-hud-row">
                <span className="map-hud-label">Titular:</span>
                <span className="map-hud-val">{hoveredFeature.properties.TITULAR_1}</span>
              </div>
            )}
          </div>
        )}

        {/* Slide-out Feature Drawer Inspector */}
        {selectedFeature && (
          <div className="gis-drawer-panel">
            <div className="gis-drawer-header">
              <div>
                <span
                  className="gis-drawer-badge"
                  style={{
                    background: OFFICIAL_LAYER_COLORS[selectedFeature.layerId] || 'var(--primary)',
                    color: '#000'
                  }}
                >
                  {selectedFeature.layerName}
                </span>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', margin: 0 }}>
                  {selectedFeature.geometryType === 'Point' ? '📍 ' : '🌲 '}
                  {selectedFeature.title}
                </h3>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setSelectedFeature(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="gis-drawer-body">
              {/* Metric Card */}
              {selectedFeature.properties.HA && (
                <div className="gis-drawer-card" style={{ borderLeft: `4px solid ${OFFICIAL_LAYER_COLORS[selectedFeature.layerId] || 'var(--primary)'}` }}>
                  <div className="gis-drawer-card-title">Superficie Oficial</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary-light)' }}>
                    {Number(selectedFeature.properties.HA).toLocaleString()}{' '}
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>hectáreas</span>
                  </div>
                </div>
              )}

              {/* Titular & Contrato */}
              <div className="gis-drawer-card">
                <div className="gis-drawer-card-title">Datos Legales & Operativos</div>
                {selectedFeature.properties.TITULAR_1 && (
                  <div className="gis-drawer-row">
                    <span className="gis-drawer-key">Titular:</span>
                    <span className="gis-drawer-val">{selectedFeature.properties.TITULAR_1}</span>
                  </div>
                )}
                {selectedFeature.properties.CONTRATO_1 && (
                  <div className="gis-drawer-row">
                    <span className="gis-drawer-key">Contrato:</span>
                    <span className="gis-drawer-val" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>
                      {selectedFeature.properties.CONTRATO_1}
                    </span>
                  </div>
                )}
                {selectedFeature.properties.SITUA_OPER && (
                  <div className="gis-drawer-row">
                    <span className="gis-drawer-key">Situación:</span>
                    <span
                      className="gis-drawer-val"
                      style={{
                        color: selectedFeature.properties.SITUA_OPER.toLowerCase() === 'activa' ? '#34d399' : '#f87171'
                      }}
                    >
                      ● {selectedFeature.properties.SITUA_OPER}
                    </span>
                  </div>
                )}
              </div>

              {/* Geografía */}
              <div className="gis-drawer-card">
                <div className="gis-drawer-card-title">Ubicación Geográfica</div>
                {selectedFeature.properties.CUENCA_1 && (
                  <div className="gis-drawer-row">
                    <span className="gis-drawer-key">Cuenca / Río:</span>
                    <span className="gis-drawer-val">{selectedFeature.properties.CUENCA_1}</span>
                  </div>
                )}
                {selectedFeature.properties.DISTRITO && (
                  <div className="gis-drawer-row">
                    <span className="gis-drawer-key">Distrito:</span>
                    <span className="gis-drawer-val">{selectedFeature.properties.DISTRITO}</span>
                  </div>
                )}
                {selectedFeature.properties.PROVINCIA && (
                  <div className="gis-drawer-row">
                    <span className="gis-drawer-key">Provincia:</span>
                    <span className="gis-drawer-val">{selectedFeature.properties.PROVINCIA}</span>
                  </div>
                )}
                <div className="gis-drawer-row">
                  <span className="gis-drawer-key">Departamento:</span>
                  <span className="gis-drawer-val">Loreto, Perú</span>
                </div>
              </div>

              {/* Observations if any */}
              {selectedFeature.properties.NOTA && (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.75rem'
                  }}
                >
                  ⚠️ <strong>Nota:</strong> {selectedFeature.properties.NOTA}
                </div>
              )}
            </div>

            <div className="gis-drawer-actions">
              <button
                className="btn-primary-action"
                style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}
                onClick={() => {
                  if (selectedFeature.feature && mapInstanceRef.current) {
                    const temp = L.geoJSON(selectedFeature.feature);
                    mapInstanceRef.current.flyToBounds(temp.getBounds(), { padding: [60, 60], duration: 1.2 });
                  }
                }}
              >
                <Crosshair size={15} />
                <span>Centrar</span>
              </button>

              <button
                className="btn-secondary-action"
                style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}
                onClick={handleCopyFeatureDetails}
              >
                {copyFeedback ? <Check size={15} color="#10b981" /> : <Copy size={15} />}
                <span>{copyFeedback ? '¡Copiado!' : 'Copiar Ficha'}</span>
              </button>
            </div>

            {/* Direct Layer Download from Drawer */}
            <div style={{ marginTop: '0.65rem' }}>
              <a
                href={getDownloadUrl(selectedFeature.layerId, 'shp')}
                download={`${selectedFeature.layerId}_SHP.zip`}
                className="btn-drawer-download"
                style={{ width: '100%', marginBottom: '0.35rem' }}
                title={`Descargar Shapefile ZIP completo de ${selectedFeature.layerName}`}
              >
                <Download size={15} />
                <span>Descargar Capa Completa (SHP .zip)</span>
              </a>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
                <a
                  href={getDownloadUrl(selectedFeature.layerId, 'geojson')}
                  download={`${selectedFeature.layerId}.geojson`}
                  className="btn-gis-dl-sub"
                  title="Descargar en formato GeoJSON"
                  style={{ textAlign: 'center' }}
                >
                  GeoJSON
                </a>
                <a
                  href={getDownloadUrl(selectedFeature.layerId, 'csv')}
                  download={`${selectedFeature.layerId}_atributos.csv`}
                  className="btn-gis-dl-sub"
                  title="Descargar tabla en CSV"
                  style={{ textAlign: 'center' }}
                >
                  CSV (Excel)
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Collapsible Dynamic Official Legend */}
        <div className="gis-legend-widget">
          <div
            className="gis-legend-header"
            onClick={() => setIsLegendOpen(!isLegendOpen)}
          >
            <span>🌿 Leyenda Oficial GGF</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {isLegendOpen ? '▲ Ocultar' : '▼ Mostrar'}
            </span>
          </div>

          {isLegendOpen && (
            <div style={{ marginTop: '0.35rem' }}>
              <div className="gis-legend-item">
                <div className="gis-legend-swatch" style={{ background: '#C27107' }} />
                <span>Concesiones GGF (15 unidades)</span>
              </div>
              <div className="gis-legend-item">
                <div className="gis-legend-swatch" style={{ background: '#FFB300' }} />
                <span>Proyecto GGL1 (Oct 2022)</span>
              </div>
              <div className="gis-legend-item">
                <div className="gis-legend-swatch" style={{ background: '#A5C639' }} />
                <span>Proyecto GGL2 (Área neta)</span>
              </div>
              <div className="gis-legend-item">
                <div className="gis-legend-swatch" style={{ background: '#EF4444', borderRadius: '50%' }} />
                <span>Campamentos GGF (Balizas)</span>
              </div>
            </div>
          )}
        </div>

        {/* Live Bottom Coordinates & Metrics Bar */}
        <div className="map-kpi-bar">
          <div className="map-kpi-item">
            <Radio size={14} color="var(--primary-light)" style={{ animation: 'spin 3s linear infinite' }} />
            <span>Superficie Activa:</span>
            <strong>{visibleHectares.toLocaleString()} ha</strong>
          </div>

          <div style={{ width: '1px', height: '14px', background: 'var(--border-subtle)' }} />

          <div className="map-kpi-item" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
            <span>Cursor WGS84:</span>
            <strong style={{ color: 'var(--primary-light)' }}>
              {mouseCoords.lat}°, {mouseCoords.lng}°
            </strong>
          </div>

          {mouseCoords.utmX && (
            <>
              <div style={{ width: '1px', height: '14px', background: 'var(--border-subtle)' }} />
              <div className="map-kpi-item" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                <span>UTM 18S:</span>
                <strong style={{ color: 'var(--accent-cyan)' }}>
                  {mouseCoords.utmX.toLocaleString()} E, {mouseCoords.utmY.toLocaleString()} N
                </strong>
              </div>
            </>
          )}

          <div style={{ width: '1px', height: '14px', background: 'var(--border-subtle)' }} />

          <div className="map-kpi-item" style={{ fontSize: '0.72rem' }}>
            <span>Zoom:</span>
            <strong>{currentZoom}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
