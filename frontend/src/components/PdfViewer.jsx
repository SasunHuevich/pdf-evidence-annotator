import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Stage, Layer, Rect, Transformer } from 'react-konva';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export default function PdfViewer({
  pdfBlob,
  qdrantRegions,
  currentPage,
  totalPages,
  onPageChange,
  onRegionsChange,
  selectedQuestionId,
  navigationMode,
  evidencePagesList,
  currentEvidenceIndex,
  onNavigateEvidence,
  onToggleMode
}) {
  const containerRef = useRef(null);
  const pdfCanvasRef = useRef(null);
  const stageRef = useRef(null);
  const transformerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageDimensions, setPageDimensions] = useState({ width: 0, height: 0 });
  const [drawMode, setDrawMode] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPointer, setStartPointer] = useState(null);
  const [currentPageRegions, setCurrentPageRegions] = useState([]);
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const currentPageZero = currentPage - 1;
  const QDRANT_MAX_COORD = 1000;

  useEffect(() => {
    if (!pdfBlob) return;
    const loadPdf = async () => {
      setLoading(true);
      try {
        const url = URL.createObjectURL(pdfBlob);
        const doc = await pdfjsLib.getDocument(url).promise;
        setPdfDoc(doc);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    loadPdf();
  }, [pdfBlob]);

  useEffect(() => {
    const regionsForPage = qdrantRegions.filter(r => r.page === currentPageZero);
    setCurrentPageRegions(regionsForPage);
    console.log('Регионы на странице:', regionsForPage.map(r => ({ 
      id: r.region_id, 
      type: typeof r.region_id,
      isUserCreated: r.isUserCreated 
    })));
  }, [qdrantRegions, currentPageZero]);

  const renderPdfPage = useCallback(async () => {
    if (!pdfDoc || !pdfCanvasRef.current) return;
    
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }
    
    try {
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1 });
      const { width, height } = viewport;
      setPageDimensions({ width, height });

      const canvas = pdfCanvasRef.current;
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, width, height);
      
      const renderTask = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = renderTask;
      await renderTask.promise;
      renderTaskRef.current = null;
      
    } catch (error) {
      if (error?.name !== 'RenderingCancelledException') {
        console.error('Render error:', error);
      }
    }
  }, [pdfDoc, currentPage]);

  useEffect(() => {
    renderPdfPage();
  }, [renderPdfPage]);

  const bboxToCanvasCoords = (bbox) => {
    if (!bbox || !pageDimensions.width || !pageDimensions.height) return null;
    
    let x1, y1, x2, y2;
    
    if (Array.isArray(bbox[0])) {
      [x1, y1, x2, y2] = bbox[0];
    } else {
      [x1, y1, x2, y2] = bbox;
    }
    
    const scaleX = pageDimensions.width / QDRANT_MAX_COORD;
    const scaleY = pageDimensions.height / QDRANT_MAX_COORD;
    
    return {
      left: x1 * scaleX,
      top: y1 * scaleY,
      width: (x2 - x1) * scaleX,
      height: (y2 - y1) * scaleY
    };
  };

  const canvasToBboxCoords = (left, top, width, height) => {
    const scaleX = QDRANT_MAX_COORD / pageDimensions.width;
    const scaleY = QDRANT_MAX_COORD / pageDimensions.height;
    
    const x1 = Math.round(left * scaleX);
    const y1 = Math.round(top * scaleY);
    const x2 = Math.round((left + width) * scaleX);
    const y2 = Math.round((top + height) * scaleY);
    
    return [[x1, y1, x2, y2]];
  };

  const updateRegionOnCanvas = useCallback((region, newLeft, newTop, newWidth, newHeight) => {
    if (!region.isUserCreated) return;
    
    const newBbox = canvasToBboxCoords(newLeft, newTop, newWidth, newHeight);
    
    const updatedRegion = {
      ...region,
      bbox: newBbox,
      type: region.type || 'paragraph',
      isUserCreated: true
    };
    
    onRegionsChange(currentPageZero, updatedRegion, 'update');
    return updatedRegion;
  }, [currentPageZero, onRegionsChange]);

  const handleDragStart = (e) => {
    const id = e.target.id();
    const region = currentPageRegions.find(r => String(r.region_id) === id);
    if (region && region.isUserCreated) {
      setSelectedRegionId(id);
      e.cancelBubble = true;
    }
  };

  const handleDragEnd = (e, region) => {
    if (!region.isUserCreated) return;
    
    const node = e.target;
    let newX = node.x();
    let newY = node.y();
    
    newX = Math.max(0, Math.min(newX, pageDimensions.width - node.width()));
    newY = Math.max(0, Math.min(newY, pageDimensions.height - node.height()));
    
    if (newX !== node.x() || newY !== node.y()) {
      node.position({ x: newX, y: newY });
    }
    
    updateRegionOnCanvas(region, newX, newY, node.width(), node.height());
  };

  const handleTransformEnd = (e, region) => {
    if (!region.isUserCreated) return;
    
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    
    let newWidth = Math.max(20, node.width() * scaleX);
    let newHeight = Math.max(20, node.height() * scaleY);
    
    node.width(newWidth);
    node.height(newHeight);
    node.scaleX(1);
    node.scaleY(1);
    
    let newX = Math.max(0, Math.min(node.x(), pageDimensions.width - newWidth));
    let newY = Math.max(0, Math.min(node.y(), pageDimensions.height - newHeight));
    
    if (newX !== node.x() || newY !== node.y()) {
      node.position({ x: newX, y: newY });
    }
    
    updateRegionOnCanvas(region, newX, newY, newWidth, newHeight);
  };

  const handleSelect = (id, region) => {
    if (region && !region.isUserCreated) return;
    
    setSelectedRegionId(id);
    if (transformerRef.current && stageRef.current) {
      const node = stageRef.current.findOne(`#${id}`);
      if (node) {
        transformerRef.current.nodes([node]);
        transformerRef.current.getLayer().batchDraw();
      }
    }
  };

  const handleMouseDown = (e) => {
    if (!drawMode) return;
    
    if (e.target === e.target.getStage()) {
      setSelectedRegionId(null);
      if (transformerRef.current) {
        transformerRef.current.nodes([]);
      }
    }
    
    const pos = stageRef.current?.getPointerPosition();
    if (!pos) return;

    const clickedOnRegion = currentPageRegions.some(region => {
      const coords = bboxToCanvasCoords(region.bbox);
      if (!coords) return false;
      return pos.x >= coords.left && pos.x <= coords.left + coords.width &&
             pos.y >= coords.top && pos.y <= coords.top + coords.height;
    });
    
    if (!clickedOnRegion) {
      setIsDrawing(true);
      setStartPointer({ x: pos.x, y: pos.y });
    }
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || !drawMode || !startPointer) return;
    
    const pos = stageRef.current?.getPointerPosition();
    if (!pos) return;
    
    setMousePos(pos);
    stageRef.current?.batchDraw();
  };

  const handleMouseUp = (e) => {
    if (!isDrawing || !drawMode) {
      setIsDrawing(false);
      setStartPointer(null);
      return;
    }
    
    setIsDrawing(false);
    
    const pos = stageRef.current?.getPointerPosition();
    if (!pos || !startPointer) {
      setStartPointer(null);
      return;
    }
    
    const width = Math.abs(pos.x - startPointer.x);
    const height = Math.abs(pos.y - startPointer.y);
    const x = Math.min(startPointer.x, pos.x);
    const y = Math.min(startPointer.y, pos.y);
    
    if (width > 5 && height > 5) {
      const newBbox = canvasToBboxCoords(x, y, width, height);
      
      const tempId = Date.now();
      
      const newRegion = {
        region_id: tempId,
        page: currentPageZero,
        bbox: newBbox,
        type: 'paragraph',
        isUserCreated: true
      };
      
      console.log('Создаем регион с ID:', tempId);
      onRegionsChange(currentPageZero, newRegion, 'create');
    }
    
    setStartPointer(null);
  };

  const deleteSelectedRegion = () => {
    if (selectedRegionId) {
      // Ищем регион по ID (сравниваем как строки)
      const region = currentPageRegions.find(r => String(r.region_id) === String(selectedRegionId));
      console.log('Попытка удалить регион:', { 
        selectedRegionId, 
        foundRegion: region,
        isUserCreated: region?.isUserCreated 
      });
      
      if (region && region.isUserCreated === true) {
        console.log('Удаляем пользовательский регион:', region.region_id);
        onRegionsChange(currentPageZero, { region_id: region.region_id }, 'delete');
        setSelectedRegionId(null);
        if (transformerRef.current) {
          transformerRef.current.nodes([]);
        }
      } else {
        alert('Нельзя удалить регион из Qdrant');
      }
    }
  };

  const addDefaultRectangle = () => {
    const width = 150;
    const height = 80;
    const x = (pageDimensions.width - width) / 2;
    const y = (pageDimensions.height - height) / 2;
    
    const newBbox = canvasToBboxCoords(x, y, width, height);
    
    const tempId = Date.now();
    
    const newRegion = {
      region_id: tempId,
      page: currentPageZero,
      bbox: newBbox,
      type: 'paragraph',
      isUserCreated: true
    };
    
    console.log('Создаем регион (кнопка) с ID:', tempId);
    onRegionsChange(currentPageZero, newRegion, 'create');
  };

  const goPrev = () => {
    if (navigationMode === 'evidence') {
      onNavigateEvidence(-1);
    } else {
      if (currentPage > 1) onPageChange(currentPage - 1);
    }
    setSelectedRegionId(null);
  };
  
  const goNext = () => {
    if (navigationMode === 'evidence') {
      onNavigateEvidence(1);
    } else {
      if (currentPage < totalPages) onPageChange(currentPage + 1);
    }
    setSelectedRegionId(null);
  };

  if (loading) return <div className="text-center py-10">Загрузка PDF...</div>;
  if (!pdfDoc) return <div className="text-center py-10">Нет PDF</div>;

  const isEvidencePage = evidencePagesList.includes(currentPage);
  const currentEvidencePosition = currentEvidenceIndex + 1;
  const totalEvidencePages = evidencePagesList.length;

  const drawingRect = isDrawing && startPointer && mousePos ? {
    x: Math.min(startPointer.x, mousePos.x),
    y: Math.min(startPointer.y, mousePos.y),
    width: Math.abs(mousePos.x - startPointer.x),
    height: Math.abs(mousePos.y - startPointer.y)
  } : null;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-50 border-b border-gray-200">
        <button
          onClick={() => setDrawMode(!drawMode)}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            drawMode
              ? 'bg-green-600 hover:bg-green-700 text-white shadow-sm'
              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          <i className="fas fa-paint-brush text-sm"></i>
          {drawMode ? ' Рисование вкл' : ' Режим рисования'}
        </button>
        <button
          onClick={addDefaultRectangle}
          className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm"
        >
          <i className="fas fa-plus text-sm"></i>
          Добавить регион
        </button>
        <button
          onClick={deleteSelectedRegion}
          className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm"
        >
          <i className="fas fa-trash-alt text-sm"></i>
          Удалить выбранный
        </button>
        
        <div className="h-6 w-px bg-gray-300"></div>
        
        <button
          onClick={onToggleMode}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            navigationMode === 'evidence'
              ? 'bg-amber-600 hover:bg-amber-700 text-white'
              : 'bg-gray-600 hover:bg-gray-700 text-white'
          }`}
        >
          <i className={`${navigationMode === 'evidence' ? 'fas fa-lock' : 'fas fa-globe'} text-sm`}></i>
          {navigationMode === 'evidence' ? ' Только evidence' : ' Все страницы'}
        </button>
        
        <div className="flex-1"></div>
        
        <div className="flex items-center gap-2 text-sm bg-white px-3 py-1.5 rounded-lg border border-gray-200">
          <span className="font-medium">
            <i className="fas fa-file-alt mr-1 text-gray-500"></i>
            {navigationMode === 'evidence' ? 'Evidence:' : 'Страница:'}
          </span>
          <button
            onClick={goPrev}
            disabled={navigationMode === 'evidence' ? currentEvidenceIndex === 0 : currentPage === 1}
            className="text-gray-600 hover:text-gray-900 disabled:opacity-40"
          >
            <i className="fas fa-chevron-left"></i>
          </button>
          <span className="font-mono">
            {navigationMode === 'evidence' 
              ? `${currentEvidencePosition} / ${totalEvidencePages}`
              : `${currentPage} / ${totalPages}`}
          </span>
          <button
            onClick={goNext}
            disabled={navigationMode === 'evidence' 
              ? currentEvidenceIndex === totalEvidencePages - 1 
              : currentPage === totalPages}
            className="text-gray-600 hover:text-gray-900 disabled:opacity-40"
          >
            <i className="fas fa-chevron-right"></i>
          </button>
        </div>
      </div>

      {navigationMode === 'evidence' && !isEvidencePage && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-center text-sm text-yellow-700">
          <i className="fas fa-exclamation-triangle mr-1"></i>
          Текущая страница не входит в evidence для этого вопроса. 
          Используйте кнопки навигации для перехода по evidence-страницам.
        </div>
      )}

      <div
        ref={containerRef}
        className="relative overflow-auto bg-gray-100 flex justify-center p-4"
        style={{ minHeight: '60vh' }}
      >
        <div className="relative shadow-lg bg-white">
          <canvas
            ref={pdfCanvasRef}
            style={{
              display: 'block',
              margin: '0 auto',
              position: 'relative',
              zIndex: 1,
              pointerEvents: 'none'
            }}
          />
          
          {pageDimensions.width > 0 && (
            <Stage
              ref={stageRef}
              width={pageDimensions.width}
              height={pageDimensions.height}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              draggable={false}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                zIndex: 2
              }}
            >
              <Layer>
                {currentPageRegions.map((region) => {
                  const coords = bboxToCanvasCoords(region.bbox);
                  
                  if (!coords) return null;
                  
                  const { left, top, width, height } = coords;
                  const isSelected = String(selectedRegionId) === String(region.region_id);
                  const isReadOnly = !region.isUserCreated;
                  
                  if (isNaN(left) || isNaN(top) || isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
                    return null;
                  }
                  
                  return (
                    <Rect
                      key={region.region_id}
                      id={String(region.region_id)}
                      x={left}
                      y={top}
                      width={width}
                      height={height}
                      stroke={isReadOnly ? '#3b82f6' : (isSelected ? '#3b82f6' : '#f97316')}
                      strokeWidth={2}
                      fill={isReadOnly ? 'rgba(59, 130, 246, 0.1)' : 'rgba(249, 115, 22, 0.2)'}
                      draggable={!isReadOnly && !drawMode}
                      onClick={() => handleSelect(region.region_id, region)}
                      onTap={() => handleSelect(region.region_id, region)}
                      onDragStart={handleDragStart}
                      onDragEnd={(e) => handleDragEnd(e, region)}
                      onTransformEnd={(e) => handleTransformEnd(e, region)}
                    />
                  );
                })}
                
                {drawingRect && drawingRect.width > 0 && drawingRect.height > 0 && (
                  <Rect
                    x={drawingRect.x}
                    y={drawingRect.y}
                    width={drawingRect.width}
                    height={drawingRect.height}
                    stroke="red"
                    strokeWidth={2}
                    fill="rgba(255, 0, 0, 0.2)"
                    listening={false}
                  />
                )}
                
                <Transformer
                  ref={transformerRef}
                  boundBoxFunc={(oldBox, newBox) => {
                    if (newBox.width < 20 || newBox.height < 20) return oldBox;
                    return newBox;
                  }}
                />
              </Layer>
            </Stage>
          )}
        </div>
      </div>

      <div className="p-3 text-center text-xs text-gray-400 border-t border-gray-100">
        <div className="flex justify-center gap-4 mb-1">
          <span className="inline-flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-500 opacity-20 rounded"></div>
            <i className="fas fa-square text-blue-500 text-xs"></i>
            <span>Синие - регионы из Qdrant (только для просмотра)</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <div className="w-3 h-3 bg-orange-500 opacity-20 rounded"></div>
            <i className="fas fa-square text-orange-500 text-xs"></i>
            <span>Оранжевые - мои регионы (можно редактировать)</span>
          </span>
        </div>
        <i className="fas fa-mouse-pointer mr-1"></i>
        Выделите оранжевый регион мышью, чтобы перемещать или менять размер. 
        {drawMode && <><i className="fas fa-draw-polygon ml-1 mr-1"></i> Режим рисования: зажмите левую кнопку и выделите область.</>}
        {!drawMode && <><i className="fas fa-arrows-alt ml-1 mr-1"></i> Кликните на оранжевый регион для выделения, затем перетаскивайте за углы для изменения размера.</>}
      </div>
    </div>
  );
}