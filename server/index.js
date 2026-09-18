import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { readShapefileToGeoJSON, createShapefileZip, recordsToCSV } from './utils/shpConverter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const SHP_DIR = path.join(WORKSPACE_ROOT, 'SHP');
const UPLOADS_DIR = path.join(WORKSPACE_ROOT, 'uploads');
const CLIENT_DIST = path.join(WORKSPACE_ROOT, 'client', 'dist');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Memory cache for GeoJSON features to ensure instant responses
const geojsonCache = new Map();

// Layer catalog definitions with enhanced friendly metadata
const LAYER_METADATA_CONFIG = {
  'Conseciones_unidos': {
    name: 'Concesiones GGF',
    project: 'Concesiones GGF',
    category: 'Concesiones',
    description: 'Delimitación oficial de 15 concesiones forestales adjudicadas y asociadas a Green Gold Forestry.',
    color: '#F97316', // Naranja #F97316
    tags: ['Concesiones GGF', 'Forestal', 'Carbono', 'Loreto 1 & 2']
  },
  'Proyecto_GGL1': {
    name: 'Proyecto GGL1',
    project: 'Proyecto GGL1',
    category: 'Límites & Cobertura',
    description: 'Área del Proyecto GGL1 y cobertura vegetal con zonificación de bosque alto y fisiografía.',
    color: '#EAB308', // Amarillo #EAB308
    tags: ['Proyecto GGL1', 'Cobertura Vegetal', 'Fisiografía', 'Loreto 1']
  },
  'Area_Proyecto_Oct2022': {
    name: 'Proyecto GGL1',
    project: 'Proyecto GGL1',
    category: 'Límites & Cobertura',
    description: 'Área del Proyecto GGL1 y cobertura vegetal (Línea base Oct 2022) con zonificación de bosque alto y fisiografía.',
    color: '#EAB308', // Amarillo #EAB308
    tags: ['Proyecto GGL1', 'Cobertura Vegetal', 'Fisiografía', 'Oct 2022']
  },
  'Proyecto_GGL2': {
    name: 'Proyecto GGL2',
    project: 'Proyecto GGL2',
    category: 'Límites de Proyecto',
    description: 'Área neta elegible del Proyecto GGL2 (Loreto 2) con exclusión de zona de amortiguamiento de 10 km / comunidades nativas.',
    color: '#0EA5E9',
    tags: ['Proyecto GGL2', 'Área Neta', 'Loreto 2']
  },
  'Area_Proyecto_GGL2_SinB10K120925': {
    name: 'Proyecto GGL2',
    project: 'Proyecto GGL2',
    category: 'Límites de Proyecto',
    description: 'Área neta elegible del Proyecto GGL2 (Loreto 2) con exclusión de zona de amortiguamiento de 10 km / comunidades nativas.',
    color: '#0EA5E9',
    tags: ['Proyecto GGL2', 'Área Neta', 'Buffer 10K', 'Loreto 2']
  },
  'CampamentosGGF': {
    name: 'Campamentos GGF',
    project: 'Campamentos GGF',
    category: 'Infraestructura',
    description: 'Ubicaciones y balizas estratégicas de los campamentos base GGF: Bahía, Mazán (Oroza) y Bravo.',
    color: '#EF4444', // Rojo
    tags: ['Campamentos GGF', 'Puntos', 'Operaciones', 'Logística']
  }
};

// Scan all available layers in SHP and uploads folders
function getAvailableLayers() {
  const dirs = [
    { dir: SHP_DIR, source: 'base' },
    { dir: UPLOADS_DIR, source: 'user' }
  ];

  const layers = [];

  for (const { dir, source } of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    const shpFiles = files.filter(f => f.toLowerCase().endsWith('.shp'));

    for (const shpFile of shpFiles) {
      const baseName = path.parse(shpFile).name;
      const shpPath = path.join(dir, `${baseName}.shp`);
      const dbfPath = path.join(dir, `${baseName}.dbf`);
      const prjPath = path.join(dir, `${baseName}.prj`);

      const relatedFiles = files.filter(f => path.parse(f).name === baseName);
      let totalSize = 0;
      relatedFiles.forEach(f => {
        try {
          totalSize += fs.statSync(path.join(dir, f)).size;
        } catch (e) {}
      });

      const config = LAYER_METADATA_CONFIG[baseName] || {
        name: baseName.replace(/_/g, ' '),
        project: 'Personalizado',
        category: 'Capas Cargadas',
        description: `Capa vectorial shapefile (${baseName})`,
        color: '#3b82f6',
        tags: ['Shapefile', source === 'user' ? 'Subido' : 'Base']
      };

      layers.push({
        id: baseName,
        rawName: baseName,
        name: config.name,
        project: config.project,
        category: config.category,
        description: config.description,
        color: config.color,
        tags: config.tags,
        source,
        dir,
        hasDbf: fs.existsSync(dbfPath),
        hasPrj: fs.existsSync(prjPath),
        files: relatedFiles,
        sizeBytes: totalSize,
        crs: 'WGS 1984 UTM Zona 18S (EPSG: 32718)'
      });
    }
  }

  return layers;
}

// API: List layers catalog with summary statistics
app.get('/api/layers', async (req, res) => {
  try {
    const layers = getAvailableLayers();
    const enriched = [];

    for (const layer of layers) {
      // If we don't have cached geojson yet, get feature count
      let geojson = geojsonCache.get(layer.id);
      if (!geojson) {
        const shpPath = path.join(layer.dir, `${layer.id}.shp`);
        const dbfPath = path.join(layer.dir, `${layer.id}.dbf`);
        geojson = await readShapefileToGeoJSON(shpPath, dbfPath);
        geojsonCache.set(layer.id, geojson);
      }

      let totalHa = 0;
      const geometryTypes = new Set();

      geojson.features.forEach(f => {
        if (f.geometry && f.geometry.type) {
          geometryTypes.add(f.geometry.type);
        }
        const props = f.properties || {};
        const ha = props.HA || props.Ha || props.ha_1 || props.Superficie;
        if (typeof ha === 'number') {
          totalHa += ha;
        }
      });

      enriched.push({
        ...layer,
        recordsCount: geojson.features.length,
        geometryType: Array.from(geometryTypes).join(', ') || 'Desconocido',
        totalHectares: totalHa > 0 ? Number(totalHa.toFixed(2)) : null
      });
    }

    res.json({ success: true, count: enriched.length, layers: enriched });
  } catch (error) {
    console.error('Error getting layers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Get GeoJSON representation for web map
app.get('/api/layers/:id/geojson', async (req, res) => {
  try {
    const { id } = req.params;
    if (geojsonCache.has(id)) {
      return res.json(geojsonCache.get(id));
    }

    const layers = getAvailableLayers();
    const target = layers.find(l => l.id.toLowerCase() === id.toLowerCase());
    if (!target) {
      return res.status(404).json({ success: false, error: 'Capa no encontrada' });
    }

    const shpPath = path.join(target.dir, `${target.id}.shp`);
    const dbfPath = path.join(target.dir, `${target.id}.dbf`);
    const geojson = await readShapefileToGeoJSON(shpPath, dbfPath);
    geojsonCache.set(target.id, geojson);

    res.json(geojson);
  } catch (error) {
    console.error(`Error loading GeoJSON for ${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Get attribute records only (for fast table inspector)
app.get('/api/layers/:id/records', async (req, res) => {
  try {
    const { id } = req.params;
    let geojson = geojsonCache.get(id);
    if (!geojson) {
      const layers = getAvailableLayers();
      const target = layers.find(l => l.id.toLowerCase() === id.toLowerCase());
      if (!target) {
        return res.status(404).json({ success: false, error: 'Capa no encontrada' });
      }
      const shpPath = path.join(target.dir, `${target.id}.shp`);
      const dbfPath = path.join(target.dir, `${target.id}.dbf`);
      geojson = await readShapefileToGeoJSON(shpPath, dbfPath);
      geojsonCache.set(target.id, geojson);
    }

    const records = geojson.features.map((f, index) => ({
      __index: index + 1,
      ...f.properties
    }));

    res.json({ success: true, count: records.length, records });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Direct Download endpoint (Supports format=shp, geojson, csv)
app.get('/api/layers/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const format = (req.query.format || 'shp').toLowerCase();

    const layers = getAvailableLayers();
    const target = layers.find(l => l.id.toLowerCase() === id.toLowerCase());
    if (!target) {
      return res.status(404).send('Capa no encontrada');
    }

    if (format === 'shp') {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${target.id}_SHP.zip"`);
      return createShapefileZip(target.dir, target.id, res);
    }

    // Get GeoJSON
    let geojson = geojsonCache.get(target.id);
    if (!geojson) {
      const shpPath = path.join(target.dir, `${target.id}.shp`);
      const dbfPath = path.join(target.dir, `${target.id}.dbf`);
      geojson = await readShapefileToGeoJSON(shpPath, dbfPath);
      geojsonCache.set(target.id, geojson);
    }

    if (format === 'geojson') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${target.id}.geojson"`);
      return res.send(JSON.stringify(geojson, null, 2));
    }

    if (format === 'csv') {
      const records = geojson.features.map(f => f.properties);
      const csv = recordsToCSV(records);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${target.id}_atributos.csv"`);
      return res.send(csv);
    }

    return res.status(400).send('Formato de descarga no soportado. Usa shp, geojson o csv.');
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).send('Error al procesar la descarga: ' + error.message);
  }
});

// Multer upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  }
});
const upload = multer({ storage });

// API: Upload shapefile (.zip) - Protegido (Modo público de solo descargas)
app.post('/api/upload', (req, res, next) => {
  const isAdmin = req.query.admin === 'true' || req.headers['x-admin-key'] || process.env.ENABLE_UPLOADS === 'true';
  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'La subida de archivos está restringida al administrador. Este geoportal opera en modo público de solo descargas.'
    });
  }
  next();
}, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se envió ningún archivo' });
    }

    const filePath = req.file.path;
    const isZip = req.file.originalname.toLowerCase().endsWith('.zip');

    if (isZip) {
      const zip = new AdmZip(filePath);
      const zipEntries = zip.getEntries();
      
      // Extract all files directly into UPLOADS_DIR
      zip.extractAllTo(UPLOADS_DIR, true);

      // Clean up uploaded zip file
      try {
        fs.unlinkSync(filePath);
      } catch (e) {}

      // Find extracted shp file
      const extractedShp = zipEntries.find(e => e.entryName.toLowerCase().endsWith('.shp'));
      const baseName = extractedShp ? path.parse(extractedShp.entryName).name : null;

      // Invalidate cache
      geojsonCache.clear();

      return res.json({
        success: true,
        message: 'Archivo shapefile ZIP extraído y catalogado exitosamente',
        layerId: baseName
      });
    }

    return res.status(400).json({
      success: false,
      error: 'Por favor sube un archivo comprimido .zip que contenga los archivos del shapefile (.shp, .dbf, .prj, .shx)'
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve frontend in production if built
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🌲 GGF Geoportal Backend corriendo en http://localhost:${PORT}`);
  console.log(`📁 Directorio SHP base: ${SHP_DIR}`);
  console.log(`📥 Directorio de subidas: ${UPLOADS_DIR}`);
  console.log(`====================================================`);
});
