const INSTALL_FLAG = "__sjopsQrProductNamesInstalled";
const MAX_PATCH_ATTEMPTS = 100;

if (!window[INSTALL_FLAG]) {
  window[INSTALL_FLAG] = true;
  const originalOpen = window.open.bind(window);

  window.open = (...args) => {
    const popup = originalOpen(...args);
    if (popup) patchQrLabelPopupWhenReady(popup);
    return popup;
  };
}

function patchQrLabelPopupWhenReady(popup) {
  let attempts = 0;

  const check = () => {
    attempts += 1;
    if (popup.closed || attempts > MAX_PATCH_ATTEMPTS) return;

    try {
      const document = popup.document;
      const configNode = document.getElementById("qr-configs");
      const labelNodes = Array.from(document.querySelectorAll(".label"));

      if (!configNode || !labelNodes.length) {
        window.setTimeout(check, 100);
        return;
      }

      const configs = JSON.parse(configNode.textContent || "[]");
      addCaptionStyles(document);

      labelNodes.forEach((labelNode, index) => {
        const productName = String(labelNode.querySelector(".label-head strong")?.textContent || `Product ${index + 1}`).trim();
        const details = Array.from(labelNode.querySelectorAll(".label-details strong"))
          .map((element) => String(element.textContent || "").trim());
        const poId = details[0] || "PO";
        const poLineId = details[1] || String(index + 1);

        if (configs[index]) {
          configs[index] = {
            ...configs[index],
            filename: `${safeFilename(productName)}-${safeFilename(poId)}-${safeFilename(poLineId)}`,
            caption: productName,
            captionFontFamily: "Arial",
            captionFontSize: 28,
            captionFontColor: "#17211b"
          };
        }

        const qrImage = labelNode.querySelector("img.qr");
        if (qrImage && !labelNode.querySelector("[data-qr-product-caption]")) {
          const caption = document.createElement("div");
          caption.dataset.qrProductCaption = "true";
          caption.className = "qr-product-caption";
          caption.textContent = productName;
          qrImage.insertAdjacentElement("afterend", caption);
        }
      });

      configNode.textContent = JSON.stringify(configs);
    } catch (_error) {
      window.setTimeout(check, 100);
    }
  };

  check();
}

function addCaptionStyles(document) {
  if (document.getElementById("qr-product-caption-styles")) return;
  const style = document.createElement("style");
  style.id = "qr-product-caption-styles";
  style.textContent = `
    .qr-product-caption {
      font-size: 18px;
      font-weight: 800;
      line-height: 1.2;
      margin: -2px 0 8px;
      overflow-wrap: anywhere;
      text-align: center;
    }
  `;
  document.head.appendChild(style);
}

function safeFilename(value) {
  return String(value || "product")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "product";
}
