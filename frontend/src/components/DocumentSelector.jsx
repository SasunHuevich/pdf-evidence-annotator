import { useState, useEffect } from 'react';
import { fetchPdfList } from '../api';

export default function DocumentSelector({ onDocumentSelect, selectedDoc }) {
  const [documents, setDocuments] = useState([]);
  const [manualName, setManualName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchPdfList()
      .then(data => setDocuments([...new Set(data)]))
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = (e) => {
    const fileName = e.target.value;
    if (fileName) {
      setManualName(fileName);
      onDocumentSelect(fileName);
    }
  };

  const handleManualLoad = () => {
    if (manualName.trim()) onDocumentSelect(manualName.trim());
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <select
        onChange={handleSelect}
        value={manualName}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-indigo-500 focus:border-indigo-500 w-full sm:w-96"
      >
        <option value="">
          <i className="fas fa-file-pdf mr-1"></i>
          Выберите документ
        </option>
        {documents.map((doc, idx) => (
          <option key={idx} value={doc}>
            <i className="fas fa-file-pdf mr-1"></i>
            {doc}
          </option>
        ))}
      </select>
      <div className="flex gap-1 w-full sm:w-auto">
        <input
          type="text"
          placeholder="Или введите имя файла"
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-0"
        />
        <button
          onClick={handleManualLoad}
          className="bg-gray-800 hover:bg-gray-900 text-white px-3 py-1.5 rounded-lg text-sm whitespace-nowrap"
        >
          <i className="fas fa-upload mr-1"></i>
          Загрузить
        </button>
      </div>
      {loading && (
        <span className="text-xs text-gray-400">
          <i className="fas fa-spinner fa-spin mr-1"></i>
          Загрузка списка...
        </span>
      )}
    </div>
  );
}