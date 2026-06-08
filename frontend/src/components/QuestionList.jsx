import { parseEvidencePages } from '../utils';

export default function QuestionList({ questions, selectedQuestionId, onSelectQuestion }) {
  if (!questions.length) {
    return <div className="p-4 text-center text-gray-400 text-sm">
      <i className="fas fa-inbox mr-1"></i>
      Нет вопросов
    </div>;
  }

  return (
    <div className="divide-y divide-gray-100">
      {questions.map((q) => {
        const pagesZero = parseEvidencePages(q.evidence_pages);
        const pagesDisplay = pagesZero.join(', ');
        const isSelected = selectedQuestionId === q.question_id;
        return (
          <button
            key={q.question_id}
            onClick={() => onSelectQuestion(q.question_id)}
            className={`w-full text-left p-4 transition-colors ${
              isSelected
                ? 'bg-indigo-50 border-l-4 border-indigo-600'
                : 'hover:bg-gray-50 border-l-4 border-transparent'
            }`}
          >
            <div className="text-sm font-medium text-gray-900 line-clamp-2">
              {q.question}
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1">
                <i className="fas fa-file-alt text-gray-400"></i>
                {pagesDisplay || '—'}
              </span>
              <span className="inline-flex items-center gap-1">
                <i className="fas fa-id-card text-gray-400"></i>
                ID: {q.question_id}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}