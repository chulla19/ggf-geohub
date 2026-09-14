import React, { useState, useEffect } from 'react';
import {
  Layers,
  Map as MapIcon,
  UploadCloud,
  CheckCircle,
  Globe,
  Share2,
  Check,
  ShieldCheck,
  ChevronDown,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';
import CatalogList from './components/CatalogList';
import MapViewer from './components/MapViewer';
import UploadModal from './components/UploadModal';

import { fetchLayersData } from './utils/api';
import ggfLogoOrange from './assets/logos/ggf-logo-orange.png';
import ggfLogoWhite from './assets/logos/ggf-logo-white.png';

export default function App() {
  const isAdmin = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('admin') === 'true';
  const [layers, setLayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('catalog'); // 'catalog' | 'map'
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [isShareCopied, setIsShareCopied] = useState(false);

  // Theme Mode: 'auto' | 'dark' | 'light'
  const [themeMode, setThemeMode] = useState(() => {
    return localStorage.getItem('ggf-theme') || 'auto';
  });

  useEffect(() => {
    localStorage.setItem('ggf-theme', themeMode);
    const root = document.documentElement;

    const applyTheme = () => {
      if (themeMode === 'auto') {
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.setAttribute('data-theme', systemPrefersDark ? 'dark' : 'light');
      } else {
        root.setAttribute('data-theme', themeMode);
      }
    };

    applyTheme();

    if (themeMode === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [themeMode]);

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

  const handleSharePortal = () => {
    const portalUrl = window.location.href.split('?')[0];
    navigator.clipboard.writeText(portalUrl).then(() => {
      setIsShareCopied(true);
      showToast('🔗 ¡Enlace del portal GeoGGF copiado al portapapeles!');
      setTimeout(() => setIsShareCopied(false), 3000);
    });
  };

  // Find active layer for dynamic area display
  const currentLayer = layers.find(l => l.id === selectedLayerId) || layers[0] || {};
  const currentArea = currentLayer.totalHectares
    ? `${Number(currentLayer.totalHectares).toLocaleString()} ha`
    : currentLayer.geometryType?.toLowerCase().includes('point')
    ? `${currentLayer.recordsCount || 3} Puntos Operativos`
    : '394,880 ha';

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <header className="navbar">
        <div className="brand" onClick={() => setActiveTab('catalog')}>
          <div className="brand-logo-container">
            <img
              src={ggfLogoOrange}
              alt="Green Gold Forestry"
              className="brand-logo-img"
            />
          </div>
          <div className="brand-title-group">
            <div className="brand-title-row">
              <h1>GeoGGF</h1>
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
        </nav>

        {/* Navbar Action */}
        <div className="nav-actions">
          {isAdmin && (
            <button className="btn-upload-nav" onClick={() => setIsUploadOpen(true)} title="Modo Administrador: Subir nuevo shapefile">
              <UploadCloud size={16} />
              <span>Subir Shapefile</span>
            </button>
          )}

          {/* Theme Switcher (Claro / Oscuro / Automático) */}
          <div className="theme-switcher-control" title="Cambiar tema visual">
            <button
              className={`theme-pill-btn ${themeMode === 'light' ? 'active' : ''}`}
              onClick={() => setThemeMode('light')}
              title="Tema Claro"
            >
              <Sun size={13} />
              <span>Claro</span>
            </button>
            <button
              className={`theme-pill-btn ${themeMode === 'dark' ? 'active' : ''}`}
              onClick={() => setThemeMode('dark')}
              title="Tema Oscuro"
            >
              <Moon size={13} />
              <span>Oscuro</span>
            </button>
            <button
              className={`theme-pill-btn ${themeMode === 'auto' ? 'active' : ''}`}
              onClick={() => setThemeMode('auto')}
              title="Tema Automático (según el sistema)"
            >
              <Monitor size={13} />
              <span>Auto</span>
            </button>
          </div>

          {/* Functional Share Button */}
          <button
            className={`btn-share-portal ${isShareCopied ? 'copied' : ''}`}
            onClick={handleSharePortal}
            title="Copiar enlace de esta página para compartir"
          >
            {isShareCopied ? (
              <>
                <Check size={15} color="#000" />
                <span>¡Copiado!</span>
              </>
            ) : (
              <>
                <Share2 size={15} />
                <span>Compartir</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Views */}
      <main className={`main-content ${activeTab === 'map' ? 'main-content-map' : ''}`}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
            <p>Cargando capas espaciales de Green Gold Forestry...</p>
          </div>
        ) : (
          <>
            {activeTab === 'catalog' && (
              <CatalogList
                layers={layers}
                onSelectLayerForMap={handleSelectLayerForMap}
                onShowToast={showToast}
              />
            )}

            {activeTab === 'map' && (
              <MapViewer
                layers={layers}
                initialFocusLayerId={selectedLayerId}
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
                src={ggfLogoWhite}
                alt="Green Gold Forestry"
                className="footer-logo-img"
              />
              <h4>Green Gold Forestry</h4>
            </div>
          </div>

          <div className="footer-meta-col">
            <p className="footer-copy">
              &copy; {new Date().getFullYear()} Green Gold Forestry. Todos los derechos reservados.
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
