"use client";

import { useState, useEffect } from "react";
import { rowMusicians, columnMusicians } from "../config/musicians";
import Leaderboard from "../components/Leaderboard";

const getToday = () => new Date().toISOString().slice(0, 10);

export default function Home() {
  const [name, setName] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [grid, setGrid] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("jazzGridData");
    const today = getToday();
    let data = raw ? JSON.parse(raw) : {};

    if (!data.name) {
      setShowPrompt(true);
      data = { name: "", lastDate: today, guesses: {} };
    } else {
      setName(data.name);
      data.guesses = data.guesses || {};
      data.lastDate = data.lastDate || today;
    }

    if (data.lastDate !== today) {
      data.lastDate = today;
      data.guesses = {};
    }

    localStorage.setItem("jazzGridData", JSON.stringify(data));

    const todays = data.guesses[today] || {};
    const initial = rowMusicians.map((_, r) =>
      columnMusicians.map((_, c) => {
        const key = `${r},${c}`;
        const saved = todays[key];
        return {
          guess: saved?.album || "",
          isCorrect: saved ? true : null,
          rarity: saved?.percentage ?? null,
          cover: saved?.cover || null,
          alreadyGuessed: false,
          submitted: !!saved,
        };
      })
    );
    setGrid(initial);
    setDataLoaded(true);
  }, []);

  const handleNameSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const today = getToday();
    const data = { name: name.trim(), lastDate: today, guesses: {} };
    localStorage.setItem("jazzGridData", JSON.stringify(data));
    setShowPrompt(false);
    setGrid(
      rowMusicians.map(() =>
        columnMusicians.map(() => ({
          guess: "",
          isCorrect: null,
          rarity: null,
          cover: null,
          alreadyGuessed: false,
          submitted: false,
        }))
      )
    );
  };

  const handleInputChange = (r, c, val) => {
    const g = grid.map((row) => row.slice());
    if (!g[r]) g[r] = [];
    g[r][c] = { ...g[r][c], guess: val };
    setGrid(g);
  };

  const handleGuessSubmit = async (r, c) => {
    const cell = grid[r]?.[c];
    if (cell?.submitted) return;
    const guess = cell?.guess || "";
    const today = getToday();

    console.log(`📡 Sending guess [${r},${c}]:`, guess);

    try {
      const res = await fetch("/api/check-guess", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": name,
          "x-username": name,
        },
        body: JSON.stringify({
          row: r,
          col: c,
          rowMusician: rowMusicians[r],
          columnMusician: columnMusicians[c],
          guess,
          puzzleDate: today,
        }),
      });
      const data = await res.json();
      console.log("📥 /api/check-guess response:", data);

      const g = grid.map((row) => row.slice());
      if (!g[r]) g[r] = [];

      if (data.alreadyGuessed) {
        g[r][c] = { ...g[r][c], alreadyGuessed: true, submitted: true };
      } else if (data.correct) {
        g[r][c] = {
          guess: data.album,
          isCorrect: true,
          rarity: data.rarity,
          cover: data.cover,
          alreadyGuessed: false,
          submitted: true,
        };
        // persist locally
        const raw = JSON.parse(localStorage.getItem("jazzGridData"));
        raw.guesses = raw.guesses || {};
        const todays = raw.guesses[today] || {};
        todays[`${r},${c}`] = {
          album: data.album,
          percentage: data.rarity,
          cover: data.cover,
        };
        raw.guesses[today] = todays;
        localStorage.setItem("jazzGridData", JSON.stringify(raw));
      } else {
        g[r][c] = { ...g[r][c], isCorrect: false, submitted: true };
      }

      setGrid(g);
    } catch (err) {
      console.error("❌ Error submitting guess:", err);
    }
  };

  const handleResetGrid = async () => {
    const today = getToday();
    console.log("🔄 Resetting today's grid (client)");

    // clear server-side data
    try {
      const res = await fetch("/api/reset-grid", {
        method: "POST",
        headers: {
          "x-user-id": name,
          "x-username": name,
        },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Server reset failed");
      console.log("✅ Server grid reset successful");
    } catch (err) {
      console.error("❌ Error resetting server grid:", err);
    }

    // clear localStorage for today
    const raw = JSON.parse(localStorage.getItem("jazzGridData")) || {};
    raw.guesses = raw.guesses || {};
    raw.guesses[today] = {};
    localStorage.setItem("jazzGridData", JSON.stringify(raw));

    // reset local grid
    setGrid(
      rowMusicians.map(() =>
        columnMusicians.map(() => ({
          guess: "",
          isCorrect: null,
          rarity: null,
          cover: null,
          alreadyGuessed: false,
          submitted: false,
        }))
      )
    );
  };

  if (!dataLoaded) return null;
  if (showPrompt) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
        <form
          onSubmit={handleNameSubmit}
          className="bg-white p-6 rounded shadow-md"
        >
          <h2 className="text-xl mb-4">Enter your name to start playing</h2>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border p-2 w-full mb-4"
            placeholder="Your name"
          />
          <button
            type="submit"
            className="bg-blue-500 text-white px-4 py-2 rounded cursor-pointer"
          >
            Start
          </button>
        </form>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center p-4">
      {/* Title without "Puzzle" */}
      <h1 className="text-3xl font-bold mb-2">Jazz Grid</h1>
      <p className="mb-4">Hello, {name}!</p>

      {/* Reset button */}
      <button
        onClick={handleResetGrid}
        className="mb-4 bg-yellow-500 text-white px-3 py-1 rounded cursor-pointer"
      >
        Reset Today's Grid
      </button>

      {/* Grid */}
      <div className="overflow-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="border p-2"></th>
              {columnMusicians.map((col, ci) => (
                <th key={ci} className="border p-2 text-center">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowMusicians.map((rowName, ri) => (
              <tr key={ri}>
                <th className="border p-2 text-center">{rowName}</th>
                {columnMusicians.map((_, ci) => {
                  const cell = grid[ri]?.[ci] ?? {
                    guess: "",
                    isCorrect: null,
                    rarity: null,
                    cover: null,
                    alreadyGuessed: false,
                    submitted: false,
                  };
                  return (
                    <td
                      key={ci}
                      className="border p-2 w-40 h-32 relative"
                    >
                      {cell.submitted ? (
                        cell.alreadyGuessed ? (
                          <div className="text-center text-sm text-yellow-800">
                            Already guessed
                          </div>
                        ) : cell.isCorrect ? (
                          <div className="flex flex-col items-center">
                            {cell.cover && (
                              <img
                                src={cell.cover}
                                alt={cell.guess}
                                className="w-20 h-20 object-cover mb-1"
                              />
                            )}
                            <div className="text-xs text-gray-600">
                              {cell.rarity}%
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-red-200 text-red-600 font-bold">
                            X
                          </div>
                        )
                      ) : (
                        <div>
                          <input
                            type="text"
                            value={cell.guess}
                            onChange={(e) =>
                              handleInputChange(ri, ci, e.target.value)
                            }
                            placeholder="Album"
                            className="w-full p-1 border rounded text-sm"
                          />
                          <button
                            onClick={() => handleGuessSubmit(ri, ci)}
                            className="mt-1 w-full bg-blue-500 text-white rounded p-1 text-sm cursor-pointer"
                          >
                            Submit
                          </button>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Leaderboard */}
      <div className="w-full max-w-md mt-8">
        <Leaderboard />
      </div>

      {/* Footer: Twitter, PayPal, Instructions */}
      <footer className="mt-8 text-center space-y-4">
        <p>
          Follow me on Twitter:{" "}
          <a
            href="https://x.com/tomislowe"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline"
          >
            @tomislowe
          </a>
        </p>
        <p>
          Help me keep this site running:{" "}
          {/* PayPal donate button - replace YOUR_PAYPAL_BUSINESS_ID with yours */}
          <form
            action="https://paypal.me/jazzgrids?country.x=US&locale.x=en_US"
            method="post"
            target="_blank"
          >
            <input
              type="hidden"
              name="business"
              value="YOUR_PAYPAL_BUSINESS_ID"
            />
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded cursor-pointer"
            >
              Donate via PayPal
            </button>
          </form>
        </p>
        <div className="text-left max-w-md mx-auto">
          <h3 className="font-bold mb-1">How to play:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>
              Guess an album that both the row and column musicians played on.
              Percentage of people who guessed the same album is displayed after
              a guess — try to get the deepest cut
            </li>
            <li>Grid resets daily, check back tomorrow</li>
            <li>
              DM me on Twitter if it doesn't work/with other stuff I
              should add
            </li>
          </ol>
        </div>
      </footer>
    </main>
  );
}



