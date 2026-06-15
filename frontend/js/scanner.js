let cameraScanner;
let libraryLoadPromise;

const SCANNER_LIBRARY_URLS = [
  "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js",
  "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"
];

export function handleKeyboardScan(inputElement, onScanCallback) {
  let lastValue = "";
  const emitScan = () => {
    const value = inputElement.value.trim();
    if (!value || value === lastValue) return;
    lastValue = value;
    onScanCallback(value);
  };

  inputElement.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    emitScan();
  });
  inputElement.addEventListener("change", emitScan);
  inputElement.addEventListener("blur", emitScan);

  return emitScan;
}

export async function startCameraScanner(targetInputId, onScanCallback) {
  const target = document.getElementById(targetInputId);
  if (!target) throw new Error("Target scan input was not found.");
  await ensureScannerLibrary();
  await stopCameraScanner();
  const readerId = "cameraReader";
  cameraScanner = new window.Html5Qrcode(readerId);
  await cameraScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      target.value = decodedText;
      onScanCallback(decodedText);
    }
  );
}

export async function stopCameraScanner() {
  if (!cameraScanner) return;
  try {
    await cameraScanner.stop();
    await cameraScanner.clear();
  } finally {
    cameraScanner = null;
  }
}

async function ensureScannerLibrary() {
  if (window.Html5Qrcode) return;
  if (!libraryLoadPromise) {
    libraryLoadPromise = loadScannerLibrary();
  }
  await libraryLoadPromise;
}

async function loadScannerLibrary() {
  for (const url of SCANNER_LIBRARY_URLS) {
    try {
      await loadScript(url);
      if (window.Html5Qrcode) return;
    } catch (_error) {
      // Try the next CDN.
    }
  }
  throw new Error("Camera scanner library could not load. Check phone internet access and reload.");
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      script.remove();
      reject(new Error("Scanner library load timed out."));
    }, 7000);
    script.src = src;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error("Scanner library failed to load."));
    };
    document.head.appendChild(script);
  });
}
