/** Export an inline <svg> element to a PNG download. Never throws to the caller. */

const VAR_RE = /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*?))?\)/g;

/** Replace every var(--token) with its computed value, resolved against `scope`. */
function resolveVars(markup: string, scope: Element): string {
  const style = getComputedStyle(scope);
  const cache = new Map<string, string>();
  let out = markup;
  // Repeat: a resolved value can itself contain var().
  for (let pass = 0; pass < 4 && VAR_RE.test(out); pass++) {
    VAR_RE.lastIndex = 0;
    out = out.replace(VAR_RE, (_m, token: string, fallback?: string) => {
      // Values are substituted into XML attributes, so double quotes must go
      // (computed font stacks look like: "JetBrains Mono", ui-monospace, monospace).
      if (!cache.has(token))
        cache.set(token, style.getPropertyValue(token).trim().replace(/"/g, "'"));
      return cache.get(token) || (fallback ?? "").trim() || "transparent";
    });
  }
  return out;
}

export interface ExportPngOptions {
  filename?: string;
  scale?: number;
  background?: string;
}

export async function exportSvgToPng(
  svg: SVGSVGElement | null,
  { filename = "canvas.png", scale = 2, background }: ExportPngOptions = {},
): Promise<{ ok: boolean; error?: string }> {
  if (!svg || typeof window === "undefined") return { ok: false, error: "Nothing to export yet." };

  try {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const w = Math.max(1, Math.round(vb?.width || rect.width || 700));
    const h = Math.max(1, Math.round(vb?.height || rect.height || 420));

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(w));
    clone.setAttribute("height", String(h));

    const bg =
      background ?? (getComputedStyle(svg).getPropertyValue("--bg-canvas").trim() || "#ffffff");
    const markup = resolveVars(new XMLSerializer().serializeToString(clone), svg);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;

    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("render failed"));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, error: "Your browser blocked the image export." };
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return { ok: false, error: "Could not encode the PNG." };

    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 4000);
    return { ok: true };
  } catch {
    return { ok: false, error: "The PNG export failed in this browser." };
  }
}
