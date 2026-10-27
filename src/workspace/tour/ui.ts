// A few helpers for driving the approved workspace the way a person does:
// click, type, choose. Tour scenes use them to open a flow part-way through,
// and the demo player uses them to act on screen. They only touch the page's
// own controls, so a scene can never do more than a visitor could.

export function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const win = (el.ownerDocument.defaultView || window) as typeof window;
  const proto = el instanceof win.HTMLSelectElement ? win.HTMLSelectElement.prototype : el instanceof win.HTMLTextAreaElement ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
}

export type Ui = {
  doc: Document;
  sleep(ms: number): Promise<void>;
  find(sel: string): HTMLElement | null;
  wait(sel: string, ms?: number): Promise<HTMLElement>;
  click(sel: string): Promise<void>;
  act(action: string): Promise<void>;
  fill(sel: string, value: string): Promise<void>;
  choose(sel: string, label: string): Promise<void>;
  tick(sel: string, on?: boolean): Promise<void>;
};

// "text=Save client" finds a button or link by its words; anything else is a
// CSS selector. Only things that are on screen count.
export function makeUi(doc: Document = document): Ui {
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const shown = (e: Element) => (e as HTMLElement).getClientRects().length > 0;
  const words = (e: Element) => (e.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  const find = (sel: string): HTMLElement | null => {
    if (sel.startsWith("text=")) {
      const want = sel.slice(5).toLowerCase();
      const all = Array.from(doc.querySelectorAll<HTMLElement>("button, a, [role=tab], summary, label")).filter(shown);
      return all.find((e) => words(e) === want) || all.find((e) => words(e).startsWith(want)) || null;
    }
    const all = Array.from(doc.querySelectorAll<HTMLElement>(sel));
    return all.find(shown) || all[0] || null;
  };
  const wait = async (sel: string, ms = 5000) => {
    const t0 = Date.now();
    for (;;) {
      const e = find(sel);
      if (e) return e;
      if (Date.now() - t0 > ms) throw new Error(`The demo screen is missing ${sel}`);
      await sleep(25);
    }
  };
  const settle = () => sleep(70);
  return {
    doc,
    sleep,
    find,
    wait,
    async click(sel) {
      (await wait(sel)).click();
      await settle();
    },
    // Any of the workspace's actions by name, even when nothing on screen
    // offers it right now (the way its own menus and links do).
    async act(action) {
      const hit = doc.querySelector<HTMLElement>(`[data-action="${action}"]`);
      if (hit) hit.click();
      else {
        const b = doc.createElement("button");
        b.dataset.action = action;
        b.hidden = true;
        doc.body.appendChild(b);
        b.click();
        b.remove();
      }
      await settle();
    },
    async fill(sel, value) {
      const el = (await wait(sel)) as HTMLInputElement;
      setValue(el, value);
      await settle();
    },
    async choose(sel, label) {
      const el = (await wait(sel)) as HTMLSelectElement;
      const want = label.toLowerCase();
      const opts = Array.from(el.options);
      const opt = opts.find((o) => o.text.trim().toLowerCase() === want) || opts.find((o) => o.value.toLowerCase() === want) || opts.find((o) => o.text.trim().toLowerCase().startsWith(want));
      if (!opt) throw new Error(`No option "${label}" in ${sel}`);
      setValue(el, opt.value);
      await settle();
    },
    async tick(sel, on = true) {
      const el = (await wait(sel)) as HTMLInputElement;
      if (el.checked !== on) el.click();
      await settle();
    },
  };
}
