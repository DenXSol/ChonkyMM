import { useState, FormEvent } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push("/");
    } else {
      setError("Invalid password");
    }
  }

  return (
    <>
      <Head><title>CHONKY MM</title></Head>
      <div style={{
        minHeight: "100vh", background: "#0D0D0D", display: "flex",
        alignItems: "center", justifyContent: "center", fontFamily: "'Courier New', monospace"
      }}>
        <div style={{
          border: "1px solid #D4A855", padding: "48px", width: "360px",
          background: "#111", boxShadow: "0 0 40px rgba(204,34,34,0.2)"
        }}>
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <div style={{ fontSize: "36px", marginBottom: "8px" }}>🐱</div>
            <h1 style={{ color: "#D4A855", fontSize: "20px", margin: 0, letterSpacing: "4px" }}>
              CHONKY MM
            </h1>
            <p style={{ color: "#666", fontSize: "12px", marginTop: "8px", letterSpacing: "2px" }}>
              MARKET MAKER DASHBOARD
            </p>
          </div>
          <form onSubmit={handleSubmit}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              style={{
                width: "100%", padding: "12px", background: "#0D0D0D",
                border: "1px solid #333", color: "#F5F0E8", fontSize: "14px",
                outline: "none", boxSizing: "border-box", letterSpacing: "2px",
                fontFamily: "inherit"
              }}
            />
            {error && (
              <p style={{ color: "#CC2222", fontSize: "12px", marginTop: "8px" }}>{error}</p>
            )}
            <button type="submit" style={{
              width: "100%", marginTop: "16px", padding: "12px",
              background: "#CC2222", color: "#F5F0E8", border: "none",
              cursor: "pointer", fontSize: "14px", letterSpacing: "3px",
              fontFamily: "inherit"
            }}>
              ENTER
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
