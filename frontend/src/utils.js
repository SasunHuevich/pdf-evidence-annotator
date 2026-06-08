export function parseEvidencePages(pagesStr) {
  try {
    const parsed = JSON.parse(pagesStr.replace(/'/g, '"'));
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

export function bboxToCanvas(bbox, scale, pageHeight) {
  let x1, y1, x2, y2;
  
  if (Array.isArray(bbox[0])) {
    [x1, y1, x2, y2] = bbox[0];
  } else {
    [x1, y1, x2, y2] = bbox;
  }
  
  return {
    left: x1, 
    top: y1, 
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  };
}

export function canvasToBbox(rect, scale, pageHeight) {
  const left = rect.left / scale;
  const top = rect.top / scale;
  const width = rect.width / scale;
  const height = rect.height / scale;
  
  return [[
    left,
    top,
    left + width,
    top + height
  ]];
}