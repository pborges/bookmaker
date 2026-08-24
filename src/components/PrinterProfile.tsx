import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { CALIBRATION_OUTCOMES, generateCalibrationSheet } from "../core/calibration";
import {
  activeNotebook,
  activePrinterProfile,
  createPrinterProfile,
  deletePrinterProfile,
  printerProfiles,
  setNotebookPrinterProfile,
} from "../store";

function downloadCalibrationSheet(bytes: Uint8Array): void {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bookmaker-calibration.pdf";
  a.click();
  URL.revokeObjectURL(url);
}

export function PrinterProfilePanel(): JSX.Element | null {
  const nb = activeNotebook.value;
  const [wizardOpen, setWizardOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");

  if (!nb) return null;

  const onDownloadSheet = async () => {
    const bytes = await generateCalibrationSheet();
    downloadCalibrationSheet(bytes);
  };

  const onPickOutcome = (outcome: (typeof CALIBRATION_OUTCOMES)[number]) => {
    const name = newProfileName.trim() || "My printer";
    const profile = createPrinterProfile(name, outcome.outputFacing, outcome.reloadFlip);
    setNotebookPrinterProfile(profile.id);
    setWizardOpen(false);
    setNewProfileName("");
  };

  return (
    <section class="settings printer-profile">
      <h2>Printer</h2>

      {printerProfiles.value.length > 0 && (
        <label class="settings-row">
          Profile
          <select
            value={nb.printerProfileId ?? ""}
            onChange={(e) => setNotebookPrinterProfile((e.target as HTMLSelectElement).value || undefined)}
          >
            <option value="">Not calibrated</option>
            {printerProfiles.value.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {activePrinterProfile.value && (
        <button
          class="link-button"
          onClick={() => deletePrinterProfile(activePrinterProfile.value!.id)}
        >
          Delete this profile
        </button>
      )}

      {!activePrinterProfile.value && (
        <div class="calibration-banner">Not calibrated — print one test sheet first, or export with defaults.</div>
      )}

      {wizardOpen ? (
        <div class="calibration-wizard">
          <label class="settings-row">
            Printer name
            <input
              type="text"
              value={newProfileName}
              onInput={(e) => setNewProfileName((e.target as HTMLInputElement).value)}
              placeholder="e.g. Office laser"
            />
          </label>
          <ol class="calibration-steps">
            <li>
              <button onClick={onDownloadSheet}>Download test sheet</button> and print it.
            </li>
            <li>Reload the sheet exactly how you'd reload a real stack, then print any single page to its back.</li>
            <li>Compare side two to side one and pick what happened:</li>
          </ol>
          <ul class="calibration-outcomes">
            {CALIBRATION_OUTCOMES.map((outcome) => (
              <li key={outcome.label}>
                <button onClick={() => onPickOutcome(outcome)}>{outcome.label}</button>
                <p>{outcome.description}</p>
              </li>
            ))}
          </ul>
          <button class="link-button" onClick={() => setWizardOpen(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button onClick={() => setWizardOpen(true)}>Calibrate a printer</button>
      )}
    </section>
  );
}
