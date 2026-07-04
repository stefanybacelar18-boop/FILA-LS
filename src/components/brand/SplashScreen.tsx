import { BrandLogo } from "@/components/brand/BrandLogo";

/** Splash inicial — visível no primeiro paint, removida pelo SplashScreenDismiss */
export function SplashScreen() {
  return (
    <div id="app-splash" className="app-splash" aria-live="polite" aria-busy="true">
      <div className="app-splash__inner">
        <BrandLogo size="auth" variant="stacked" />
        <div className="app-splash__loader" role="status" aria-label="Carregando" />
      </div>
    </div>
  );
}
