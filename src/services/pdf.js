// Génerateur PDF minimal sans dépendance externe (100% autonome).
// Produit un document A4 portrait utilisant les polices standard Helvetica.

const A4W = 595, A4H = 842;

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function nowStr() {
  return new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

class PDFDoc {
  constructor(title) {
    this.title = title || 'Rapport';
    this.pages = [[]]; // page 0 -> lignes de stream
  }

  _cur() { return this.pages[this.pages.length - 1]; }

  line(y, x, text, size, font) {
    this._cur().push(`BT /${font} ${size} Tf ${x} ${y} Td (${esc(text)}) Tj ET`);
  }

  addText(text, { x = 50, y, size = 10, bold = false } = {}) {
    const page = this._cur();
    const py = y !== undefined ? y : 800 - (page._y || 0);
    this.line(py, x, text, size, bold ? 'F2' : 'F1');
    if (page._y === undefined) page._y = size + 8;
    else page._y += size + 8;
    if (py < 60) { // nouveau page
      this.pages.push([]);
      this.pages[this.pages.length - 1]._y = 0;
    }
  }

  h1(text, y) { this.addText(text, { y, size: 15, bold: true }); }
  h2(text, y) { this.addText(text, { y, size: 12, bold: true }); }
  p(text, y) { this.addText(text, { y, size: 10 }); }
  hr(y) { this._cur().push(`1 g`); this._cur().push(`50 ${y} 495 0.8 re f`); }

  table(rows, opts = {}) {
    const colWidths = opts.widths || new Array(rows[0].length).fill(Math.floor(480 / rows[0].length));
    const x0 = 50;
    const header = opts.header !== false;
    let y = (opts.y !== undefined ? opts.y : 790);
    const rowH = opts.rowH || 18;

    const drawRow = (cells, bold, fill) => {
      let x = x0;
      if (fill) this._cur().push(`${fill} 0 0 rg`), this._cur().push(`${x0} ${y - 4} ${colWidths.reduce((a, b) => a + b, 0)} ${rowH - 2} re f`);
      cells.forEach((cell, i) => {
        const txt = String(cell);
        const seg = txt.length > Math.floor(colWidths[i] / 6) ? txt.slice(0, Math.floor(colWidths[i] / 6) - 2) + '…' : txt;
        this.line(y, x + 4, seg, 9, bold ? 'F2' : 'F1');
        x += colWidths[i];
      });
    };

    // Colonnes en mode paragraphe (lignes du haut)
    if (header) {
      drawRow(rows[0], true, 0.82);
      y -= rowH + 4;
    }
    rows.slice(header ? 1 : 0).forEach((r) => {
      y -= rowH;
      if (y < 60) { this.pages.push([]); y = 800; }
      drawRow(r, false, null);
    });
    return y;
  }

  // Sérialise le document en Buffer PDF
  render() {
    const pages = this.pages.map((p) => {
      const filtered = p.filter((l) => typeof l === 'string');
      return filtered;
    });
    const offsets = [];
    const chunks = [];
    chunks.push('%PDF-1.4\n');
    let n = 1;

    const obj = (body) => {
      offsets[n] = Buffer.byteLength(chunks.join(''));
      chunks.push(`${n} 0 obj\n${body}\nendobj\n`);
      n++;
    };

    const kids = pages.map((_, i) => 3 + i * 2);
    obj(`<< /Type /Catalog /Pages 2 0 R >>`);
    obj(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${pages.length} >>`);

    pages.forEach((pageContent, i) => {
      const contentId = 2 + i * 2 + 2; // children: 3 + i*2 (page), 4 + i*2 (contents)
      const pageId = 3 + i * 2;
      const stream = pageContent.join('\n');
      const streamBytes = Buffer.from(stream, 'latin1');
      obj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4W} ${A4H}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents ${contentId} 0 R >>`);
      obj(`<< /Length ${streamBytes.length} >>\nstream\n` + stream + `\nendstream`);
    });

    obj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
    obj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`);

    const xrefStart = Buffer.byteLength(chunks.join(''));
    const xref = [];
    xref.push('xref');
    xref.push(`0 ${n + 1}`);
    xref.push('0000000000 65535 f ');
    for (let i = 1; i <= n; i++) {
      xref.push(String(offsets[i]).padStart(10, '0') + ' 00000 n ');
    }
    chunks.push(xref.join('\n') + '\n');
    chunks.push(`trailer\n<< /Size ${n + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

    return Buffer.from(chunks.join(''), 'latin1');
  }
}

module.exports = { PDFDoc, A4W, A4H, nowStr };