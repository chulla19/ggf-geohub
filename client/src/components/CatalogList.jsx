import React, { useState } from 'react';
import {
  Download,
  Share2,
  Map,
  Search,
  Check,
  FileCode,
  Layers,
  Database,
  Tag,
  ExternalLink
} from 'lucide-react';
import { getDownloadUrl, getAbsoluteDownloadUrl } from '../utils/api';
import ggfLogoOrange from '../assets/logos/ggf-logo-orange.png';

export default function CatalogList({
  layers,
  onSelectLayerForMap,
  onShowToast
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [copiedLayerId, setCopiedLayerId] = useState(null);

  // Unique categories
  const categories = ['ALL', ...new Set(layers.map(l => l.category || 'Otros'))];

  const filteredLayers = layers.filter(l => {
    const matchesSearch =
      l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.tags && l.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()))) ||
      (l.project && l.project.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCat =
      selectedCategory === 'ALL' || (l.category || 'Otros') === selectedCategory;

    return matchesSearch && matchesCat;
  });

  const handleCopyShareLink = (layerId, layerName) => {
    const directUrl = getAbsoluteDownloadUrl(layerId, 'shp');
    navigator.clipboard.writeText(directUrl).then(() => {
      setCopiedLayerId(layerId);
      if (onShowToast) {
        onShowToast(`🔗 ¡Enlace directo de "${layerName}" copiado al portapapeles! Listo para enviar.`);
      }
      setTimeout(() => setCopiedLayerId(null), 3000);
    });
  };

  const formatBytes = bytes => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div>
      {/* Corporate Hero Banner */}
      <div className="catalog-hero-card">
        <div className="catalog-hero-content">
          <div className="catalog-hero-brand">
            <img
              src={ggfLogoOrange}
              alt="GGF Group"
              className="catalog-hero-logo"
            />
            <div className="catalog-hero-text">
              <div className="catalog-hero-badge">
                <span className="badge-dot"></span>
                <span>Portal Corporativo de Información Territorial</span>
              </div>
              <h2>Green Gold Forestry &bull; GeoGGF</h2>
              <p>
                Repositorio geoespacial oficial para la descarga de capas Shapefile (.shp),
                visualización satelital de alta resolución y análisis de concesiones forestales en Perú.
              </p>
            </div>
          </div>

          <div className="catalog-hero-highlights">
            <div className="hero-hl-item">
              <span className="hero-hl-num">394k+</span>
              <span className="hero-hl-txt">Hectáreas en Manejo</span>
            </div>
            <div className="hero-hl-divider"></div>
            <div className="hero-hl-item">
              <span className="hero-hl-num">WGS 84</span>
              <span className="hero-hl-txt">UTM Zona 18S</span>
            </div>
            <div className="hero-hl-divider"></div>
            <div className="hero-hl-item">
              <span className="hero-hl-num">100%</span>
              <span className="hero-hl-txt">Shapefile Oficial</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters Header */}
      <div className="section-header">
        <div className="section-header-title">
          <h2>
            <Database size={22} color="var(--primary)" />
            Catálogo de Capas y Descargas Directas
          </h2>
          <p>
            Descarga paquetes Shapefile listos para QGIS/ArcGIS o copia el enlace directo para compartir con tus compañeros.
          </p>
        </div>

        <div className="filter-bar">
          <div className="search-box">
            <Search size={18} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Buscar por nombre, proyecto, etiqueta..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="filter-select"
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat === 'ALL' ? 'Todas las categorías' : cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid of Shapefile Cards */}
      <div className="catalog-grid">
        {filteredLayers.map(layer => {
          const isCopied = copiedLayerId === layer.id;
          const isPolygon = layer.geometryType.toLowerCase().includes('polygon');

          return (
            <div
              key={layer.id}
              className="catalog-card"
              style={{ '--card-accent': layer.color }}
            >
              <div>
                <div className="card-top">
                  <span className="card-category-badge">{layer.category}</span>
                  <span className={`card-geom-badge ${isPolygon ? 'polygon' : 'point'}`}>
                    {isPolygon ? '▱ Polígono' : '📍 Punto'}
                  </span>
                </div>

                <h3 className="card-title">{layer.name}</h3>
                <span className="card-rawname">{layer.rawName}.shp</span>

                <p className="card-description">{layer.description}</p>

                {/* Key Metrics */}
                <div className="card-metrics">
                  <div className="metric-box">
                    <div className="m-label">Elementos</div>
                    <div className="m-value">{layer.recordsCount} registros</div>
                  </div>
                  <div className="metric-box">
                    <div className="m-label">Superficie Total</div>
                    <div className="m-value">
                      {layer.totalHectares ? `${layer.totalHectares.toLocaleString()} ha` : 'N/A (Puntos)'}
                    </div>
                  </div>
                  <div className="metric-box">
                    <div className="m-label">Tamaño en Disco</div>
                    <div className="m-value">{formatBytes(layer.sizeBytes)}</div>
                  </div>
                  <div className="metric-box">
                    <div className="m-label">Proyección</div>
                    <div className="m-value" style={{ fontSize: '0.8rem' }}>UTM 18S WGS84</div>
                  </div>
                </div>

                {/* Tags */}
                {layer.tags && layer.tags.length > 0 && (
                  <div className="card-tags">
                    {layer.tags.map(tag => (
                      <span key={tag} className="tag-pill">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="card-actions">
                {/* Download Group */}
                <div className="download-btn-group">
                  <a
                    href={getDownloadUrl(layer.id, 'shp')}
                    download
                    className="btn-shp-download"
                    title="Descarga el Shapefile completo comprimido en .ZIP (incluye .shp, .dbf, .prj, .shx)"
                  >
                    <Download size={16} />
                    <span>Shapefile ZIP</span>
                  </a>

                  <a
                    href={getDownloadUrl(layer.id, 'geojson')}
                    download
                    className="btn-secondary-download"
                    title="Descargar en formato GeoJSON WGS84"
                  >
                    GeoJSON
                  </a>

                  <a
                    href={getDownloadUrl(layer.id, 'csv')}
                    download
                    className="btn-secondary-download"
                    title="Descargar tabla de atributos en CSV para Excel"
                  >
                    CSV
                  </a>
                </div>

                {/* One-Click Share Link */}
                <button
                  className="btn-share-link"
                  onClick={() => handleCopyShareLink(layer.id, layer.name)}
                >
                  {isCopied ? (
                    <>
                      <Check size={14} color="var(--primary-light)" />
                      <span style={{ color: 'var(--primary-light)' }}>¡Enlace directo copiado!</span>
                    </>
                  ) : (
                    <>
                      <Share2 size={14} />
                      <span>Copiar Enlace Directo para Compañeros</span>
                    </>
                  )}
                </button>

                {/* View on Map */}
                <button
                  className="btn-card-map-view"
                  onClick={() => onSelectLayerForMap(layer.id)}
                >
                  <Map size={15} />
                  <span>Explorar en Visor Satelital GGF</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
