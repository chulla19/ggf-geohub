import React, { useState, useEffect } from 'react';
import { Table, Search, Download, RefreshCw, Filter } from 'lucide-react';
import { fetchRecordsData, getDownloadUrl } from '../utils/api';

export default function DataTable({ layers, selectedLayerId, onSelectLayer }) {
  const [currentLayerId, setCurrentLayerId] = useState(selectedLayerId || (layers[0] ? layers[0].id : null));
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [sortField, setSortField] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    if (selectedLayerId) {
      setCurrentLayerId(selectedLayerId);
    }
  }, [selectedLayerId]);

  useEffect(() => {
    if (!currentLayerId) return;

    let isMounted = true;
    setLoading(true);
    fetchRecordsData(currentLayerId)
      .then(data => {
        if (isMounted && data && data.records) {
          setRecords(data.records);
        }
      })
      .catch(err => console.error('Error fetching table records:', err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [currentLayerId]);

  const currentLayer = layers.find(l => l.id === currentLayerId);

  // Extract columns
  const columns = records.length > 0 ? Object.keys(records[0]) : [];

  // Filter records
  const filteredRecords = records.filter(row => {
    if (!searchFilter.trim()) return true;
    const term = searchFilter.toLowerCase();
    return Object.values(row).some(
      val => val !== null && val !== undefined && String(val).toLowerCase().includes(term)
    );
  });

  // Sort records
  const sortedRecords = [...filteredRecords].sort((a, b) => {
    if (!sortField) return 0;
    const valA = a[sortField];
    const valB = b[sortField];

    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;

    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortAsc ? valA - valB : valB - valA;
    }
    return sortAsc
      ? String(valA).localeCompare(String(valB))
      : String(valB).localeCompare(String(valA));
  });

  const handleSort = field => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  return (
    <div className="table-inspector-container">
      <div className="section-header" style={{ marginBottom: '1rem' }}>
        <div className="section-header-title">
          <h2>
            <Table size={22} color="var(--primary)" />
            Inspector de Tabla de Atributos
          </h2>
          <p>Consulta, filtra y analiza las propiedades de cada entidad vectorial en tiempo real.</p>
        </div>

        <div className="filter-bar">
          {/* Layer Selector */}
          <select
            className="filter-select"
            value={currentLayerId}
            onChange={e => {
              setCurrentLayerId(e.target.value);
              if (onSelectLayer) onSelectLayer(e.target.value);
            }}
            style={{ fontWeight: 600, color: 'var(--primary-light)' }}
          >
            {layers.map(layer => (
              <option key={layer.id} value={layer.id}>
                {layer.name} ({layer.recordsCount} reg.)
              </option>
            ))}
          </select>

          {/* Quick Search in rows */}
          <div className="search-box">
            <Search size={16} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Filtrar valores de la tabla..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
            />
          </div>

          <a
            href={getDownloadUrl(currentLayerId, 'csv')}
            download
            className="btn-secondary-download"
            title="Exportar registros a CSV"
          >
            <Download size={14} />
            <span>Exportar CSV</span>
          </a>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: '0.75rem' }}>Cargando registros de la tabla...</p>
        </div>
      ) : records.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          No se encontraron registros para esta capa.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>Mostrando <strong>{sortedRecords.length}</strong> de {records.length} registros</span>
            {currentLayer && currentLayer.totalHectares && (
              <span>Superficie total: <strong>{currentLayer.totalHectares.toLocaleString()} ha</strong></span>
            )}
          </div>

          <div className="table-wrapper">
            <table className="gis-table">
              <thead>
                <tr>
                  {columns.map(col => (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      title="Haz clic para ordenar"
                    >
                      {col === '__index' ? '#' : col}{' '}
                      {sortField === col ? (sortAsc ? '▲' : '▼') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRecords.map((row, idx) => (
                  <tr key={idx}>
                    {columns.map(col => {
                      const val = row[col];
                      const isNumeric = typeof val === 'number';
                      return (
                        <td key={col} style={{ textAlign: isNumeric ? 'right' : 'left' }}>
                          {val !== null && val !== undefined && val !== '' ? (
                            isNumeric ? val.toLocaleString() : String(val)
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
