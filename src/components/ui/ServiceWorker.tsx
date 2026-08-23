"use client";

import { useEffect } from "react";

/** Service worker yalnızca üretimde kaydedilir; geliştirmede önbellek
 *  karışıklığı yaratmasın diye devre dışı bırakılır. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* kayıt başarısız olursa uygulama normal çalışmaya devam eder */
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
