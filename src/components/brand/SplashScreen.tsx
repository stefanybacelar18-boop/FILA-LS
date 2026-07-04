import { BrandLogo } from "@/components/brand/BrandLogo";

/** Splash inicial — só ícone FD + carregamento, fundo igual ao app */
export function SplashScreen() {
  return (
    <div id="app-splash" className="app-splash" aria-live="polite" aria-busy="true">
      <div className="app-splash__inner">
        <BrandLogo size="auth" markOnly className="app-splash__mark" />
        <div className="app-splash__loader" role="status" aria-label="Carregando" />
      </div>
    </div>
  );
}
