import fs from 'fs';
import path from 'path';
import proj4 from 'proj4';
import * as shapefile from 'shapefile';
import archiver from 'archiver';

const utm18s = "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs";
const wgs84 = "+proj=longlat +datum=WGS84 +no_defs";

// Transform coordinate from UTM 18S to WGS84 [lon, lat]
function transformCoord(coord) {
  if (!Array.isArray(coord) || coord.length < 2) return coord;
  const [x, y] = coord;
  // If coordinates already look like degrees (between -180 and 180 / -90 and 90)
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
    return [x, y];
  }
  try {
    const [lon, lat] = proj4(utm18s, wgs84, [x, y]);
    return [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
  } catch (err) {
    return [x, y];
  }
}

// Recursively transform geometry coordinates
function transformGeometry(geom) {
  if (!geom || !geom.coordinates) return geom;
  const transformArray = (coords, depth) => {
    if (depth === 1) {
      return transformCoord(coords);
    }
    return coords.map(c => transformArray(c, depth - 1));
  };

  const geomType = geom.type;
  let depth = 1;
  if (geomType === 'Point') depth = 1;
  else if (geomType === 'MultiPoint' || geomType === 'LineString') depth = 2;
  else if (geomType === 'MultiLineString' || geomType === 'Polygon') depth = 3;
  else if (geomType === 'MultiPolygon') depth = 4;

  return {
    ...geom,
    coordinates: transformArray(geom.coordinates, depth)
  };
}

// Convert DBF records to CSV string
export function recordsToCSV(records) {
  if (!records || records.length === 0) return '';
  const headers = Object.keys(records[0]);
  const escapeCSV = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = [headers.join(',')];
  for (const rec of records) {
    rows.push(headers.map(h => escapeCSV(rec[h])).join(','));
  }
  // Include UTF-8 BOM for Excel compatibility
  return '\uFEFF' + rows.join('\r\n');
}

// Parse a Shapefile into a GeoJSON FeatureCollection
export async function readShapefileToGeoJSON(shpPath, dbfPath) {
  let encoding = 'utf-8';
  try {
    const cpgPath = shpPath.replace(/\.shp$/i, '.cpg');
    if (fs.existsSync(cpgPath)) {
      const cpgContent = fs.readFileSync(cpgPath, 'utf8').trim().toLowerCase();
      if (cpgContent.includes('utf-8') || cpgContent.includes('utf8')) {
        encoding = 'utf-8';
      } else if (cpgContent.includes('latin1') || cpgContent.includes('1252') || cpgContent.includes('iso')) {
        encoding = 'latin1';
      }
    }
  } catch (e) {}

  const source = await shapefile.open(shpPath, dbfPath, { encoding });
  const features = [];
  
  let result;
  while (!(result = await source.read()).done) {
    const feat = result.value;
    if (feat) {
      const transformedGeom = transformGeometry(feat.geometry);
      features.push({
        type: 'Feature',
        properties: feat.properties,
        geometry: transformedGeom
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features
  };
}

// Create a ZIP stream of all shapefile related files
export function createShapefileZip(baseDir, baseName, res) {
  const archive = archiver('zip', { zlib: { level: 9 } });
  
  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(res);

  // Complete Shapefile package with freshly generated ArcGIS Pro spatial index and metadata
  const extensions = ['.shp', '.shx', '.dbf', '.prj', '.cpg', '.sbn', '.sbx', '.shp.xml'];
  for (const ext of extensions) {
    const filePath = path.join(baseDir, `${baseName}${ext}`);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: `${baseName}${ext}` });
    }
  }

  return archive.finalize();
}
