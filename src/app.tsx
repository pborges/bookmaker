import "./app.css";
import { PagePreviewModal } from "./components/PagePreviewModal";
import { PrinterProfilePanel } from "./components/PrinterProfile";
import { Settings } from "./components/Settings";
import { Sidebar } from "./components/Sidebar";
import { SheetView } from "./components/SheetView";
import { Toolbar } from "./components/Toolbar";
import { activeNotebook } from "./store";

export function App() {
  const nb = activeNotebook.value;

  if (!nb) {
    return (
      <main class="placeholder">
        <svg class="hero-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M8 10c0-2 1.5-3 4-3h11v32H12c-2.5 0-4-1-4-3V10Z"
            fill="currentColor"
            fill-opacity="0.12"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <path
            d="M40 10c0-2-1.5-3-4-3H25v32h11c2.5 0 4-1 4-3V10Z"
            fill="currentColor"
            fill-opacity="0.12"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <path d="M24 7v32" stroke="currentColor" stroke-width="2" stroke-dasharray="1 4" stroke-linecap="round" />
        </svg>
        <h1 class="wordmark">bookmaker</h1>
        <p class="tagline">Turn PDFs into printable, hand-bindable booklets.</p>
        <Toolbar />
        <p class="empty-hint">Create a notebook to get started.</p>

        <div class="feature-grid">
          <div class="feature-card">
            <div class="feature-icon">📐</div>
            <h3>Correct imposition</h3>
            <p>Fronts and Backs come out in the right order for a single-signature fold every time.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🧵</div>
            <h3>Sew guides</h3>
            <p>Optional pamphlet-stitch station marks, previewed on screen before you print a thing.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🖨️</div>
            <h3>Printer calibration</h3>
            <p>A short wizard figures out how your printer flips paper, so reloads line up.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div class="app-layout">
      <Toolbar />
      <div class="app-body">
        <Sidebar />
        <SheetView />
        <div class="right-column">
          <Settings />
          <PrinterProfilePanel />
        </div>
      </div>
      <PagePreviewModal />
    </div>
  );
}
