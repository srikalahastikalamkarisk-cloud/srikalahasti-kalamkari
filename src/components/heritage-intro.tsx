import "./heritage-intro.css";

export default function HeritageIntro() {
  return (
    <>
      <div className="sk-heritage-intro" id="sk-independent-intro" hidden suppressHydrationWarning aria-hidden="true">
          <div className="sk-heritage-light" />
          <div className="sk-heritage-corner sk-heritage-corner-tl" />
          <div className="sk-heritage-corner sk-heritage-corner-tr" />
          <div className="sk-heritage-corner sk-heritage-corner-bl" />
          <div className="sk-heritage-corner sk-heritage-corner-br" />
          <div className="sk-heritage-medallion">
            <svg className="sk-heritage-rings" viewBox="0 0 400 400" aria-hidden="true">
              <defs>
                <linearGradient id="sk-metal-gold" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#75400e" />
                  <stop offset="18%" stopColor="#f7c65e" />
                  <stop offset="34%" stopColor="#fff4bd" />
                  <stop offset="51%" stopColor="#b96c19" />
                  <stop offset="72%" stopColor="#ffda79" />
                  <stop offset="100%" stopColor="#8b4d12" />
                </linearGradient>
              </defs>
              <circle className="sk-ring-base" cx="200" cy="200" r="171" />
              <circle className="sk-ring-outer" cx="200" cy="200" r="168" />
              <circle className="sk-ring-detail" cx="200" cy="200" r="157" />
              <circle className="sk-ring-diamonds" cx="200" cy="200" r="148" />
              <circle className="sk-ring-inner" cx="200" cy="200" r="137" />
              <circle className="sk-ring-sparkles" cx="200" cy="200" r="182" />
            </svg>
            <div className="sk-heritage-logo-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img suppressHydrationWarning
                data-src="/intro/heritage-logo.png"
                sizes="(max-width: 600px) 173px, 273px"
                loading="eager"
                fetchPriority="high"
                decoding="async"
                alt="Srikalahasti Kalamkari"
                className="sk-heritage-main-logo"
              />
            </div>
          </div>
          <div className="sk-heritage-signature">
            <span className="sk-heritage-signature-text">SRIKALAHASTI KALAMKARI</span>
            <span className="sk-heritage-writing-pen" aria-hidden="true">
              <svg viewBox="0 0 48 48">
                <path d="M9 40L16 24L34 6L42 14L24 32Z" fill="#e4ad42" stroke="#fff0ad" strokeWidth="1.5" />
                <path d="M9 40L16 24L24 32Z" fill="#a86b27" />
                <path d="M9 40L14 35" stroke="#fff4cc" strokeWidth="2" />
                <path d="M30 10L38 18" stroke="#fff0ad" strokeWidth="2" />
              </svg>
            </span>
          </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: `
(function () {
  var root = document.getElementById("sk-independent-intro");
  if (!root) return;

  var doc = document.documentElement;
  var key = "sk-heritage-intro-independent-v4";
  var img = root.querySelector(".sk-heritage-main-logo");
  var done = false;
  var started = false;
  var timers = [];

  function finish(state) {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    root.hidden = true;
    doc.dataset.skSplash = state;
  }

  var seen = false;

  try {
    seen = Boolean(sessionStorage.getItem(key));
  } catch (_) {}

  if (
    location.pathname !== "/" ||
    seen ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    !img
  ) {
    finish("skipped");
    return;
  }

  try {
    sessionStorage.setItem(key, "1");
  } catch (_) {}

  root.hidden = false;
  doc.dataset.skSplash = "loading";

  function begin() {
    if (done || started || !img.complete || !img.naturalWidth) return;
    started = true;

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (done) return;

        root.classList.add("is-ready");
        doc.dataset.skSplash = "animating";

        timers.push(setTimeout(function () {
          if (done) return;
          root.classList.add("is-closing");
          doc.dataset.skSplash = "exiting";
        }, 2900));

        timers.push(setTimeout(function () {
          finish("completed");
        }, 4200));
      });
    });
  }

  root.addEventListener("animationend", function (event) {
    if (
      event.target === root &&
      event.animationName === "sk-premium-home-reveal"
    ) {
      finish("completed");
    }
  });

  img.addEventListener("load", begin, { once: true });

  img.addEventListener("error", function () {
    finish("skipped");
  }, { once: true });

  img.src = img.dataset.src;

  if (img.complete && img.naturalWidth) begin();

  timers.push(setTimeout(function () {
    if (!started) finish("skipped");
  }, 4000));

  timers.push(setTimeout(function () {
    finish("skipped");
  }, 9000));

  window.addEventListener("pagehide", function () {
    finish("skipped");
  }, { once: true });
})();
` }} />
    </>
  );
}
