import { useState, useEffect } from 'react';
import DocumentSelector from './components/DocumentSelector';
import QuestionList from './components/QuestionList';
import PdfViewer from './components/PdfViewer';
import { fetchDataset, fetchQdrantRegions, fetchPdfBlob, saveEvidenceRegions } from './api';
import { parseEvidencePages } from './utils';

function App() {
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [qdrantRegions, setQdrantRegions] = useState([]);
  const [userRegions, setUserRegions] = useState({});
  const [navigationMode, setNavigationMode] = useState('all');
  const [evidencePagesList, setEvidencePagesList] = useState([]);
  const [currentEvidenceIndex, setCurrentEvidenceIndex] = useState(0);

  // Загрузка данных
  useEffect(() => {
    if (!selectedDoc) return;
    const loadDataset = async () => {
      try {
        const data = await fetchDataset(selectedDoc);
        setQuestions(data);
      } catch (err) {
        console.error(err);
        alert('Ошибка загрузки датасета');
      }
    };
    loadDataset();
  }, [selectedDoc]);

  useEffect(() => {
    if (!selectedDoc) return;
    const loadPdfAndRegions = async () => {
      try {
        const blob = await fetchPdfBlob(selectedDoc);
        setPdfBlob(blob);
        
        const url = URL.createObjectURL(blob);
        const pdfDoc = await window.pdfjsLib.getDocument(url).promise;
        setTotalPages(pdfDoc.numPages);
        URL.revokeObjectURL(url);
        
        const regions = await fetchQdrantRegions(selectedDoc);
        const normalizedRegions = regions.map(reg => {
          let safeId = reg.region_id;
          if (typeof safeId === 'number' && safeId > 2147483647) {
            safeId = safeId % 2147483647;
          }
          return { ...reg, region_id: safeId, isReadOnly: true };
        });
        setQdrantRegions(normalizedRegions);
        
      } catch (err) {
        console.error(err);
        alert('Ошибка загрузки PDF или регионов');
      }
    };
    loadPdfAndRegions();
  }, [selectedDoc]);

  useEffect(() => {
    if (!selectedQuestionId) return;
    
    const question = questions.find(q => q.question_id === selectedQuestionId);
    if (question) {
      const pages = parseEvidencePages(question.evidence_pages);
      setEvidencePagesList(pages);
      setNavigationMode('evidence');
      setCurrentEvidenceIndex(0);
      setCurrentPage(pages[0] || 1);
    }
    
    setUserRegions({});
  }, [selectedQuestionId, questions]);

  useEffect(() => {
    setUserRegions({});
    setSelectedQuestionId(null);
    setCurrentPage(1);
  }, [selectedDoc]);

  const handlePageChange = (newPage) => {
    if (navigationMode === 'evidence') {
      const newIndex = evidencePagesList.indexOf(newPage);
      if (newIndex !== -1) {
        setCurrentEvidenceIndex(newIndex);
        setCurrentPage(newPage);
      }
    } else {
      setCurrentPage(newPage);
    }
  };

  const navigateEvidencePage = (direction) => {
    if (navigationMode !== 'evidence') return;
    
    const newIndex = currentEvidenceIndex + direction;
    if (newIndex >= 0 && newIndex < evidencePagesList.length) {
      setCurrentEvidenceIndex(newIndex);
      setCurrentPage(evidencePagesList[newIndex]);
    }
  };

  const toggleNavigationMode = () => {
    if (navigationMode === 'evidence') {
      setNavigationMode('all');
    } else {
      if (evidencePagesList.length > 0) {
        setNavigationMode('evidence');
        const currentIndex = evidencePagesList.indexOf(currentPage);
        if (currentIndex !== -1) {
          setCurrentEvidenceIndex(currentIndex);
        } else {
          setCurrentEvidenceIndex(0);
          setCurrentPage(evidencePagesList[0]);
        }
      }
    }
  };

  const handleUserRegionsChange = (pageZero, regionData, action) => {
    setUserRegions(prev => {
      const pageRegions = prev[pageZero] ? [...prev[pageZero]] : [];
      
      if (action === 'create') {
        const safeRegionId = Date.now() + Math.floor(Math.random() * 10000);
        const newRegion = { 
          ...regionData, 
          region_id: safeRegionId,
          type: regionData.type || 'paragraph',
          isUserCreated: true
        };
        pageRegions.push(newRegion);
      } 
      else if (action === 'update') {
        const index = pageRegions.findIndex(r => r.region_id === regionData.region_id);
        if (index !== -1) {
          pageRegions[index] = { ...regionData, isUserCreated: true };
        }
      } 
      else if (action === 'delete') {
        const filtered = pageRegions.filter(r => r.region_id !== regionData.region_id);
        return { ...prev, [pageZero]: filtered };
      }
      
      return { ...prev, [pageZero]: pageRegions };
    });
  };

  const getAllRegionsForDisplay = () => {
    const allRegions = qdrantRegions.map(reg => ({ ...reg, isUserCreated: false }));
    
    Object.keys(userRegions).forEach(page => {
      const pageNum = parseInt(page);
      userRegions[pageNum].forEach(region => {
        allRegions.push({ ...region, page: pageNum, isUserCreated: true });
      });
    });
    console.log('Все регионы для отображения:', allRegions.map(r => ({ id: r.region_id, isUserCreated: r.isUserCreated })));
    return allRegions;
  };

  const handleSaveToServer = async () => {
    if (!selectedQuestionId) {
      alert('Выберите вопрос');
      return;
    }
    
    const question = questions.find(q => q.question_id === selectedQuestionId);
    if (!question) {
      alert('Вопрос не найден');
      return;
    }
    
    const allRegionsToSave = [];
    Object.keys(userRegions).forEach(pageZero => {
      const pageNum = parseInt(pageZero);
      const regions = userRegions[pageNum] || [];
      regions.forEach(reg => {
        if (reg.bbox && Array.isArray(reg.bbox)) {
          let bboxFormatted;
          if (Array.isArray(reg.bbox[0])) {
            bboxFormatted = [reg.bbox[0].map(coord => Math.round(coord))];
          } else {
            bboxFormatted = [reg.bbox.map(coord => Math.round(coord))];
          }
          
          allRegionsToSave.push({
            region_id: reg.region_id,
            page: pageNum,
            bbox: bboxFormatted,
            type: reg.type || 'paragraph'
          });
        }
      });
    });
    
    if (allRegionsToSave.length === 0) {
      alert('Нет пользовательских регионов для сохранения');
      return;
    }
    
    try {
      const result = await saveEvidenceRegions(selectedQuestionId, allRegionsToSave);
      console.log('Результат сохранения:', result);
      alert(`Сохранено ${allRegionsToSave.length} пользовательских регионов`);
    } catch (err) {
      alert('Ошибка сохранения: ' + err.message);
      console.error(err);
    }
  };

  const selectedQuestion = questions.find(q => q.question_id === selectedQuestionId);
  const totalUserRegionsCount = Object.values(userRegions).flat().length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="px-3 py-2 sm:px-4 lg:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <h1 className="text-lg font-bold text-gray-900 whitespace-nowrap">
                <i className="fas fa-file-alt mr-2 text-indigo-600"></i>
                Evidence Разметка
              </h1>
              <div className="w-full sm:w-auto">
                <DocumentSelector onDocumentSelect={setSelectedDoc} selectedDoc={selectedDoc} />
              </div>
            </div>
            
            {selectedQuestionId && (
              <button
                onClick={handleSaveToServer}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                <i className="fas fa-save mr-1"></i>
                Сохранить мои регионы ({totalUserRegionsCount})
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-1 sm:px-2 lg:px-1 py-4">
        <div className="flex flex-col lg:flex-row gap-2">
          <aside className="lg:w-80 xl:w-96 flex-shrink-0">
            <div className="sticky top-20 space-y-2">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-2 border-b border-gray-200 bg-gray-50">
                  <h2 className="font-semibold text-gray-800 text-sm">
                    <i className="fas fa-question-circle mr-1 text-indigo-600"></i>
                    Вопросы по документу
                  </h2>
                  <p className="text-xs text-gray-500">
                    {questions.length ? `${questions.length} вопросов` : 'Загрузите документ'}
                  </p>
                </div>
                <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
                  <QuestionList
                    questions={questions}
                    selectedQuestionId={selectedQuestionId}
                    onSelectQuestion={setSelectedQuestionId}
                  />
                </div>
              </div>

              {selectedQuestion && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 mt-4">
                  <h3 className="font-semibold text-gray-800 text-sm mb-2">
                    <i className="fas fa-info-circle mr-1 text-blue-600"></i>
                    О вопросе
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-gray-500">Вопрос:</span>
                      <p className="mt-0.5 text-gray-800 text-xs">{selectedQuestion.question}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Ответ:</span>
                      <p className="mt-0.5 text-gray-800 text-xs">{selectedQuestion.answer}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">
                        <i className="fas fa-file mr-1"></i>
                        Evidence страницы:
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {evidencePagesList.map(pageNum => (
                          <button
                            key={pageNum}
                            onClick={() => {
                              setCurrentPage(pageNum);
                              if (navigationMode === 'evidence') {
                                const idx = evidencePagesList.indexOf(pageNum);
                                setCurrentEvidenceIndex(idx);
                              }
                            }}
                            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                              currentPage === pageNum
                                ? 'bg-indigo-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {pageNum}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="pt-1 border-t border-gray-100">
                      <span className="text-gray-500">
                        <i className="fas fa-draw-polygon mr-1"></i>
                        Мои регионы (всего):
                      </span>
                      <p className="mt-0.5 font-semibold text-xs">{totalUserRegionsCount}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        <i className="fas fa-check-circle mr-1 text-green-500"></i>
                        Сохраняются со всех страниц
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>

          <main className="flex-1 min-w-0">
            {selectedDoc && selectedQuestionId && pdfBlob && totalPages > 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <PdfViewer
                  pdfBlob={pdfBlob}
                  qdrantRegions={getAllRegionsForDisplay()}
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                  onRegionsChange={handleUserRegionsChange}
                  selectedQuestionId={selectedQuestionId}
                  navigationMode={navigationMode}
                  evidencePagesList={evidencePagesList}
                  currentEvidenceIndex={currentEvidenceIndex}
                  onNavigateEvidence={navigateEvidencePage}
                  onToggleMode={toggleNavigationMode}
                />
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <i className="fas fa-folder-open text-gray-400 text-4xl mb-2 block"></i>
                <p className="text-gray-500 text-sm">Выберите документ и вопрос для начала разметки</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export default App;