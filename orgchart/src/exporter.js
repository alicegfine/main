// Export a rendered <svg> as a downloadable SVG file or a high-res PNG.
// PNG path serializes the SVG (which has no external refs) to a data URL, draws it
// onto a 2x canvas with a white background, and saves the result.

function serialize(svg) {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  const xml = new XMLSerializer().serializeToString(clone);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSvg(svg, filename = "org-chart.svg") {
  const blob = new Blob([serialize(svg)], { type: "image/svg+xml;charset=utf-8" });
  triggerDownload(blob, filename);
}

export function downloadPng(svg, filename = "org-chart.png", scale = 2) {
  return new Promise((resolve, reject) => {
    const w = Number(svg.getAttribute("width"));
    const h = Number(svg.getAttribute("height"));
    const data = serialize(svg);
    const svgBlob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(w * scale);
      canvas.height = Math.ceil(h * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("Couldn't render the PNG."));
        triggerDownload(blob, filename);
        resolve();
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't load the chart for export."));
    };
    img.src = url;
  });
}

// Copy PNG to clipboard (for paste-straight-into-slides). Falls back to download.
export async function copyPngToClipboard(svg, scale = 2) {
  const w = Number(svg.getAttribute("width"));
  const h = Number(svg.getAttribute("height"));
  const data = serialize(svg);
  const url = URL.createObjectURL(new Blob([data], { type: "image/svg+xml;charset=utf-8" }));
  const blob = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(w * scale);
      canvas.height = Math.ceil(h * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("render failed"))), "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("load failed")); };
    img.src = url;
  });
  if (!navigator.clipboard || !window.ClipboardItem) {
    throw new Error("Clipboard images aren't supported in this browser.");
  }
  await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
}
