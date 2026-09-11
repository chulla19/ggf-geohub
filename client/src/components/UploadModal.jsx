import React, { useState, useRef } from 'react';
import { UploadCloud, X, FileArchive, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function UploadModal({ isOpen, onClose, onUploadSuccess }) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleDragOver = e => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = e => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelected = selectedFile => {
    if (!selectedFile.name.toLowerCase().endsWith('.zip')) {
      setError('Por favor selecciona un archivo comprimido .ZIP que contenga el shapefile (.shp, .dbf, .prj, .shx)');
      setFile(null);
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setFile(selectedFile);
  };

  const handleUploadSubmit = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al subir y procesar el archivo');
      }

      setSuccessMsg(data.message || 'Capa subida y catalogada exitosamente');
      setTimeout(() => {
        if (onUploadSuccess) onUploadSuccess(data.layerId);
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <UploadCloud size={20} color="var(--primary-light)" />
            Subir Nuevo Shapefile
          </h3>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div
          className={`dropzone-area ${dragOver ? 'drag-over' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".zip"
            onChange={e => e.target.files && handleFileSelected(e.target.files[0])}
          />
          <UploadCloud className="dropzone-icon" />
          <div className="dropzone-title">
            {file ? file.name : 'Arrastra tu archivo Shapefile .ZIP aquí'}
          </div>
          <div className="dropzone-subtitle">
            {file
              ? `${(file.size / 1024 / 1024).toFixed(2)} MB - Haz clic para cambiar de archivo`
              : 'O haz clic para explorar en tu computadora. El ZIP debe contener .shp, .dbf, .prj y .shx.'}
          </div>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1rem'
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: 'var(--primary-light)',
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1rem'
            }}
          >
            <CheckCircle2 size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
          <button
            className="btn-secondary-download"
            onClick={onClose}
            disabled={uploading}
          >
            Cancelar
          </button>

          <button
            className="btn-shp-download"
            onClick={handleUploadSubmit}
            disabled={!file || uploading}
            style={{ opacity: !file || uploading ? 0.6 : 1 }}
          >
            {uploading ? (
              <>
                <Loader2 size={16} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                <span>Procesando ZIP...</span>
              </>
            ) : (
              <>
                <UploadCloud size={16} />
                <span>Guardar y Catalogar</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
