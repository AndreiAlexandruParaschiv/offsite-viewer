import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { parseCsvForSites } from '../utils/csvUpload';

interface CsvWarning {
  message: string;
  rows: { siteId: string; baseUrl: string }[];
}

interface CsvImportButtonProps {
  siteIdMap: Map<string, string>;
  onChange: (next: string[] | null) => void;
  onWarning: (warning: CsvWarning) => void;
}

export function CsvImportButton({ siteIdMap, onChange, onWarning }: CsvImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== 'string') return;

      const { matched, unmatched, error } = parseCsvForSites(text, siteIdMap);

      if (error) {
        onWarning({ message: error, rows: [] });
        return;
      }

      onChange(matched.length > 0 ? matched : []);

      if (unmatched.length > 0) {
        onWarning({
          message: `${unmatched.length} site${unmatched.length === 1 ? '' : 's'} from the CSV not found in the loaded dataset:`,
          rows: unmatched.map((siteId) => ({ siteId, baseUrl: '' })),
        });
      }

      if (inputRef.current) inputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        aria-hidden="true"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <button
        type="button"
        className="filter-bar__toggle"
        aria-label="Import site selection from CSV"
        onClick={() => inputRef.current?.click()}
        title="Upload a CSV with a 'Site ID' column to filter the dashboard to those sites"
      >
        <Upload size={12} aria-hidden="true" />
        {' '}CSV
      </button>
    </>
  );
}
