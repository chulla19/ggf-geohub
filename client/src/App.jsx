import React, { useState, useEffect } from 'react';
import {
  Trees,
  Layers,
  Map as MapIcon,
  Table as TableIcon,
  UploadCloud,
  CheckCircle,
  Compass,
  Globe,
  Share2,
  HardDrive,
  ShieldCheck
} from 'lucide-react';
import CatalogList from './components/CatalogList';
import MapViewer from './components/MapViewer';
import DataTable from './components/DataTable';
import UploadModal from './components/UploadModal';

import { fetchLayersData } from './utils/api';

export default function App() {
  const isAdmin = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('admin') === 'true';
  const [layers, setLayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('catalog'); // 'catalog' | 'map' | 'table'
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const fetchLayers = async () => {
    setLoading(true);
    try {
      const data = await fetchLayersData();
      if (data && data.success) {
        setLayers(data.layers);
        if (!selectedLayerId && data.layers.length > 0) {
          setSelectedLayerId(data.layers[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching layers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLayers();
  }, []);

  const showToast = message => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const handleSelectLayerForMap = layerId => {
    setSelectedLayerId(layerId);
    setActiveTab('map');
  };

  const handleSelectLayerForTable = layerId => {
    setSelectedLayerId(layerId);
    setActiveTab('table');
  };

  // Calculate aggregates
  const totalHectares = layers.reduce((acc, l) => {
    if (l.id === 'Conseciones_unidos' && l.totalHectares) {
      return l.totalHectares;
    }
    return acc;
  }, 394880);

  const totalPolygons = layers.reduce((acc, l) => acc + (l.recordsCount || 0), 0);

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <header className="navbar">
        <div className="brand" onClick={() => setActiveTab('catalog')}>
          <div className="brand-logo-container">
            <img
              src="/logos/ggf-logo-orange.png"
              alt="Green Gold Forestry"
              className="brand-logo-img"
              onError={e => {
                e.currentTarget.src = '/logos/Logotipo_-_Naranja-SINFONDO.png';
              }}
            />
          </div>
          <div className="brand-title-group">
            <div className="brand-title-row">
              <h1>GeoHub</h1>
              <span className="brand-badge-pill">SIG Loreto</span>
            </div>
            <p>Green Gold Forestry &bull; Perú</p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <nav className="nav-tabs">
          <button
            className={`nav-tab-btn ${activeTab === 'catalog' ? 'active' : ''}`}
            onClick={() => setActiveTab('catalog')}
          >
            <Layers size={16} />
            <span>Catálogo & Descargas</span>
          </button>

          <button
            className={`nav-tab-btn ${activeTab === 'map' ? 'active' : ''}`}
            onClick={() => setActiveTab('map')}
          >
            <MapIcon size={16} />
            <span>Visor Satelital GGF</span>
          </button>

          <button
            className={`nav-tab-btn ${activeTab === 'table' ? 'active' : ''}`}
            onClick={() => setActiveTab('table')}
          >
            <TableIcon size={16} />
            <span>Tabla de Atributos</span>
          </button>
        </nav>

        {/* Navbar Action */}
        <div className="nav-actions">
          {isAdmin ? (
            <button className="btn-upload-nav" onClick={() => setIsUploadOpen(true)} title="Modo Administrador: Subir nuevo shapefile">
              <UploadCloud size={16} />
              <span>Subir Shapefile (Admin)</span>
            </button>
          ) : (
            <div className="read-only-badge" title="Portal público oficial de Green Gold Forestry">
              <ShieldCheck size={16} color="var(--primary-light)" />
              <span>Repositorio Oficial GGF</span>
            </div>
          )}
        </div>
      </header>

      {/* Metrics Banner */}
      <section className="stats-banner">
        <div className="stats-group">
          <div className="stat-item">
            <div className="stat-icon ggf-forest">
              <Globe size={20} />
            </div>
            <div className="stat-text">
              <div className="value">{totalHectares.toLocaleString()} ha</div>
              <div className="label">Superficie Concesiones</div>
            </div>
          </div>

          <div className="stat-item">
            <div className="stat-icon ggf-orange">
              <Layers size={20} />
            </div>
            <div className="stat-text">
              <div className="value">{layers.length} Capas</div>
              <div className="label">En Repositorio SIG</div>
            </div>
          </div>

          <div className="stat-item">
            <div className="stat-icon ggf-gold">
              <HardDrive size={20} />
            </div>
            <div className="stat-text">
              <div className="value">{totalPolygons} Registros</div>
              <div className="label">Polígonos & Puntos</div>
            </div>
          </div>

          <div className="stat-item">
            <div className="stat-icon ggf-lime">
              <Compass size={20} />
            </div>
            <div className="stat-text">
              <div className="value">UTM 18S</div>
              <div className="label">Datum WGS 1984</div>
            </div>
          </div>
        </div>

        <div className="share-quick-hint">
          <Share2 size={15} color="var(--ggf-orange)" />
          <span>Enlaces directos Shapefile &bull; Descarga sin intermediarios</span>
        </div>
      </section>

      {/* Main Views */}
      <main className="main-content">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🌲</div>
            <p>Cargando capas espaciales de Green Gold Forestry...</p>
          </div>
        ) : (
          <>
            {activeTab === 'catalog' && (
              <CatalogList
                layers={layers}
                onSelectLayerForMap={handleSelectLayerForMap}
                onSelectLayerForTable={handleSelectLayerForTable}
                onShowToast={showToast}
              />
            )}

            {activeTab === 'map' && (
              <MapViewer
                layers={layers}
                initialFocusLayerId={selectedLayerId}
              />
            )}

            {activeTab === 'table' && (
              <DataTable
                layers={layers}
                selectedLayerId={selectedLayerId}
                onSelectLayer={id => setSelectedLayerId(id)}
              />
            )}
          </>
        )}
      </main>

      {/* Corporate Footer */}
      <footer className="corporate-footer">
        <div className="footer-content">
          <div className="footer-brand-col">
            <div className="footer-logo-row">
              <img
                src="/logos/ggf-logo-white.png"
                alt="GGF Group"
                className="footer-logo-img"
                onError={e => {
                  e.currentTarget.src = '/logos/ggf-logo-orange.png';
                }}
              />
              <div>
                <h4>Green Gold Forestry</h4>
                <p>Manejo Forestal Sostenible &bull; Loreto, Perú</p>
              </div>
            </div>
            <p className="footer-description">
              Plataforma geoespacial y de catalogación territorial oficial de Green Gold Forestry S.A.C.
              Gestión de concesiones forestales, zonificación y proyectos de conservación en la Amazonía Peruana.
            </p>
          </div>

          <div className="footer-meta-col">
            <div className="footer-pill-group">
              <span className="footer-pill">📍 Loreto &bull; Amazonía Peruana</span>
              <span className="footer-pill">🌐 EPSG: 32718 (UTM 18S)</span>
              <span className="footer-pill">🌲 394,880+ Hectáreas Protegidas</span>
            </div>
            <p className="footer-copy">
              &copy; {new Date().getFullYear()} Green Gold Forestry (GGF Group). Todos los derechos reservados.
            </p>
          </div>
        </div>
      </footer>

      {/* Upload Modal (Admin only) */}
      {isAdmin && (
        <UploadModal
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          onUploadSuccess={newLayerId => {
            fetchLayers();
            showToast('✅ ¡Nueva capa shapefile agregada al repositorio!');
            if (newLayerId) setSelectedLayerId(newLayerId);
          }}
        />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast-notice">
          <CheckCircle size={18} />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
