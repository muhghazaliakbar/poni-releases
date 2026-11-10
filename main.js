// NotchKit site: the interactive notch, the live download link and the live plugin gallery.
(() => {
  const REPO = "muhghazaliakbar/notchkit-releases";
  const REGISTRY = `https://raw.githubusercontent.com/${REPO}/main/registry/index.json`;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Real app screenshots at 2x: width of the whole image, and the opaque notch body inside it (CSS px).
  const SHOTS = {
    music:   { img: 170, body: 157 },
    focus:   { img: 177, body: 164 },
    today:   { img: 199, body: 186 },
    weather: { img: 224, body: 211 },
    prayer:  { img: 261, body: 248 },
    aiusage: { img: 241, body: 228 },
  };
  const IMG_W = 683, BODY_W = 640, CLOSED = { w: 200, h: 32 };

  const notch = document.getElementById("notch");
  const view = document.getElementById("notch-view");
  const chips = [...document.querySelectorAll(".chips button")];
  let current = "music";
  let open = false;

  // Fit the screenshot to narrow screens, keeping 16px gutters.
  const scale = () => Math.min(1, (window.innerWidth - 32) / BODY_W);

  const stage = notch.parentElement;
  const chipRow = document.querySelector(".chips");
  const tallest = Math.max(...Object.values(SHOTS).map((x) => x.body));

  function layout() {
    const s = scale();
    const shot = SHOTS[current];
    // Reserve room for the tallest page, so the headline never moves while switching.
    stage.style.minHeight = `${tallest * s + 22 + chipRow.offsetHeight + 8}px`;
    notch.style.setProperty("--img-w", `${IMG_W * s}px`);
    notch.style.setProperty("--w", open ? `${BODY_W * s}px` : `${CLOSED.w * Math.max(s, .8)}px`);
    notch.style.setProperty("--h", open ? `${shot.body * s}px` : `${CLOSED.h}px`);
  }

  function setOpen(value) {
    open = value;
    notch.setAttribute("aria-expanded", String(value));
    notch.setAttribute("aria-label", value ? "Tutup notch" : "Buka notch");
    layout();
  }

  function select(tab) {
    if (tab === current && open) return;
    chips.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.tab === tab)));
    const swap = () => {
      current = tab;
      view.src = `assets/notch-${tab}.webp`;
      view.height = SHOTS[tab].img;
      layout();
    };
    if (!open || reduceMotion) { swap(); setOpen(true); return; }
    // Same order as the app: content blurs out, the shape resizes, the new page comes in.
    notch.classList.add("is-switching");
    setTimeout(() => {
      swap();
      const done = () => notch.classList.remove("is-switching");
      view.decode ? view.decode().then(done, done) : done();
    }, 140);
  }

  notch.addEventListener("click", () => setOpen(!open));
  // Like the app: resting the pointer on the notch opens it.
  let hoverTimer;
  notch.addEventListener("pointerenter", (e) => {
    if (e.pointerType !== "mouse" || open) return;
    hoverTimer = setTimeout(() => setOpen(true), 120);
  });
  notch.addEventListener("pointerleave", () => clearTimeout(hoverTimer));
  chips.forEach((c) => c.addEventListener("click", () => select(c.dataset.tab)));
  window.addEventListener("resize", layout);

  // Preload the other screenshots so switching never shows an empty notch.
  Object.keys(SHOTS).forEach((k) => { if (k !== current) new Image().src = `assets/notch-${k}.webp`; });

  layout();
  // The one orchestrated moment: the notch opens by itself shortly after load.
  setTimeout(() => setOpen(true), reduceMotion ? 0 : 700);

  // Menu bar clock.
  const clock = document.getElementById("clock");
  const tick = () => {
    clock.textContent = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short",
      hour: "2-digit", minute: "2-digit" }).format(new Date());
  };
  tick();
  setInterval(tick, 30_000);

  // Download button: point straight at the newest DMG (falls back to the releases page).
  fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((release) => {
      const dmg = (release.assets || []).find((a) => a.name.endsWith(".dmg"));
      const version = (release.tag_name || "").replace(/^v/, "");
      if (dmg) {
        const link = document.getElementById("download");
        link.href = dmg.browser_download_url;
        link.textContent = `Unduh NotchKit ${version}`;
      }
      const date = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" })
        .format(new Date(release.published_at));
      document.getElementById("version-line").textContent = `NotchKit ${version}, dirilis ${date}.`;
    })
    .catch(() => {});

  // Gallery: render the live registry, the same list the app shows.
  const PERMISSIONS = { network: "internet", system: "info sistem", "ai-usage": "log AI lokal",
    calendar: "kalender", clipboard: "clipboard", notifications: "notifikasi", media: "musik" };
  fetch(REGISTRY)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((index) => {
      const list = document.getElementById("gallery");
      list.replaceChildren(...index.plugins.map((p) => {
        const li = document.createElement("li");
        const name = document.createElement("strong");
        name.textContent = p.name;
        const desc = document.createElement("span");
        desc.textContent = p.description || "";
        li.append(name, desc);
        const perms = (p.permissions || []).map((x) => PERMISSIONS[x] || x);
        if (perms.length) {
          const em = document.createElement("em");
          em.textContent = `Meminta izin: ${perms.join(", ")}`;
          li.append(em);
        }
        return li;
      }));
      document.getElementById("gallery-source").textContent =
        `${index.plugins.length} plugin di galeri saat ini. Versi gratis bisa mengaktifkan 3 plugin tambahan sekaligus.`;
    })
    .catch(() => {});
})();
