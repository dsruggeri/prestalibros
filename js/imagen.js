// Prepara una foto de portada: la endereza (según la orientación de la cámara),
// la achica a un tamaño razonable y la convierte a JPEG liviano (~60-120 KB).

const MAX_W = 600;
const MAX_H = 900;
const CALIDAD = 0.82;

async function cargar(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Respaldo para navegadores sin createImageBitmap con opciones
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function prepararPortada(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Ese archivo no es una imagen.");
  const img = await cargar(file);
  const w = img.width, h = img.height;
  const k = Math.min(1, MAX_W / w, MAX_H / h);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close?.();
  const blob = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", CALIDAD));
  if (!blob) throw new Error("No se pudo procesar la imagen.");
  return blob;
}

export function blobToDataUrl(blob) {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => fail(r.error);
    r.readAsDataURL(blob);
  });
}
