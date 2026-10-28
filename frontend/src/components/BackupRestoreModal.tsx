import React, { useState, useRef } from "react";
import { api } from "../api/client";
import { BackupImportResponse } from "../types";

interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreSuccess?: () => void;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({
  isOpen,
  onClose,
  onRestoreSuccess,
}) => {
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    setResultMessage(null);

    try {
      const blob = await api.exportBackup();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().split("T")[0];
      a.download = `grocery-optimizer-backup-${today}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setResultMessage("Backup exported successfully to your downloads folder.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to export backup.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setError(null);
    setResultMessage(null);

    try {
      const text = await file.text();
      const parsedData = JSON.parse(text);
      const res: BackupImportResponse = await api.importBackup(parsedData);

      setResultMessage(
        `Restore complete! Imported ${res.imported_lists_count} lists, ${res.imported_products_count} custom products, and ${res.imported_observations_count} prices.`
      );
      if (onRestoreSuccess) {
        onRestoreSuccess();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to parse or restore backup file.");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="backup-restore-title">
      <div className="modal-content" style={{ maxWidth: 540 }}>
        <div className="modal-header">
          <div>
            <h2 id="backup-restore-title" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
              Backup & Restore Household Data
            </h2>
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: 2 }}>
              Keep your grocery lists, custom products, and store prices safe.
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {error && (
          <div className="alert-box alert-error" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        {resultMessage && (
          <div className="alert-box alert-success" style={{ marginBottom: 12 }}>
            {resultMessage}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16, margin: "16px 0" }}>
          {/* Export Box */}
          <div style={{ padding: 16, border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-surface)" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 4 }}>
              📦 Export Full Backup
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginBottom: 12 }}>
              Save all your shopping lists, item details, custom products, and recorded prices to a portable JSON file.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? "Exporting..." : "Download Backup (.json)"}
            </button>
          </div>

          {/* Import Box */}
          <div style={{ padding: 16, border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-surface)" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 4 }}>
              🔄 Restore from Backup
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginBottom: 12 }}>
              Restore from a previously exported backup file without overwriting your existing data.
            </p>
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
            >
              {isImporting ? "Restoring Data..." : "Select Backup File (.json)"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
