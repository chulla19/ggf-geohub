import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readShapefileToGeoJSON, createShapefileZip, recordsToCSV } from '../server/utils/shpConverter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const SHP_DIR = path.join(ROOT, 'SHP');
const PUBLIC_DATA_DIR = path.join(ROOT, 'client', 'public', 'data');

const GEOJSON_DIR = path.join(PUBLIC_DATA_DIR, 'geojson');
const RECORDS_DIR = path.join(PUBLIC_DATA_DIR, 'records');
const DOWNLOADS_DIR = path.join(PUBLIC_DATA_DIR, 'downloads');

[PUBLIC_DATA_DIR, GEOJSON_DIR, RECORDS_DIR, DOWNLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const LAYER_CONFIG = {
  'Conseciones_unidos': {
    name: 'Concesiones GGF',
    project: 'Concesiones GGF',
    category: 'Concesiones',
    description: 'Delimitación oficial de 15 concesiones forestales adjudicadas y asociadas a Green Gold Forestry.',
    color: '#F97316',
    tags: ['Concesiones GGF', 'Forestal', 'Carbono', 'Loreto 1 & 2']
  },
  'Proyecto_GGL1': {
    name: 'Proyecto GGL1',
    project: 'Proyecto GGL1',
    category: 'Límites & Cobertura',
    description: 'Área del Proyecto GGL1 y cobertura vegetal con zonificación de bosque alto y fisiografía.',
    color: '#EAB308',
    tags: ['Proyecto GGL1', 'Cobertura Vegetal', 'Fisiografía', 'Loreto 1']
  },
  'Area_Proyecto_Oct2022': {
    name: 'Proyecto GGL1',
    project: 'Proyecto GGL1',
    category: 'Límites & Cobertura',
    description: 'Área del Proyecto GGL1 y cobertura vegetal (Línea base Oct 2022) con zonificación de bosque alto y fisiografía.',
    color: '#EAB308',
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
    color: '#EF4444',
    tags: ['Campamentos GGF', 'Puntos', 'Operaciones', 'Logística']
  }
};

async function exportAll() {
  console.log('🌲 Exporting static geospatial assets for GGF GeoHub...');
  const layersList = [];

  const shpFiles = fs.readdirSync(SHP_DIR).filter(f => f.toLowerCase().endsWith('.shp'));

  for (const shpFile of shpFiles) {
    const id = path.parse(shpFile).name;
    const config = LAYER_CONFIG[id] || {
      name: id.replace(/_/g, ' '),
      project: 'Green Gold Forestry',
      category: 'Capas Espaciales',
      description: `Capa vectorial (${id.replace(/_/g, ' ')})`,
      color: '#10b981',
      tags: ['GGF', 'Cartografía', 'Vectorial']
    };

    const shpPath = path.join(SHP_DIR, `${id}.shp`);
    const dbfPath = path.join(SHP_DIR, `${id}.dbf`);

    console.log(`Processing layer: ${id}...`);
    const geojson = await readShapefileToGeoJSON(shpPath, dbfPath);

    // Save GeoJSON
    const geojsonOutPath = path.join(GEOJSON_DIR, `${id}.json`);
    fs.writeFileSync(geojsonOutPath, JSON.stringify(geojson));

    // Save GeoJSON for download
    const geojsonDownloadPath = path.join(DOWNLOADS_DIR, `${id}.geojson`);
    fs.writeFileSync(geojsonDownloadPath, JSON.stringify(geojson, null, 2));

    // Records
    const records = geojson.features.map((f, i) => ({
      __index: i + 1,
      ...f.properties
    }));
    const recordsOutPath = path.join(RECORDS_DIR, `${id}.json`);
    fs.writeFileSync(recordsOutPath, JSON.stringify({ success: true, count: records.length, records }));

    // CSV
    const csvContent = recordsToCSV(geojson.features.map(f => f.properties));
    const csvOutPath = path.join(DOWNLOADS_DIR, `${id}_atributos.csv`);
    fs.writeFileSync(csvOutPath, csvContent);

    // Shapefile ZIP
    const zipOutPath = path.join(DOWNLOADS_DIR, `${id}_SHP.zip`);
    const zipStream = fs.createWriteStream(zipOutPath);
    await new Promise((resolve, reject) => {
      zipStream.on('close', resolve);
      createShapefileZip(SHP_DIR, id, zipStream).catch(reject);
    });

    let totalHa = 0;
    const geometryTypes = new Set();
    geojson.features.forEach(f => {
      if (f.geometry && f.geometry.type) geometryTypes.add(f.geometry.type);
      const props = f.properties || {};
      const ha = props.HA || props.Ha || props.ha_1 || props.Superficie;
      if (typeof ha === 'number') totalHa += ha;
    });

    const relatedFiles = fs.readdirSync(SHP_DIR).filter(f => path.parse(f).name === id);
    let totalSize = 0;
    relatedFiles.forEach(f => {
      try { totalSize += fs.statSync(path.join(SHP_DIR, f)).size; } catch(e) {}
    });

    layersList.push({
      id,
      rawName: id,
      name: config.name,
      project: config.project,
      category: config.category,
      description: config.description,
      color: config.color,
      tags: config.tags,
      source: 'base',
      hasDbf: true,
      hasPrj: true,
      files: relatedFiles,
      sizeBytes: totalSize,
      crs: 'WGS 1984 UTM Zona 18S (EPSG: 32718)',
      recordsCount: geojson.features.length,
      geometryType: Array.from(geometryTypes).join(', ') || 'Desconocido',
      totalHectares: totalHa > 0 ? Number(totalHa.toFixed(2)) : null
    });
  }

  // Clean up orphaned static files
  const activeIds = new Set(layersList.map(l => l.id));
  [GEOJSON_DIR, RECORDS_DIR, DOWNLOADS_DIR].forEach(dir => {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const baseName = file.replace(/(_SHP\.zip|_atributos\.csv|\.json|\.geojson)$/i, '');
        if (!activeIds.has(baseName)) {
          try {
            fs.unlinkSync(path.join(dir, file));
            console.log(`🧹 Cleaned obsolete asset: ${file}`);
          } catch (e) {}
        }
      });
    }
  });

  // Save layers metadata
  fs.writeFileSync(
    path.join(PUBLIC_DATA_DIR, 'layers.json'),
    JSON.stringify({ success: true, count: layersList.length, layers: layersList }, null, 2)
  );

  console.log(`✅ Successfully exported ${layersList.length} layers to ${PUBLIC_DATA_DIR}!`);
}

exportAll().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});
