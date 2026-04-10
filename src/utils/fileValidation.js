// XLSX/DOCX (ZIP container): PK\x03\x04
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
// XLS (OLE2 Compound Document): \xD0\xCF\x11\xE0
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];

export async function validateExcelMIME(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const bytes = new Uint8Array(e.target.result);
      if (bytes.length < 4) {
        resolve({ valid: false, format: null });
        return;
      }

      const matchesZip = ZIP_MAGIC.every((b, i) => bytes[i] === b);
      if (matchesZip) {
        resolve({ valid: true, format: "xlsx" });
        return;
      }

      const matchesOle2 = OLE2_MAGIC.every((b, i) => bytes[i] === b);
      if (matchesOle2) {
        resolve({ valid: true, format: "xls" });
        return;
      }

      resolve({ valid: false, format: null });
    };
    reader.onerror = () => resolve({ valid: false, format: null });
    reader.readAsArrayBuffer(file.slice(0, 4));
  });
}
