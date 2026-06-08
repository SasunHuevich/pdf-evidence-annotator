const API_BASE = 'http://localhost:3000';

export async function fetchPdfList() {
  const response = await fetch(`${API_BASE}/pdf_list`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!response.ok) throw new Error('Failed to fetch pdf list');
  return response.json();
}

export async function fetchDataset(fileName) {
  const response = await fetch(`${API_BASE}/get_dataset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_name: fileName })
  });
  if (!response.ok) throw new Error('Failed to fetch dataset');
  return response.json();
}

export async function fetchQdrantRegions(fileName) {
  const response = await fetch(`${API_BASE}/qdrant_evidence_regions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_name: fileName })
  });
  if (!response.ok) throw new Error('Failed to fetch Qdrant regions');
  return response.json();
}

export async function fetchPdfBlob(fileName) {
  const response = await fetch(`${API_BASE}/get_pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_name: fileName })
  });
  if (!response.ok) throw new Error('Failed to fetch PDF');
  return response.blob();
}

export async function saveEvidenceRegions(questionId, evidenceRegions) {
  const formattedRegions = evidenceRegions.map(region => {
    let regionId = region.region_id;
    if (typeof regionId === 'number') {
      if (regionId > 2147483647) {
        regionId = regionId % 2147483647;
      }
      if (regionId < -2147483648) {
        regionId = -2147483648;
      }
    } else {
      regionId = Math.floor(Math.random() * 1000000);
    }
    
    let bboxFormatted;
    if (Array.isArray(region.bbox) && Array.isArray(region.bbox[0])) {
      bboxFormatted = [region.bbox[0].map(coord => Math.round(coord))];
    } else if (Array.isArray(region.bbox)) {
      bboxFormatted = [region.bbox.map(coord => Math.round(coord))];
    } else {
      bboxFormatted = [[0, 0, 0, 0]];
    }
    
    return {
      region_id: regionId,
      page: region.page + 1,
      bbox: bboxFormatted,
      type: 'text'
    };
  });
  
  const payload = {
    question_id: questionId,
    evidence_regions: formattedRegions
  };
  
  console.log('Отправляем данные:', JSON.stringify(payload, null, 2));
  
  const response = await fetch(`${API_BASE}/save_evidence_regions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  const responseText = await response.text();
  console.log('Ответ сервера:', responseText);
  
  if (!response.ok) {
    throw new Error(`Failed to save evidence regions: ${responseText}`);
  }
  
  try {
    return JSON.parse(responseText);
  } catch {
    return { status: 'success', message: responseText };
  }
}