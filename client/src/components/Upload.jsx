import { useRef, useState } from 'react';

export default function Upload({ onFiles, busy }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);

  const take = (list) => {
    const files = [...list].filter((f) => f.type.startsWith('image/'));
    if (files.length) onFiles(files);
  };

  return (
    <div
      className={`dropzone${over ? ' is-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
    >
      <div className="dropzone-icon" aria-hidden="true">⚡</div>
      <div>
        <strong>גררו לכאן תמונות של חשבונות חשמל</strong>
        <p className="muted">צילום מהטלפון או סריקה · אפשר כמה בבת אחת · JPG, PNG</p>
      </div>
      <button type="button" className="btn primary" onClick={() => input.current.click()} disabled={busy}>
        {busy ? 'מעלה…' : 'בחירת קבצים'}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => { take(e.target.files); e.target.value = ''; }}
      />
    </div>
  );
}
