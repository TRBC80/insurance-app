
"use client";

import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  function handleFileChange(e) {
    const picked = e.target.files && e.target.files[0];
    setError("");
    setResult("");
    if (picked && picked.type !== "application/pdf") {
      setError("Please choose a PDF file.");
      setFile(null);
      return;
    }
    setFile(picked || null);
  }

  async function handleAnalyze() {
    if (!file) {
      setError("Choose a PDF first.");
      return;
    }
    setLoading(true);
    setError("");
    setResult("");
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("The analyzer returned an error (" + res.status + ").");
      }

      const data = await res.json();
      // Be flexible about what the API route names its output.
      const text =
        data.result || data.analysis || data.text || data.message || "";
      setResult(text || "No text came back. We'll check the analyzer next.");
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <style>{keyframes}</style>

      <header style={styles.header}>
        <div style={styles.brand}>Insurance in English</div>
      </header>

      <section style={styles.hero}>
        <h1 style={styles.h1}>Understand your insurance policy in plain English</h1>
        <p style={styles.sub}>
          Upload your policy PDF and get a clear, jargon-free breakdown of what
          you&rsquo;re actually covered for &mdash; and what you&rsquo;re not.
        </p>
      </section>

      <section style={styles.card}>
        <label style={styles.uploadLabel}>
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            style={styles.hiddenInput}
          />
          <span style={styles.uploadInner}>
            {file ? "\u2713 " + file.name : "Tap to choose your policy PDF"}
          </span>
        </label>

        <button
          onClick={handleAnalyze}
          disabled={loading || !file}
          style={{
            ...styles.button,
            ...(loading || !file ? styles.buttonDisabled : {}),
          }}
        >
          {loading ? "Analyzing\u2026" : "Analyze my policy"}
        </button>

        {loading && (
          <div style={styles.loadingRow}>
            <span style={styles.spinner} />
            <span style={styles.loadingText}>
              Reading your policy&hellip; this can take up to a minute.
            </span>
          </div>
        )}

        {error && <div style={styles.error}>{error}</div>}
      </section>

      {result && (
        <section style={styles.resultCard}>
          <h2 style={styles.resultTitle}>Your plain-English breakdown</h2>
          <div style={styles.resultText}>{result}</div>
        </section>
      )}

      <footer style={styles.footer}>
        This tool provides a plain-language summary for convenience only and is
        not legal or insurance advice. Always confirm details with your insurer.
      </footer>
    </main>
  );
}

const keyframes =
  "@keyframes spin { to { transform: rotate(360deg); } }";

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f6f7f9",
    color: "#1a2233",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    padding: "0 20px 60px",
  },
  header: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "24px 0",
  },
  brand: {
    fontWeight: 700,
    fontSize: 18,
    color: "#173153",
    letterSpacing: "-0.01em",
  },
  hero: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "24px 0 8px",
    textAlign: "center",
  },
  h1: {
    fontSize: 34,
    lineHeight: 1.15,
    fontWeight: 800,
    color: "#173153",
    margin: "0 0 16px",
    letterSpacing: "-0.02em",
  },
  sub: {
    fontSize: 17,
    lineHeight: 1.6,
    color: "#54627a",
    margin: 0,
  },
  card: {
    maxWidth: 560,
    margin: "32px auto 0",
    background: "#ffffff",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 1px 3px rgba(23,49,83,0.08), 0 8px 24px rgba(23,49,83,0.06)",
  },
  uploadLabel: {
    display: "block",
    cursor: "pointer",
  },
  hiddenInput: {
    display: "none",
  },
  uploadInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 96,
    border: "2px dashed #c7d0dd",
    borderRadius: 12,
    color: "#54627a",
    fontSize: 15,
    fontWeight: 600,
    textAlign: "center",
    padding: 16,
    background: "#fbfcfd",
  },
  button: {
    width: "100%",
    marginTop: 16,
    padding: "16px 20px",
    fontSize: 16,
    fontWeight: 700,
    color: "#ffffff",
    background: "#2563eb",
    border: "none",
    borderRadius: 12,
    cursor: "pointer",
  },
  buttonDisabled: {
    background: "#aebfdc",
    cursor: "not-allowed",
  },
  loadingRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
  },
  spinner: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    border: "3px solid #d7deea",
    borderTopColor: "#2563eb",
    animation: "spin 0.8s linear infinite",
    display: "inline-block",
  },
  loadingText: {
    fontSize: 14,
    color: "#54627a",
  },
  error: {
    marginTop: 16,
    padding: "12px 14px",
    background: "#fdecec",
    color: "#b42318",
    borderRadius: 10,
    fontSize: 14,
  },
  resultCard: {
    maxWidth: 720,
    margin: "24px auto 0",
    background: "#ffffff",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 1px 3px rgba(23,49,83,0.08), 0 8px 24px rgba(23,49,83,0.06)",
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: "#173153",
    margin: "0 0 12px",
  },
  resultText: {
    whiteSpace: "pre-wrap",
    lineHeight: 1.7,
    fontSize: 15,
    color: "#2b3547",
  },
  footer: {
    maxWidth: 720,
    margin: "48px auto 0",
    fontSize: 12,
    lineHeight: 1.6,
    color: "#8a94a6",
    textAlign: "center",
  },
};
