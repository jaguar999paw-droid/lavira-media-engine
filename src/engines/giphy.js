// engines/giphy.js — GIPHY search + fetch engine
const axios = require('axios');
const path  = require('path');
const fs    = require('fs');
const { v4: uuid } = require('uuid');
const cfg   = require('../config');

// Search GIPHY for safari-relevant GIFs
async function searchGiphy(query, limit = 6, offset = 0) {
  if(!cfg.GIPHY_KEY) {
    // Return placeholder data when no key configured
    return { results: [], message: 'GIPHY_API_KEY not configured in .env' };
  }
  const url = `https://api.giphy.com/v1/gifs/search?api_key=${cfg.GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&rating=g&lang=en`;
  const { data } = await axios.get(url);
  return {
    results: data.data.map(g=>({
      id: g.id,
      title: g.title,
      url: g.images.original.url,
      preview: g.images.fixed_width.url,
      mp4: g.images.original.mp4,
      width: g.images.original.width,
      height: g.images.original.height,
    })),
    pagination: data.pagination ? { total: data.pagination.total_count, count: data.pagination.count, offset: data.pagination.offset } : { offset, count: limit }
  };
}

// Download a GIF/MP4 from GIPHY to local outputs
async function fetchGiphy(giphyId, format='mp4') {
  if(!cfg.GIPHY_KEY) throw new Error('GIPHY_API_KEY not set');
  let src;
  try {
    const { data } = await axios.get(`https://api.giphy.com/v1/gifs/${giphyId}?api_key=${cfg.GIPHY_KEY}`);
    src = format==='mp4' ? data.data.images.original.mp4 : data.data.images.original.url;
  } catch(e) {
    // Fallback: search safari wildlife and use first result
    const { data: sd } = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${cfg.GIPHY_KEY}&q=safari+wildlife+africa&limit=1&rating=g`);
    if (!sd.data || !sd.data.length) throw new Error('No GIPHY results found');
    src = format==='mp4' ? sd.data[0].images.original.mp4 : sd.data[0].images.original.url;
  }
  const ext = format==='mp4' ? '.mp4' : '.gif';
  const outFile = path.join(cfg.OUTPUTS_DIR, `lavira_giphy_${uuid().slice(0,8)}${ext}`);
  const writer = fs.createWriteStream(outFile);
  const response = await axios({ url:src, method:'GET', responseType:'stream' });
  response.data.pipe(writer);
  return new Promise((res,rej)=>{ writer.on('finish',()=>res({ file:outFile, filename:path.basename(outFile) })); writer.on('error',rej); });
}

// Suggest safari-relevant search queries
function suggestQueries(destination) {
  const base = ['african safari', 'wildlife africa', 'kenya savanna', 'elephants africa', 'lions africa'];
  const destMap = {
    'Masai Mara': ['masai mara', 'wildebeest migration', 'mara river crossing'],
    'Amboseli':   ['amboseli elephants', 'mount kilimanjaro', 'kenya elephants'],
    'Samburu':    ['samburu wildlife', 'gerenuks africa', 'reticulated giraffe'],
  };
  return [...(destMap[destination]||[]), ...base].slice(0,5);
}

module.exports = { searchGiphy, fetchGiphy, suggestQueries };
