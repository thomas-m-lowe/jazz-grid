"use client";
import { useState, useEffect } from "react";

export default function Leaderboard() {
  const [board, setBoard] = useState([]);
  const [error, setError] = useState("");

  // Fetch & refresh every 15s
  const load = async () => {
    try {
      const res = await fetch("/api/leaderboard");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setBoard(json.leaderboard || []);
    } catch (err) {
      console.error("❌ Leaderboard load error:", err);
      setError("Failed to load leaderboard");
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mt-8 p-4 border rounded max-w-md">
      {/* Escaped apostrophe */}
      <h2 className="text-2xl font-bold mb-2">Today&apos;s Leaderboard</h2>
      <button
        onClick={load}
        className="mb-4 bg-green-500 text-white px-3 py-1 rounded cursor-pointer"
      >
        Refresh
      </button>
      {error && <p className="text-red-600">{error}</p>}
      {board.length === 0 && !error ? (
        <p>No one has finished yet.</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="p-1">Rank</th>
              <th className="p-1">Player</th>
              <th className="p-1">Score</th>
            </tr>
          </thead>
          <tbody>
            {board.map((entry, i) => (
              <tr key={entry.username} className="border-t">
                <td className="p-1">{i + 1}</td>
                <td className="p-1">{entry.username}</td>
                <td className="p-1">{entry.total_score.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

