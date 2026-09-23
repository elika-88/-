import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
vi.mock('server-only', () => ({}));
import { extractCourseFile } from '@/lib/server/course-extraction';

describe('real document parsers', () => {
  it('extracts PPTX slides in numeric order and decodes XML entities', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide10.xml', '<a:p><a:r><a:t>Tenth concept</a:t></a:r></a:p>');
    zip.file('ppt/slides/slide2.xml', '<a:p><a:r><a:t>Second &amp; important</a:t></a:r></a:p>');
    const content = await zip.generateAsync({ type: 'arraybuffer' });
    const result = await extractCourseFile(new File([content], 'Lecture.pptx'));
    expect(result.text).toBe('Slide 1\nSecond & important\n\nSlide 2\nTenth concept');
  });

  it('extracts paragraphs from DOCX using the real parser', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Retrieval practice helps learning.</w:t></w:r></w:p></w:body></w:document>');
    const content = await zip.generateAsync({ type: 'arraybuffer' });
    expect((await extractCourseFile(new File([content], 'Lecture.docx'))).text).toBe('Retrieval practice helps learning.');
  });

  it('extracts text from an actual PDF document', async () => {
    const stream = 'BT /F1 12 Tf 50 700 Td (Spacing distributes study over time.) Tj ET';
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ];
    let pdf = '%PDF-1.4\n'; const offsets: number[] = [];
    objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = pdf.length;
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    expect((await extractCourseFile(new File([pdf], 'Lecture.pdf'))).text).toContain('Spacing distributes study over time.');
  });

  it.each(['pdf', 'pptx', 'docx'])('reports corrupt %s files as extraction failures', async extension => {
    await expect(extractCourseFile(new File(['not a document'], `broken.${extension}`))).rejects.toMatchObject({ status: 422 });
  });
});
