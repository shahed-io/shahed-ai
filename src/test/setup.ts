import "@testing-library/jest-dom";

// Configurable matchMedia driven by window.innerWidth so responsive
// tests can simulate different screen sizes by calling setViewport().
function makeMatchMedia(query: string): MediaQueryList {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const evaluate = () => {
    const m = query.match(/\(max-width:\s*(\d+)px\)/);
    if (m) return window.innerWidth <= parseInt(m[1], 10);
    const mn = query.match(/\(min-width:\s*(\d+)px\)/);
    if (mn) return window.innerWidth >= parseInt(mn[1], 10);
    return false;
  };
  const mql: any = {
    media: query,
    get matches() {
      return evaluate();
    },
    onchange: null,
    addListener: (cb: any) => listeners.add(cb),
    removeListener: (cb: any) => listeners.delete(cb),
    addEventListener: (_: string, cb: any) => listeners.add(cb),
    removeEventListener: (_: string, cb: any) => listeners.delete(cb),
    dispatchEvent: (e: any) => {
      listeners.forEach((cb) => cb(e));
      return true;
    },
    _notify: () => {
      listeners.forEach((cb) =>
        cb({ matches: evaluate(), media: query } as MediaQueryListEvent)
      );
    },
  };
  registry.push(mql);
  return mql as MediaQueryList;
}

const registry: any[] = [];

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: makeMatchMedia,
});

export function setViewport(width: number, height = 800) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: height });
  registry.forEach((m) => m._notify && m._notify());
  window.dispatchEvent(new Event("resize"));
}

// Polyfills used by Radix primitives in jsdom
if (typeof (window as any).ResizeObserver === "undefined") {
  (window as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!(Element.prototype as any).hasPointerCapture) {
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).setPointerCapture = () => {};
  (Element.prototype as any).releasePointerCapture = () => {};
}
if (!(Element.prototype as any).scrollIntoView) {
  (Element.prototype as any).scrollIntoView = () => {};
}
